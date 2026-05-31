import { createHash } from "node:crypto";

import { actorFromClaims, verifyOAuthAccessToken } from "@soulsync/core/src/identity/index";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const supabaseHolder = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock("../../lib/supabase", () => ({
  getServiceSupabase: () => supabaseHolder.client,
}));

import { GET as getAuthorizationServerMetadata } from "../.well-known/oauth-authorization-server/route";
import { GET as getProtectedResourceMetadata } from "../.well-known/oauth-protected-resource/route";
import { GET as authorize } from "./authorize/route";
import { resetOAuthServerState } from "./lib";
import { POST as registerClient } from "./register/route";
import { POST as exchangeToken } from "./token/route";

const issuer = "http://localhost:3004";
const audience = "http://localhost:3004/api/mcp";
const jwtSecret = "soulsync-oauth-as-test-secret-with-enough-entropy";
const redirectUri = "https://client.example/callback";
const supabaseToken = "supabase-access-token";
const supabaseUserId = "97000000-0000-0000-0000-000000000001";
const appUserId = "97000000-0000-0000-0000-000000000101";

describe("OAuth authorization server routes", () => {
  beforeEach(() => {
    vi.stubEnv("OAUTH_ISSUER", issuer);
    vi.stubEnv("OAUTH_AUDIENCE", audience);
    vi.stubEnv("OAUTH_AS_JWT_SECRET", jwtSecret);
    supabaseHolder.client = new FakeOAuthSupabase();
    resetOAuthServerState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetOAuthServerState();
  });

  test("metadata advertises auth-code PKCE and dynamic client registration", async () => {
    const response = await getAuthorizationServerMetadata(new Request(`${issuer}/.well-known/oauth-authorization-server`));
    const metadata = await response.json();

    expect(response.status).toBe(200);
    expect(metadata).toMatchObject({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
    });
  });

  test("protected-resource metadata advertises OAuth by default", async () => {
    const response = await getProtectedResourceMetadata(new Request(`${issuer}/.well-known/oauth-protected-resource`));
    const metadata = await response.json();

    expect(response.status).toBe(200);
    expect(metadata).toMatchObject({
      resource: issuer,
      authorization_servers: ["http://localhost:8787/oauth-stub"],
      scopes_supported: ["profile.read", "profile.write", "match.run"],
      bearer_methods_supported: ["header"],
    });
  });

  test("DEMO_NOAUTH hides protected-resource OAuth metadata so clients call tools without OAuth discovery", async () => {
    vi.stubEnv("DEMO_NOAUTH", "1");

    const response = await getProtectedResourceMetadata(new Request(`${issuer}/.well-known/oauth-protected-resource`));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  test("dynamic client registration returns a client_id", async () => {
    const response = await registerClient(jsonRequest(`${issuer}/oauth/register`, { redirect_uris: [redirectUri], client_name: "PKCE Test Client" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.client_id).toMatch(/^soulsync_client_/u);
    expect(body.redirect_uris).toEqual([redirectUri]);
    expect(body.token_endpoint_auth_method).toBe("none");
  });

  test("PKCE authorization code exchange issues a verifiable MCP access token", async () => {
    const client = await registerPkceClient();
    const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~pkce";
    const challenge = pkceChallenge(verifier);
    const code = await authorizeAndReadCode(client.clientId, challenge, "profile.read match.run");
    const response = await exchangeToken(
      formRequest(`${issuer}/oauth/token`, {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: client.clientId,
        code_verifier: verifier,
      }),
    );
    const token = await response.json();

    expect(response.status).toBe(200);
    expect(token).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "profile.read match.run" });
    expect(typeof token.access_token).toBe("string");

    const claims = await verifyOAuthAccessToken(token.access_token, { requiredScopes: ["profile.read", "match.run"] });
    const actor = actorFromClaims(claims);

    expect(claims).toMatchObject({
      iss: issuer,
      aud: audience,
      sub: supabaseUserId,
      appUserId,
      email: "oauth-user@example.test",
      scopes: ["profile.read", "match.run"],
    });
    expect(actor.appUserId).toBe(appUserId);
  });

  test("wrong PKCE verifier is rejected", async () => {
    const client = await registerPkceClient();
    const code = await authorizeAndReadCode(client.clientId, pkceChallenge("correct-verifier-with-enough-length"), "profile.read");
    const response = await exchangeToken(
      formRequest(`${issuer}/oauth/token`, {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: client.clientId,
        code_verifier: "wrong-verifier-with-enough-length",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: "invalid_grant" });
  });

  test("unauthenticated authorize request is rejected", async () => {
    const client = await registerPkceClient();
    const url = authorizationUrl(client.clientId, pkceChallenge("valid-verifier-with-enough-length"), "profile.read");
    const response = await authorize(new Request(url));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ error: "login_required" });
  });
});

type RegisteredClient = { clientId: string };

const registerPkceClient = async (): Promise<RegisteredClient> => {
  const response = await registerClient(jsonRequest(`${issuer}/oauth/register`, { redirect_uris: [redirectUri], client_name: "PKCE Test Client" }));
  const body = (await response.json()) as { client_id: string };

  return { clientId: body.client_id };
};

const authorizeAndReadCode = async (clientId: string, challenge: string, scope: string): Promise<string> => {
  const response = await authorize(
    new Request(authorizationUrl(clientId, challenge, scope), {
      headers: { authorization: `Bearer ${supabaseToken}` },
    }),
  );
  const location = response.headers.get("location");

  expect(response.status).toBe(302);
  expect(location).toBeTruthy();

  return new URL(String(location)).searchParams.get("code") ?? "";
};

const authorizationUrl = (clientId: string, challenge: string, scope: string): string => {
  const url = new URL(`${issuer}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", "test-state");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
};

const jsonRequest = (url: string, body: Record<string, unknown>): Request =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const formRequest = (url: string, body: Record<string, string>): Request =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

const pkceChallenge = (verifier: string): string => createHash("sha256").update(verifier).digest("base64url");

class FakeOAuthSupabase {
  readonly auth = {
    getUser: async (token: string) => {
      if (token !== supabaseToken) {
        return { data: { user: null }, error: new Error("invalid token") };
      }

      return {
        data: {
          user: {
            id: supabaseUserId,
            email: "oauth-user@example.test",
            user_metadata: { name: "OAuth User" },
          },
        },
        error: null,
      };
    },
  };
  rows: Record<string, Record<string, unknown>[]> = {
    app_users: [{ id: appUserId, supabase_user_id: supabaseUserId, primary_email: "oauth-user@example.test", display_name: "OAuth User" }],
    external_identities: [],
  };

  from(table: string): FakeOAuthQuery {
    return new FakeOAuthQuery(this, table);
  }
}

class FakeOAuthQuery implements PromiseLike<{ data: Record<string, unknown>[]; error: null }> {
  private filters: Array<[string, unknown]> = [];
  private operation: "select" | "insert" | "upsert" = "select";
  private payload: Record<string, unknown> | null = null;

  constructor(private readonly client: FakeOAuthSupabase, private readonly table: string) {}

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  insert(payload: Record<string, unknown>): this {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  upsert(payload: Record<string, unknown>): this {
    this.operation = "upsert";
    this.payload = payload;
    return this;
  }

  async maybeSingle<T = Record<string, unknown>>(): Promise<{ data: T | null; error: null }> {
    const result = await this.execute();

    return { data: (result.data[0] as T | undefined) ?? null, error: null };
  }

  async single<T = Record<string, unknown>>(): Promise<{ data: T | null; error: Error | null }> {
    const result = await this.execute();

    return { data: (result.data[0] as T | undefined) ?? null, error: result.data[0] ? null : new Error("not found") };
  }

  then<TResult1 = { data: Record<string, unknown>[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Record<string, unknown>[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: Record<string, unknown>[]; error: null }> {
    const table = this.client.rows[this.table] ?? [];

    if (this.operation === "insert") {
      const inserted = { id: `${this.table}-${table.length + 1}`, ...this.payload };
      table.push(inserted);
      this.client.rows[this.table] = table;
      return { data: [inserted], error: null };
    }

    if (this.operation === "upsert") {
      const payload = this.payload ?? {};
      const existing = table.find((row) => row.provider === payload.provider && row.provider_subject === payload.provider_subject);
      if (existing) {
        Object.assign(existing, payload);
        return { data: [existing], error: null };
      }
      const inserted = { id: `${this.table}-${table.length + 1}`, ...payload };
      table.push(inserted);
      this.client.rows[this.table] = table;
      return { data: [inserted], error: null };
    }

    return { data: table.filter((row) => this.filters.every(([column, value]) => row[column] === value)), error: null };
  }
}
