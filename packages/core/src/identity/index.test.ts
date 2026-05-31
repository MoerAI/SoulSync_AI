import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  actorFromClaims,
  issueOAuthAccessToken,
  OAuthAccessTokenError,
  resolveOrCreateAppUser,
  verifyOAuthAccessToken,
  withMcpAuth,
  type IdentityClient,
  type StoredAppUser,
  type StoredExternalIdentity,
} from "./index";

const stubIssuer = "http://localhost:8787/oauth-stub";
const audience = "http://localhost:3000/api/mcp";
const stubSecret = "soulsync-oauth-stub-test-secret";
const provider = "openai_apps_oauth";
const requiredScopes = ["profile.read", "profile.write", "match.run"];
const testRun = `task15-${randomUUID()}`;

const originalEnv = {
  issuer: process.env.OAUTH_ISSUER,
  audience: process.env.OAUTH_AUDIENCE,
  asSecret: process.env.OAUTH_AS_JWT_SECRET,
  secret: process.env.OAUTH_STUB_JWT_SECRET,
  demoNoAuth: process.env.DEMO_NOAUTH,
};

describe("OAuth access token identity linking", () => {
  beforeAll(() => {
    process.env.OAUTH_ISSUER = stubIssuer;
    process.env.OAUTH_AUDIENCE = audience;
    process.env.OAUTH_STUB_JWT_SECRET = stubSecret;
    cleanupTestRows();
  });

  afterAll(() => {
    cleanupTestRows();
    restoreEnv("OAUTH_ISSUER", originalEnv.issuer);
    restoreEnv("OAUTH_AUDIENCE", originalEnv.audience);
    restoreEnv("OAUTH_AS_JWT_SECRET", originalEnv.asSecret);
    restoreEnv("OAUTH_STUB_JWT_SECRET", originalEnv.secret);
    restoreEnv("DEMO_NOAUTH", originalEnv.demoNoAuth);
  });

  test("first-party authorization server token verifies with app user claims", async () => {
    const issuer = "http://localhost:3004";
    const asSecret = "soulsync-oauth-as-test-secret-with-enough-entropy";
    const appUserId = "99000000-0000-0000-0000-000000000777";

    const token = await issueOAuthAccessToken({
      subject: `${testRun}:supabase-user`,
      appUserId,
      email: `${testRun}-as@example.test`,
      name: "AS User",
      scopes: ["profile.read", "match.run"],
      issuer,
      audience,
      secret: asSecret,
      expiresInSeconds: 3600,
    });
    const claims = await verifyOAuthAccessToken(token, { issuer, audience, asSecret, requiredScopes: ["profile.read", "match.run"] });
    const actor = actorFromClaims(claims);

    expect(claims).toMatchObject({
      iss: issuer,
      aud: audience,
      sub: `${testRun}:supabase-user`,
      appUserId,
      email: `${testRun}-as@example.test`,
      name: "AS User",
      scopes: ["profile.read", "match.run"],
    });
    expect(actor).toMatchObject({ source: "mcp", id: appUserId, appUserId, scopes: ["profile.read", "match.run"] });
  });

  test("first-party authorization server token rejects wrong audience and expiry", async () => {
    const issuer = "http://localhost:3004";
    const asSecret = "soulsync-oauth-as-test-secret-with-enough-entropy";

    const wrongAudience = await issueOAuthAccessToken({
      subject: `${testRun}:as-wrong-aud`,
      appUserId: "99000000-0000-0000-0000-000000000778",
      scopes: ["profile.read"],
      issuer,
      secret: asSecret,
      audience: "http://localhost:3000/not-mcp",
    });
    const expired = await issueOAuthAccessToken({
      subject: `${testRun}:as-expired`,
      appUserId: "99000000-0000-0000-0000-000000000779",
      scopes: ["profile.read"],
      issuer,
      audience,
      secret: asSecret,
      expiresInSeconds: -60,
    });

    await expect(verifyOAuthAccessToken(wrongAudience, { issuer, audience, asSecret })).rejects.toMatchObject({ code: "invalid_token" });
    await expect(verifyOAuthAccessToken(expired, { issuer, audience, asSecret })).rejects.toMatchObject({ code: "invalid_token" });
  });

  test("DEMO_NOAUTH lets withMcpAuth proceed without a bearer token using full demo scopes", async () => {
    process.env.DEMO_NOAUTH = "1";
    let observedClaims: Awaited<ReturnType<typeof captureClaims>> | undefined;
    const handler = withMcpAuth(async (_request, claims) => {
      observedClaims = captureClaims(claims);
      return new Response("ok");
    });

    const response = await handler(new Request(`${audience}/demo`));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(observedClaims).toMatchObject({
      sub: "demo-user",
      scopes: ["profile.read", "profile.write", "match.run"],
      appUserId: undefined,
    });
  });

  test("DEMO_NOAUTH leaves bearer-token validation unchanged when a token is present", async () => {
    process.env.DEMO_NOAUTH = "1";
    const handler = withMcpAuth(async () => new Response("ok"));

    const response = await handler(new Request(`${audience}/demo`, { headers: { authorization: "Bearer not-a-jwt" } }));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe("invalid_token");
  });

  test("unset DEMO_NOAUTH still rejects missing bearer tokens with the OAuth challenge", async () => {
    delete process.env.DEMO_NOAUTH;
    let handlerCalled = false;
    const handler = withMcpAuth(async () => {
      handlerCalled = true;
      return new Response("ok");
    });

    const response = await handler(new Request(`${audience}/demo`));
    const body = (await response.json()) as { error: string; error_description: string };

    expect(handlerCalled).toBe(false);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata=");
    expect(body).toMatchObject({ error: "invalid_token", error_description: "No authorization provided" });
  });

  test("DEMO_NOAUTH demo claims resolve through one fixed demo app user", async () => {
    process.env.DEMO_NOAUTH = "1";
    let demoClaims: Awaited<ReturnType<typeof captureClaims>> | undefined;
    const handler = withMcpAuth(async (_request, claims) => {
      demoClaims = captureClaims(claims);
      return new Response("ok");
    });

    await handler(new Request(`${audience}/demo`));
    if (!demoClaims) {
      throw new Error("expected demo claims");
    }

    const first = await resolveOrCreateAppUser({ ...demoClaims, raw: demoClaims.raw }, memoryIdentityClient());
    const second = await resolveOrCreateAppUser({ ...demoClaims, raw: demoClaims.raw }, memoryIdentityClient(first.appUserId));

    expect(first.status).toBe("created");
    expect(first.appUserId).toBe("demo-app-user");
    expect(second.status).toBe("linked");
    expect(second.appUserId).toBe("demo-app-user");
    expect(second.claims.appUserId).toBe("demo-app-user");
  });

  test("valid local stub token resolves to an app user and creates identity rows", async () => {
    const subject = `${testRun}:valid-subject`;
    const email = `${testRun}-valid@example.test`;
    const token = await signStubToken({ subject, email });

    const claims = await verifyOAuthAccessToken(token, { requiredScopes });
    const resolution = await resolveOrCreateAppUser(claims, psqlIdentityClient);
    const actor = actorFromClaims(resolution.claims);

    expect(claims.sub).toBe(subject);
    expect(claims.scopes).toEqual(requiredScopes);
    expect(resolution.status).toBe("created");
    expect(resolution.appUserId).toMatch(uuidPattern);
    expect(actor).toMatchObject({
      source: "mcp",
      id: resolution.appUserId,
      appUserId: resolution.appUserId,
      scopes: requiredScopes,
    });

    const rows = selectRows<{
      appUserId: string;
      primaryEmail: string;
      provider: string;
      providerSubject: string;
      identityEmail: string;
      rawSub: string;
    }>(`
      select
        u.id::text as "appUserId",
        u.primary_email as "primaryEmail",
        e.provider,
        e.provider_subject as "providerSubject",
        e.email as "identityEmail",
        e.raw_claims->>'sub' as "rawSub"
      from public.external_identities e
      join public.app_users u on u.id = e.app_user_id
      where e.provider = ${sqlString(provider)}
        and e.provider_subject = ${sqlString(subject)}
    `);

    expect(rows).toEqual([
      {
        appUserId: resolution.appUserId,
        primaryEmail: email,
        provider,
        providerSubject: subject,
        identityEmail: email,
        rawSub: subject,
      },
    ]);
  });

  test("wrong audience, expired token, and missing scope are rejected", async () => {
    const wrongAudience = await signStubToken({
      subject: `${testRun}:wrong-aud`,
      email: `${testRun}-wrong-aud@example.test`,
      audienceOverride: "http://localhost:3000/not-the-mcp-resource",
    });
    const expired = await signStubToken({
      subject: `${testRun}:expired`,
      email: `${testRun}-expired@example.test`,
      expiresInSeconds: -60,
    });
    const missingScope = await signStubToken({
      subject: `${testRun}:missing-scope`,
      email: `${testRun}-missing-scope@example.test`,
      scopes: ["profile.read"],
    });

    await expect(verifyOAuthAccessToken(wrongAudience, { requiredScopes })).rejects.toMatchObject({ code: "invalid_token" });
    await expect(verifyOAuthAccessToken(expired, { requiredScopes })).rejects.toMatchObject({ code: "invalid_token" });
    await expect(verifyOAuthAccessToken(missingScope, { requiredScopes })).rejects.toMatchObject({ code: "insufficient_scope" });
  });

  test("email collision creates a pending link and does not silently merge", async () => {
    const email = `${testRun}-collision@example.test`;
    const subject = `${testRun}:collision-openai`;
    const existingUser = insertAppUser({ primaryEmail: email, displayName: "Existing Supabase User" });
    insertExternalIdentity({
      appUserId: existingUser.id,
      provider: "supabase",
      providerSubject: `${testRun}:supabase-user`,
      email,
      rawClaims: { sub: `${testRun}:supabase-user`, provider: "supabase" },
    });

    const token = await signStubToken({ subject, email });
    const claims = await verifyOAuthAccessToken(token, { requiredScopes });
    const resolution = await resolveOrCreateAppUser(claims, psqlIdentityClient);

    expect(resolution.status).toBe("pending-link");
    expect(resolution.appUserId).toBeUndefined();
    expect(resolution.pendingLinkId).toMatch(uuidPattern);

    const identities = selectRows<{
      id: string;
      appUserId: string | null;
      provider: string;
      providerSubject: string;
      email: string;
      rawClaims: { link_status?: string; conflicting_app_user_id?: string; sub?: string };
    }>(`
      select
        id::text as id,
        app_user_id::text as "appUserId",
        provider,
        provider_subject as "providerSubject",
        email,
        raw_claims as "rawClaims"
      from public.external_identities
      where provider = ${sqlString(provider)}
        and provider_subject = ${sqlString(subject)}
    `);
    const appUsersWithEmail = selectRows<{ id: string }>(`
      select id::text as id
      from public.app_users
      where lower(primary_email) = lower(${sqlString(email)})
    `);

    expect(identities).toHaveLength(1);
    expect(identities[0]).toMatchObject({
      appUserId: null,
      provider,
      providerSubject: subject,
      email,
    });
    expect(identities[0].rawClaims).toMatchObject({
      link_status: "pending",
      conflicting_app_user_id: existingUser.id,
      sub: subject,
    });
    expect(appUsersWithEmail).toEqual([{ id: existingUser.id }]);
  });
});

