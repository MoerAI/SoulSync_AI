import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { issueOAuthAccessToken, OAUTH_RESOURCE_SCOPES } from "@soulsync/core/src/identity/index";
import { getServiceSupabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

export type OAuthClient = {
  clientId: string;
  redirectUris: string[];
  clientName?: string;
  scope?: string;
  issuedAt: number;
};

export type AuthorizationCode = {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  supabaseUserId: string;
  appUserId: string;
  email?: string;
  name?: string;
  expiresAt: number;
};

export type SupabaseOAuthUser = {
  supabaseUserId: string;
  appUserId: string;
  email?: string;
  name?: string;
};

const oauthStore = getOAuthStore();
const clients = oauthStore.clients;
const codes = oauthStore.codes;
const supabaseProvider = "supabase_auth";
const authorizationCodeLifetimeMs = 5 * 60 * 1000;

export const scopesSupported = [...OAUTH_RESOURCE_SCOPES];

export function resetOAuthServerState(): void {
  clients.clear();
  codes.clear();
}

export function issuerFromRequest(request: Request): string {
  return (process.env.OAUTH_ISSUER ?? new URL(request.url).origin).replace(/\/$/u, "");
}

export function audienceFromEnv(): string {
  const audience = process.env.OAUTH_AUDIENCE;
  if (!audience) {
    throw new OAuthRouteError("server_error", "OAUTH_AUDIENCE must be configured", 500);
  }

  return audience;
}

export function registerOAuthClient(input: Record<string, unknown>): OAuthClient {
  const redirectUris = readStringArray(input.redirect_uris);
  if (redirectUris.length === 0 || redirectUris.some((uri) => !isAllowedRedirectUri(uri))) {
    throw new OAuthRouteError("invalid_client_metadata", "redirect_uris must contain absolute HTTPS URLs or localhost HTTP URLs", 400);
  }

  const authMethod = typeof input.token_endpoint_auth_method === "string" ? input.token_endpoint_auth_method : "none";
  if (authMethod !== "none") {
    throw new OAuthRouteError("invalid_client_metadata", "Only public PKCE clients with token_endpoint_auth_method=none are supported", 400);
  }

  const grantTypes = readStringArray(input.grant_types);
  if (grantTypes.length > 0 && !grantTypes.includes("authorization_code")) {
    throw new OAuthRouteError("invalid_client_metadata", "Only authorization_code grant clients are supported", 400);
  }

  const responseTypes = readStringArray(input.response_types);
  if (responseTypes.length > 0 && !responseTypes.includes("code")) {
    throw new OAuthRouteError("invalid_client_metadata", "Only code response clients are supported", 400);
  }

  const client: OAuthClient = {
    clientId: `soulsync_client_${randomUUID()}`,
    redirectUris,
    clientName: typeof input.client_name === "string" ? input.client_name : undefined,
    scope: typeof input.scope === "string" ? normalizeScope(input.scope).join(" ") : undefined,
    issuedAt: Math.floor(Date.now() / 1000),
  };
  clients.set(client.clientId, client);

  return client;
}

export async function createAuthorizationCode(request: Request): Promise<{ code: AuthorizationCode; state?: string }> {
  const url = new URL(request.url);
  const clientId = requiredSearchParam(url, "client_id");
  const client = clients.get(clientId);
  if (!client) {
    throw new OAuthRouteError("invalid_client", "Unknown client_id", 400);
  }

  if (requiredSearchParam(url, "response_type") !== "code") {
    throw new OAuthRouteError("unsupported_response_type", "Only response_type=code is supported", 400);
  }

  const redirectUri = requiredSearchParam(url, "redirect_uri");
  if (!client.redirectUris.includes(redirectUri)) {
    throw new OAuthRouteError("invalid_request", "redirect_uri is not registered for this client", 400);
  }

  if (requiredSearchParam(url, "code_challenge_method") !== "S256") {
    throw new OAuthRouteError("invalid_request", "code_challenge_method must be S256", 400);
  }

  const codeChallenge = requiredSearchParam(url, "code_challenge");
  const scopes = normalizeScope(url.searchParams.get("scope") ?? "profile.read");
  if (scopes.length === 0 || scopes.some((scope) => !scopesSupported.includes(scope as (typeof scopesSupported)[number]))) {
    throw new OAuthRouteError("invalid_scope", "Requested scope is not supported", 400);
  }

  const user = await requireSupabaseOAuthUser(request);
  const code: AuthorizationCode = {
    code: `soulsync_code_${randomUUID()}`,
    clientId,
    redirectUri,
    codeChallenge,
    scopes,
    supabaseUserId: user.supabaseUserId,
    appUserId: user.appUserId,
    email: user.email,
    name: user.name,
    expiresAt: Date.now() + authorizationCodeLifetimeMs,
  };
  codes.set(code.code, code);

  return { code, state: url.searchParams.get("state") ?? undefined };
}

export async function exchangeAuthorizationCode(input: Record<string, string>): Promise<Record<string, unknown>> {
  if (input.grant_type !== "authorization_code") {
    throw new OAuthRouteError("unsupported_grant_type", "Only authorization_code grant is supported", 400);
  }

  const client = clients.get(input.client_id ?? "");
  const code = codes.get(input.code ?? "");
  if (!client || !code || code.clientId !== client.clientId || code.redirectUri !== input.redirect_uri || Date.now() > code.expiresAt) {
    throw new OAuthRouteError("invalid_grant", "Authorization code is invalid or expired", 400);
  }

  const verifier = input.code_verifier ?? "";
  if (!verifier || !safeEqual(pkceChallenge(verifier), code.codeChallenge)) {
    throw new OAuthRouteError("invalid_grant", "code_verifier does not match the authorization request", 400);
  }

  codes.delete(code.code);
  const accessToken = await issueOAuthAccessToken({
    subject: code.supabaseUserId,
    appUserId: code.appUserId,
    email: code.email,
    name: code.name,
    scopes: code.scopes,
    audience: audienceFromEnv(),
    expiresInSeconds: 3600,
  });

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: code.scopes.join(" "),
  };
}

