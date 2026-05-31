import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";

import type { SupabaseLike } from "@soulsync/core/src/jobs/pipeline";
import { runProfileCardJob } from "@soulsync/core/src/jobs/profileCardPipeline";

const rootDir = new URL("../../../../../../", import.meta.url);

describe("profile card pipeline (real Supabase)", () => {
  test("runProfileCardJob generates + persists a card from a queued job", async () => {
    const env = readSupabaseEnv();
    const url = process.env.SUPABASE_URL ?? env.API_URL ?? "http://127.0.0.1:54321";
    const serviceKey = env.SERVICE_ROLE_KEY ?? env.SECRET_KEY;
    const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const appUserId = randomUUID();
    const authId = randomUUID();
    const profileId = randomUUID();
    const persona = {
      id: profileId,
      displayName: "민지",
      ageRange: "20s",
      city: "서울",
      mbti: "INFP",
      interests: ["독서", "산책", "재즈"],
      boundaries: ["연봉/정확한 위치 비공개"],
      is_synthetic: true,
    };

    try {
      await expectOk(client.from("app_users").insert({ id: appUserId, supabase_user_id: authId, primary_email: `qa-card-${appUserId}@example.test`, display_name: "QA Card", age_verified: true, is_synthetic: true }));
      await expectOk(client.from("profiles").insert({ id: profileId, app_user_id: appUserId, city: "서울", district: "강남구", mbti: "INFP", visibility: "discoverable", is_synthetic: true, persona_spec: persona }));
      const jobInsert = await client.from("profile_card_jobs").insert({ app_user_id: appUserId, status: "queued" }).select("id").single<{ id: string }>();
      expect(jobInsert.error).toBeNull();
      const jobId = jobInsert.data?.id ?? "";

      const result = await runProfileCardJob(jobId, { client: client as unknown as SupabaseLike });

      expect(result.status).toBe("succeeded");
      expect(result.cardWritten).toBe(true);

      const cards = await client.from("profile_cards").select("html, css, placeholders, is_synthetic, status").eq("app_user_id", appUserId).returns<Array<{ html: string; css: string; placeholders: unknown; is_synthetic: boolean; status: string }>>();
      expect(cards.error).toBeNull();
      expect(cards.data?.length).toBe(1);
      const card = cards.data?.[0];
      expect(card?.status).toBe("ready");
      expect(card?.is_synthetic).toBe(true);
      expect(card?.html).toContain("민지");
      expect(card?.html).not.toContain("<script");
      expect(Array.isArray(card?.placeholders)).toBe(true);

      const job = await client.from("profile_card_jobs").select("status").eq("id", jobId).single<{ status: string }>();
      expect(job.data?.status).toBe("succeeded");
    } finally {
      await client.from("profile_cards").delete().eq("app_user_id", appUserId);
      await client.from("profile_card_jobs").delete().eq("app_user_id", appUserId);
      await client.from("profiles").delete().eq("id", profileId);
      await client.from("app_users").delete().eq("id", appUserId);
    }
  });
});

async function expectOk(query: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await query;
  expect(error).toBeNull();
}

function readSupabaseEnv(): Record<string, string> {
  const output = execFileSync("supabase", ["status", "-o", "env"], { cwd: rootDir, encoding: "utf8" });
  return Object.fromEntries([...output.matchAll(/^([A-Z0-9_]+)="([^"]*)"$/gm)].map((match) => [match[1], match[2]]));
}