type CapturedClaims = {
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
  raw: Record<string, unknown>;
};

const captureClaims = (claims: Parameters<Parameters<typeof withMcpAuth>[0]>[1]): CapturedClaims => ({
  iss: claims.iss,
  aud: claims.aud,
  exp: claims.exp,
  iat: claims.iat,
  sub: claims.sub,
  scopes: claims.scopes,
  email: claims.email,
  name: claims.name,
  appUserId: claims.appUserId,
  pendingLinkId: claims.pendingLinkId,
  raw: claims.raw,
});

const memoryIdentityClient = (existingDemoAppUserId?: string): IdentityClient => {
  const identities = new Map<string, StoredExternalIdentity>();
  if (existingDemoAppUserId) {
    identities.set(`${provider}:demo-user`, {
      id: "demo-external-identity",
      appUserId: existingDemoAppUserId,
      provider,
      providerSubject: "demo-user",
      email: null,
      rawClaims: { sub: "demo-user", app_user_id: existingDemoAppUserId },
    });
  }

  return {
    async findExternalIdentity(input) {
      return identities.get(`${input.provider}:${input.providerSubject}`) ?? null;
    },
    async findAppUserByEmail() {
      return null;
    },
    async createAppUser() {
      return { id: "demo-app-user", primaryEmail: null, displayName: "demo-user" };
    },
    async upsertExternalIdentity(input) {
      const identity = {
        id: "demo-external-identity",
        appUserId: input.appUserId,
        provider: input.provider,
        providerSubject: input.providerSubject,
        email: input.email ?? null,
        rawClaims: input.rawClaims,
      };
      identities.set(`${input.provider}:${input.providerSubject}`, identity);
      return identity;
    },
    async createPendingExternalIdentity() {
      throw new OAuthAccessTokenError("server_error", "demo claims must not create pending identities", 500);
    },
  };
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const signStubToken = async ({
  subject,
  email,
  scopes = requiredScopes,
  audienceOverride = audience,
  expiresInSeconds = 3600,
}: {
  subject: string;
  email: string;
  scopes?: string[];
  audienceOverride?: string;
  expiresInSeconds?: number;
}): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ email, name: `User ${subject}`, scope: scopes.join(" ") })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(stubIssuer)
    .setAudience(audienceOverride)
    .setSubject(subject)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(new TextEncoder().encode(stubSecret));
};

