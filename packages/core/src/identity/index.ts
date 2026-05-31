import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from "jose";

import type { Actor } from "../types";

export const OPENAI_APPS_OAUTH_PROVIDER = "openai_apps_oauth";
export const OAUTH_RESOURCE_SCOPES = ["profile.read", "profile.write", "match.run"] as const;
export const DEFAULT_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
export const LOCAL_STUB_ISSUER = "http://localhost:8787/oauth-stub";
export const DEMO_NOAUTH_SUBJECT = "demo-user";

const defaultRequiredScopes = ["profile.read"];

export type OAuthErrorCode = "invalid_token" | "insufficient_scope" | "server_error";

export class OAuthAccessTokenError extends Error {
  readonly code: OAuthErrorCode;
  readonly status: number;

  constructor(code: OAuthErrorCode, message: string, status = 401) {
    super(message);
    this.name = "OAuthAccessTokenError";
    this.code = code;
    this.status = status;
  }
}

export type OAuthAccessTokenClaims = {
  iss: string;
  aud: string | string[];
  exp: number;
  iat?: number;
  sub: string;
  scopes: string[];
  email?: string;
  name?: string;
  appUserId?: string;
  pendingLinkId?: string;
  raw: JWTPayload;
};

export type VerifyOAuthAccessTokenOptions = {
  issuer?: string;
  audience?: string;
  requiredScopes?: readonly string[];
  jwksUrl?: string;
  asSecret?: string;
  stubSecret?: string;
};

export type IssueOAuthAccessTokenInput = {
  subject: string;
  appUserId: string;
  scopes: readonly string[];
  issuer?: string;
  audience?: string;
  secret?: string;
  email?: string;
  name?: string;
  expiresInSeconds?: number;
  issuedAt?: number;
};

export type StoredAppUser = {
  id: string;
  primaryEmail: string | null;
  displayName: string | null;
};

export type StoredExternalIdentity = {
  id: string;
  appUserId: string | null;
  provider: string;
  providerSubject: string;
  email: string | null;
  rawClaims: Record<string, unknown> | null;
};

export type IdentityClient = {
  findExternalIdentity(input: { provider: string; providerSubject: string }): Promise<StoredExternalIdentity | null>;
  findAppUserByEmail(email: string): Promise<StoredAppUser | null>;
  createAppUser(input: { primaryEmail?: string; displayName?: string }): Promise<StoredAppUser>;
  upsertExternalIdentity(input: {
    appUserId: string;
    provider: string;
    providerSubject: string;
    email?: string | null;
    rawClaims: Record<string, unknown>;
  }): Promise<StoredExternalIdentity>;
  createPendingExternalIdentity(input: {
    provider: string;
    providerSubject: string;
    email?: string | null;
    rawClaims: Record<string, unknown>;
    conflictingAppUserId: string;
  }): Promise<StoredExternalIdentity>;
};

export type IdentityResolution = {
  status: "linked" | "created" | "pending-link";
  appUserId?: string;
  externalIdentityId?: string;
  pendingLinkId?: string;
  claims: OAuthAccessTokenClaims;
};

export type McpActor = Actor & {
  appUserId: string;
  scopes: string[];
};

export type SupabaseJwtIdentityClient = {
  findAppUserBySupabaseUserId(supabaseUserId: string): Promise<StoredAppUser | null>;
};

export type ActorFromSupabaseJwtOptions = {
  issuer?: string;
  audience?: string;
  jwtSecret?: string;
};

export type WithMcpAuthOptions = VerifyOAuthAccessTokenOptions & {
  required?: boolean;
  resourceMetadataPath?: string;
  resourceUrl?: string;
};

