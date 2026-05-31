import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";

const rootDir = new URL("../../../../", import.meta.url);

describe("RLS policies", () => {
  test("User A cannot read User B private profile or recommendations", async () => {
    const env = readSupabaseEnv();
    const userA = randomUUID();
    const userB = randomUUID();
    const authA = randomUUID();
    const authB = randomUUID();
    const profileA = randomUUID();
    const profileB = randomUUID();
    const jobB = randomUUID();
    const recommendationB = randomUUID();

    try {
      psql(`
        insert into public.app_users (id, supabase_user_id, primary_email, display_name, age_verified) values
          ('${userA}'::uuid, '${authA}'::uuid, 'rls-${userA}@example.test', 'RLS User A', true),
          ('${userB}'::uuid, '${authB}'::uuid, 'rls-${userB}@example.test', 'RLS User B', true);

        insert into public.profiles (id, app_user_id, city, visibility, profile_text) values
          ('${profileA}'::uuid, '${userA}'::uuid, 'Seoul', 'private', 'owned by A'),
          ('${profileB}'::uuid, '${userB}'::uuid, 'Busan', 'private', 'owned by B');

        insert into public.match_jobs (id, app_user_id, status) values
          ('${jobB}'::uuid, '${userB}'::uuid, 'succeeded');

        insert into public.recommendations (id, job_id, app_user_id, candidate_id, rank, overall, summary_ko) values
          ('${recommendationB}'::uuid, '${jobB}'::uuid, '${userB}'::uuid, '${userA}'::uuid, 1, 95, 'private recommendation for B');
      `);

      const tokenA = supabaseJwt(authA, env.JWT_SECRET);
      const headers = {
        apikey: env.ANON_KEY,
        authorization: `Bearer ${tokenA}`,
      };

      const profileResponse = await fetch(`${supabaseUrl(env)}/rest/v1/profiles?id=eq.${profileB}&select=id`, { headers });
      expect(profileResponse.ok).toBe(true);
      expect(await profileResponse.json()).toEqual([]);

      const recommendationsResponse = await fetch(`${supabaseUrl(env)}/rest/v1/recommendations?id=eq.${recommendationB}&select=id`, { headers });
      expect(recommendationsResponse.ok).toBe(true);
      expect(await recommendationsResponse.json()).toEqual([]);
    } finally {
      psql(`
        delete from public.recommendations where id = '${recommendationB}'::uuid;
        delete from public.match_jobs where id = '${jobB}'::uuid;
        delete from public.profiles where id in ('${profileA}'::uuid, '${profileB}'::uuid);
        delete from public.app_users where id in ('${userA}'::uuid, '${userB}'::uuid);
      `);
    }
  });
});

function readSupabaseEnv(): Record<string, string> {
  const output = execFileSync("supabase", ["status", "-o", "env"], { cwd: rootDir, encoding: "utf8" });
  return Object.fromEntries([...output.matchAll(/^([A-Z0-9_]+)="([^"]*)"$/gm)].map((match) => [match[1], match[2]]));
}

function supabaseUrl(env: Record<string, string>): string {
  return process.env.SUPABASE_URL ?? env.API_URL ?? "http://127.0.0.1:54321";
}

function supabaseJwt(sub: string, secret: string): string {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson({
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 7200,
    iss: "supabase-demo",
    role: "authenticated",
    sub,
  });
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function psql(sql: string): void {
  execFileSync("docker", ["exec", "-i", "supabase_db_soulsync-ai", "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
}