const psqlIdentityClient: IdentityClient = {
  async findExternalIdentity({ provider, providerSubject }) {
    return selectRows<StoredExternalIdentity>(`
      select
        id::text as id,
        app_user_id::text as "appUserId",
        provider,
        provider_subject as "providerSubject",
        email,
        raw_claims as "rawClaims"
      from public.external_identities
      where provider = ${sqlString(provider)}
        and provider_subject = ${sqlString(providerSubject)}
      limit 1
    `)[0] ?? null;
  },
  async findAppUserByEmail(email) {
    return selectRows<StoredAppUser>(`
      select
        id::text as id,
        primary_email as "primaryEmail",
        display_name as "displayName"
      from public.app_users
      where lower(primary_email) = lower(${sqlString(email)})
      limit 1
    `)[0] ?? null;
  },
  async createAppUser(input) {
    return insertAppUser(input);
  },
  async upsertExternalIdentity(input) {
    return insertExternalIdentity(input);
  },
  async createPendingExternalIdentity(input) {
    return insertExternalIdentity({ ...input, appUserId: null });
  },
};

const insertAppUser = ({ primaryEmail, displayName }: { primaryEmail?: string; displayName?: string }): StoredAppUser => {
  const rows = selectRows<StoredAppUser>(`
    insert into public.app_users (primary_email, display_name)
    values (${sqlString(primaryEmail ?? null)}, ${sqlString(displayName ?? null)})
    returning id::text as id, primary_email as "primaryEmail", display_name as "displayName"
  `);

  return rows[0];
};