export async function readRequestBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => undefined);

    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  }

  const form = await request.formData();
  const output: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      output[key] = value;
    }
  }

  return output;
}

export function oauthJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export class OAuthRouteError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = "OAuthRouteError";
  }
}

export function oauthError(error: unknown): Response {
  if (error instanceof OAuthRouteError) {
    return oauthJson({ error: error.code, error_description: error.message }, error.status);
  }

  return oauthJson({ error: "server_error", error_description: error instanceof Error ? error.message : "Unexpected OAuth server error" }, 500);
}

async function requireSupabaseOAuthUser(request: Request): Promise<SupabaseOAuthUser> {
  const accessToken = bearerToken(request.headers.get("authorization"));
  if (!accessToken) {
    throw new OAuthRouteError("login_required", "Authorize with a Supabase Auth bearer token before requesting an OAuth code", 401);
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.auth.getUser(accessToken);
  const user = data.user;
  if (error || !user) {
    throw new OAuthRouteError("login_required", "Supabase Auth session is invalid", 401);
  }

  return resolveSupabaseOAuthUser(String(user.id), typeof user.email === "string" ? user.email : undefined, readUserName(user.user_metadata));
}

async function resolveSupabaseOAuthUser(supabaseUserId: string, email?: string, name?: string): Promise<SupabaseOAuthUser> {
  const supabase = getServiceSupabase();
  const normalizedEmail = email ? email.trim().toLowerCase() : undefined;
  const { data: bySupabaseUserId } = await supabase
    .from("app_users")
    .select("id, primary_email, display_name")
    .eq("supabase_user_id", supabaseUserId)
    .maybeSingle<AppUserRow>();

  if (bySupabaseUserId) {
    await ensureSupabaseExternalIdentity(bySupabaseUserId.id, supabaseUserId, normalizedEmail, name);

    return { supabaseUserId, appUserId: bySupabaseUserId.id, email: normalizedEmail ?? bySupabaseUserId.primary_email ?? undefined, name: name ?? bySupabaseUserId.display_name ?? undefined };
  }

  if (normalizedEmail) {
    const { data: byEmail } = await supabase.from("app_users").select("id, primary_email, display_name").eq("primary_email", normalizedEmail).maybeSingle<AppUserRow>();
    if (byEmail) {
      await supabase.from("external_identities").insert({
        provider: supabaseProvider,
        provider_subject: supabaseUserId,
        email: normalizedEmail,
        raw_claims: { sub: supabaseUserId, email: normalizedEmail, name, link_status: "pending", conflicting_app_user_id: byEmail.id },
      });
      throw new OAuthRouteError("account_link_required", "Supabase email matches an existing app user; explicit account linking is required", 403);
    }
  }

  const { data: created, error } = await supabase
    .from("app_users")
    .insert({ supabase_user_id: supabaseUserId, primary_email: normalizedEmail ?? null, display_name: name ?? normalizedEmail ?? supabaseUserId })
    .select("id, primary_email, display_name")
    .single<AppUserRow>();

  if (error || !created) {
    throw new OAuthRouteError("server_error", "Unable to create app user for Supabase identity", 500);
  }

  await ensureSupabaseExternalIdentity(created.id, supabaseUserId, normalizedEmail, name);

  return { supabaseUserId, appUserId: created.id, email: normalizedEmail, name: name ?? created.display_name ?? undefined };
}

async function ensureSupabaseExternalIdentity(appUserId: string, supabaseUserId: string, email?: string, name?: string): Promise<void> {
  await getServiceSupabase()
    .from("external_identities")
    .upsert(
      {
        app_user_id: appUserId,
        provider: supabaseProvider,
        provider_subject: supabaseUserId,
        email: email ?? null,
        raw_claims: { sub: supabaseUserId, email, name, app_user_id: appUserId, link_status: "linked" },
      },
      { onConflict: "provider,provider_subject" },
    );
}

function requiredSearchParam(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) {
    throw new OAuthRouteError("invalid_request", `${name} is required`, 400);
  }

  return value;
}

function normalizeScope(scope: string): string[] {
  return scope.split(" ").map((entry) => entry.trim()).filter(Boolean);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function isAllowedRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);

    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch {
    return false;
  }
}

function bearerToken(authorization: string | null): string | undefined {
  const [type, token] = authorization?.split(" ") ?? [];

  return type?.toLowerCase() === "bearer" && token ? token : undefined;
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readUserName(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }
  const record = metadata as Record<string, unknown>;
  const name = record.name ?? record.full_name;

  return typeof name === "string" ? name : undefined;
}

type AppUserRow = {
  id: string;
  primary_email: string | null;
  display_name: string | null;
};

type OAuthStore = {
  clients: Map<string, OAuthClient>;
  codes: Map<string, AuthorizationCode>;
};

function getOAuthStore(): OAuthStore {
  const key = Symbol.for("soulsync.oauth.store");
  const globalStore = globalThis as typeof globalThis & { [key]?: OAuthStore };
  globalStore[key] ??= { clients: new Map<string, OAuthClient>(), codes: new Map<string, AuthorizationCode>() };

  return globalStore[key];
}
