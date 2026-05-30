import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  actorFromClaims,
  resolveOrCreateAppUser,
  verifyOAuthAccessToken,
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
  secret: process.env.OAUTH_STUB_JWT_SECRET,
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
    restoreEnv("OAUTH_STUB_JWT_SECRET", originalEnv.secret);
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