export const issueOAuthAccessToken = async (input: IssueOAuthAccessTokenInput): Promise<string> => {
  const issuer = input.issuer ?? readEnv("OAUTH_ISSUER");
  const audience = input.audience ?? readEnv("OAUTH_AUDIENCE");
  const secret = input.secret ?? readEnv("OAUTH_AS_JWT_SECRET");

  if (!issuer || !audience || !secret) {
    throw new OAuthAccessTokenError("server_error", "OAUTH_ISSUER, OAUTH_AUDIENCE, and OAUTH_AS_JWT_SECRET must be configured", 500);
  }

  const now = input.issuedAt ?? Math.floor(Date.now() / 1000);
  const expiresInSeconds = input.expiresInSeconds ?? 3600;

  return new SignJWT({
    scope: [...input.scopes].join(" "),
    app_user_id: input.appUserId,
    email: input.email ? normalizeEmail(input.email) : undefined,
    name: input.name,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(input.subject)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(new TextEncoder().encode(secret));
};

export const verifyOAuthAccessToken = async (token: string, options: VerifyOAuthAccessTokenOptions = {}): Promise<OAuthAccessTokenClaims> => {
  const issuer = options.issuer ?? readEnv("OAUTH_ISSUER");
  const audience = options.audience ?? readEnv("OAUTH_AUDIENCE");

  if (!issuer || !audience) {
    throw new OAuthAccessTokenError("server_error", "OAuth issuer and audience must be configured", 500);
  }

  let payload: JWTPayload;
  try {
    const verified = await verifyJwt(token, issuer, audience, options);
    payload = verified.payload;
  } catch (error) {
    if (error instanceof OAuthAccessTokenError) {
      throw error;
    }

    throw new OAuthAccessTokenError("invalid_token", "Invalid OAuth access token");
  }

  const sub = readStringClaim(payload, "sub");
  const iss = readStringClaim(payload, "iss");
  const aud = payload.aud;
  const exp = readNumberClaim(payload, "exp");
  const scopes = readScopes(payload);
  const missingScopes = (options.requiredScopes ?? defaultRequiredScopes).filter((scope) => !scopes.includes(scope));

  if (missingScopes.length > 0) {
    throw new OAuthAccessTokenError("insufficient_scope", `Missing required OAuth scope: ${missingScopes.join(" ")}`);
  }

  return {
    iss,
    aud: Array.isArray(aud) ? aud : readStringClaim(payload, "aud"),
    exp,
    iat: typeof payload.iat === "number" ? payload.iat : undefined,
    sub,
    scopes,
    email: typeof payload.email === "string" ? normalizeEmail(payload.email) : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    appUserId: readOptionalStringClaim(payload, "app_user_id") ?? readOptionalStringClaim(payload, "appUserId"),
    raw: payload,
  };
};

export const resolveOrCreateAppUser = async (claims: OAuthAccessTokenClaims, client: IdentityClient): Promise<IdentityResolution> => {
  const email = claims.email ? normalizeEmail(claims.email) : undefined;
  const existingIdentity = await client.findExternalIdentity({ provider: OPENAI_APPS_OAUTH_PROVIDER, providerSubject: claims.sub });

  if (existingIdentity?.appUserId) {
    return linkedResolution("linked", claims, existingIdentity.appUserId, existingIdentity.id);
  }

  if (existingIdentity && !existingIdentity.appUserId) {
    return {
      status: "pending-link",
      pendingLinkId: existingIdentity.id,
      claims: { ...claims, pendingLinkId: existingIdentity.id },
    };
  }

  if (email) {
    const appUserWithEmail = await client.findAppUserByEmail(email);

    if (appUserWithEmail) {
      const pendingIdentity = await client.createPendingExternalIdentity({
        provider: OPENAI_APPS_OAUTH_PROVIDER,
        providerSubject: claims.sub,
        email,
        conflictingAppUserId: appUserWithEmail.id,
        rawClaims: pendingRawClaims(claims, appUserWithEmail.id),
      });

      return {
        status: "pending-link",
        pendingLinkId: pendingIdentity.id,
        claims: { ...claims, pendingLinkId: pendingIdentity.id },
      };
    }
  }

  const appUser = await client.createAppUser({ primaryEmail: email, displayName: claims.name ?? email ?? claims.sub });
  const externalIdentity = await client.upsertExternalIdentity({
    appUserId: appUser.id,
    provider: OPENAI_APPS_OAUTH_PROVIDER,
    providerSubject: claims.sub,
    email,
    rawClaims: linkedRawClaims(claims, appUser.id),
  });

  return linkedResolution("created", claims, appUser.id, externalIdentity.id);
};

export const actorFromClaims = (claims: OAuthAccessTokenClaims, appUserId = claims.appUserId): McpActor => {
  if (!appUserId) {
    throw new OAuthAccessTokenError("invalid_token", "OAuth claims are not linked to an app user");
  }

  return {
    source: "mcp",
    id: appUserId,
    appUserId,
    scopes: [...claims.scopes],
  };
};

export const actorFromSupabaseJwt = async (request: Request, client: SupabaseJwtIdentityClient, options: ActorFromSupabaseJwtOptions = {}): Promise<McpActor> => {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) {
    throw new OAuthAccessTokenError("invalid_token", "No authorization provided");
  }

  const jwtSecret = options.jwtSecret ?? readEnv("SUPABASE_JWT_SECRET");
  const issuer = options.issuer ?? supabaseIssuer();
  const audience = options.audience ?? readEnv("SUPABASE_JWT_AUDIENCE") ?? "authenticated";
  if (!jwtSecret) {
    throw new OAuthAccessTokenError("server_error", "SUPABASE_JWT_SECRET must be configured", 500);
  }

  let payload: JWTPayload;
  try {
    payload = (await jwtVerify(token, new TextEncoder().encode(jwtSecret), { issuer, audience })).payload;
  } catch {
    throw new OAuthAccessTokenError("invalid_token", "Invalid Supabase Auth token");
  }

  const supabaseUserId = readStringClaim(payload, "sub");
  const appUser = await client.findAppUserBySupabaseUserId(supabaseUserId);
  if (!appUser) {
    throw new OAuthAccessTokenError("invalid_token", "Supabase identity is not linked to an app user");
  }

  return {
    source: "mobile",
    id: appUser.id,
    appUserId: appUser.id,
    scopes: ["profile.read", "profile.write", "match.run"],
  };
};

export const withMcpAuth = (
  handler: (request: Request, claims: OAuthAccessTokenClaims) => Response | Promise<Response>,
  options: WithMcpAuthOptions = {},
): ((request: Request) => Promise<Response>) => {
  const required = options.required ?? true;

  return async (request) => {
    const token = bearerToken(request.headers.get("authorization"));

    if (!token) {
      if (demoNoAuthEnabled()) {
        const claims = demoNoAuthClaims(request, options);
        attachRequestAuth(request, "demo-noauth", claims);

        return handler(request, claims);
      }

      if (!required) {
        return handler(request, undefined as unknown as OAuthAccessTokenClaims);
      }

      return authErrorResponse(request, options, new OAuthAccessTokenError("invalid_token", "No authorization provided"));
    }

    try {
      const claims = await verifyOAuthAccessToken(token, options);
      attachRequestAuth(request, token, claims);

      return handler(request, claims);
    } catch (error) {
      if (error instanceof OAuthAccessTokenError) {
        return authErrorResponse(request, options, error);
      }

      return authErrorResponse(request, options, new OAuthAccessTokenError("invalid_token", "Invalid OAuth access token"));
    }
  };
};

const demoNoAuthClaims = (request: Request, options: WithMcpAuthOptions): OAuthAccessTokenClaims => {
  const now = Math.floor(Date.now() / 1000);
  const issuer = readEnv("OAUTH_ISSUER") ?? new URL(request.url).origin;
  const audience = options.audience ?? readEnv("OAUTH_AUDIENCE") ?? options.resourceUrl ?? new URL(request.url).origin;
  const raw: JWTPayload = {
    iss: issuer,
    aud: audience,
    sub: DEMO_NOAUTH_SUBJECT,
    iat: now,
    exp: now + 3600,
    scope: OAUTH_RESOURCE_SCOPES.join(" "),
  };

  return {
    iss: issuer,
    aud: audience,
    exp: now + 3600,
    iat: now,
    sub: DEMO_NOAUTH_SUBJECT,
    scopes: [...OAUTH_RESOURCE_SCOPES],
    raw,
  };
};

const attachRequestAuth = (request: Request, token: string, claims: OAuthAccessTokenClaims): void => {
  Object.defineProperty(request, "auth", {
    configurable: true,
    value: {
      token,
      clientId: claims.sub,
      scopes: claims.scopes,
      expiresAt: claims.exp,
    },
  });
};

const verifyJwt = async (token: string, issuer: string, audience: string, options: VerifyOAuthAccessTokenOptions) => {
  const asSecret = options.asSecret ?? readEnv("OAUTH_AS_JWT_SECRET");
  if (asSecret) {
    return jwtVerify(token, new TextEncoder().encode(asSecret), { issuer, audience });
  }

  if (isLocalStubIssuer(issuer)) {
    const secret = options.stubSecret ?? readEnv("OAUTH_STUB_JWT_SECRET");

    if (!secret) {
      throw new OAuthAccessTokenError("server_error", "OAUTH_STUB_JWT_SECRET must be configured for the local OAuth stub issuer", 500);
    }

    return jwtVerify(token, new TextEncoder().encode(secret), { issuer, audience });
  }

  const jwksUrl = options.jwksUrl ?? readEnv("OAUTH_JWKS_URL");

  if (!jwksUrl) {
    throw new OAuthAccessTokenError("server_error", "OAUTH_JWKS_URL must be configured for non-stub OAuth issuers", 500);
  }

  return jwtVerify(token, createRemoteJWKSet(new URL(jwksUrl)), { issuer, audience });
};

const linkedResolution = (
  status: "linked" | "created",
  claims: OAuthAccessTokenClaims,
  appUserId: string,
  externalIdentityId: string,
): IdentityResolution => ({
  status,
  appUserId,
  externalIdentityId,
  claims: { ...claims, appUserId },
});

const linkedRawClaims = (claims: OAuthAccessTokenClaims, appUserId: string): Record<string, unknown> => ({
  ...claims.raw,
  scope: claims.scopes.join(" "),
  app_user_id: appUserId,
  link_status: "linked",
});

const pendingRawClaims = (claims: OAuthAccessTokenClaims, conflictingAppUserId: string): Record<string, unknown> => ({
  ...claims.raw,
  scope: claims.scopes.join(" "),
  conflicting_app_user_id: conflictingAppUserId,
  link_status: "pending",
});

const readStringClaim = (payload: JWTPayload, claim: "aud" | "iss" | "sub"): string => {
  const value = payload[claim];

  if (typeof value !== "string") {
    throw new OAuthAccessTokenError("invalid_token", `OAuth token is missing ${claim}`);
  }

  return value;
};

const readNumberClaim = (payload: JWTPayload, claim: "exp"): number => {
  const value = payload[claim];

  if (typeof value !== "number") {
    throw new OAuthAccessTokenError("invalid_token", `OAuth token is missing ${claim}`);
  }

  return value;
};

const readOptionalStringClaim = (payload: JWTPayload, claim: "app_user_id" | "appUserId"): string | undefined => {
  const value = payload[claim];

  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const readScopes = (payload: JWTPayload): string[] => {
  const scope = payload.scope;
  const scp = payload.scp;

  if (typeof scope === "string") {
    return scope.split(" ").map((value) => value.trim()).filter(Boolean);
  }

  if (Array.isArray(scp)) {
    return scp.filter((value): value is string => typeof value === "string" && value.length > 0);
  }

  return [];
};

const bearerToken = (authorization: string | null): string | undefined => {
  const [type, token] = authorization?.split(" ") ?? [];

  return type?.toLowerCase() === "bearer" && token ? token : undefined;
};

const authErrorResponse = (request: Request, options: WithMcpAuthOptions, error: OAuthAccessTokenError): Response => {
  const challenge = wwwAuthenticate(request, options, error);

  return new Response(
    JSON.stringify({
      error: error.code,
      error_description: error.message,
      _meta: {
        "mcp/www_authenticate": challenge,
      },
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": challenge,
      },
    },
  );
};

const wwwAuthenticate = (request: Request, options: WithMcpAuthOptions, error: OAuthAccessTokenError): string => {
  const metadataUrl = resourceMetadataUrl(request, options);
  const scopes = (options.requiredScopes ?? defaultRequiredScopes).join(" ");
  const params = [
    `resource_metadata="${escapeHeaderValue(metadataUrl)}"`,
    `error="${escapeHeaderValue(error.code)}"`,
    `error_description="${escapeHeaderValue(error.message)}"`,
  ];

  if (scopes) {
    params.push(`scope="${escapeHeaderValue(scopes)}"`);
  }

  return `Bearer ${params.join(", ")}`;
};

const resourceMetadataUrl = (request: Request, options: WithMcpAuthOptions): string => {
  const path = options.resourceMetadataPath ?? DEFAULT_RESOURCE_METADATA_PATH;
  const baseUrl = options.resourceUrl ?? new URL(request.url).origin;

  return new URL(path, baseUrl).toString();
};

const escapeHeaderValue = (value: string): string => value.split("\\").join("\\\\").split('"').join('\\"');

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const demoNoAuthEnabled = (): boolean => readEnv("DEMO_NOAUTH") === "1";

const readEnv = (key: string): string | undefined => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

  return env?.[key];
};

const supabaseIssuer = (): string | undefined => {
  const configured = readEnv("SUPABASE_JWT_ISSUER");
  if (configured) {
    return configured;
  }
  const url = readEnv("SUPABASE_URL");

  return url ? `${url.replace(/\/$/u, "")}/auth/v1` : undefined;
};

const isLocalStubIssuer = (issuer: string): boolean => {
  const url = new URL(issuer);

  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || issuer === LOCAL_STUB_ISSUER;
};