const insertExternalIdentity = ({
  appUserId,
  provider,
  providerSubject,
  email,
  rawClaims,
}: {
  appUserId: string | null;
  provider: string;
  providerSubject: string;
  email?: string | null;
  rawClaims: Record<string, unknown>;
}): StoredExternalIdentity => {
  const rows = selectRows<StoredExternalIdentity>(`
    insert into public.external_identities (app_user_id, provider, provider_subject, email, raw_claims)
    values (${sqlString(appUserId)}, ${sqlString(provider)}, ${sqlString(providerSubject)}, ${sqlString(email ?? null)}, ${jsonb(rawClaims)})
    on conflict (provider, provider_subject)
    do update set
      app_user_id = excluded.app_user_id,
      email = excluded.email,
      raw_claims = excluded.raw_claims
    returning
      id::text as id,
      app_user_id::text as "appUserId",
      provider,
      provider_subject as "providerSubject",
      email,
      raw_claims as "rawClaims"
  `);

  return rows[0];
};

const cleanupTestRows = (): void => {
  psql(`
    delete from public.external_identities
    where provider_subject like ${sqlString(`${testRun}:%`)}
      or email like ${sqlString(`${testRun}-%@example.test`)};
    delete from public.app_users
    where primary_email like ${sqlString(`${testRun}-%@example.test`)};
  `);
};

const selectRows = <Row>(sql: string): Row[] => {
  const output = psql(`with result_rows as (${sql}) select coalesce(json_agg(row_to_json(result_rows)), '[]'::json) from result_rows;`);

  return JSON.parse(output || "[]") as Row[];
};

const psql = (sql: string): string =>
  execFileSync("docker", ["exec", "-i", "supabase_db_soulsync-ai", "psql", "-U", "postgres", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
  }).trim();

const sqlString = (value: string | null): string => (value === null ? "null" : `'${value.split("'").join("''")}'`);

const jsonb = (value: Record<string, unknown>): string => `${sqlString(JSON.stringify(value))}::jsonb`;

const restoreEnv = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
};
