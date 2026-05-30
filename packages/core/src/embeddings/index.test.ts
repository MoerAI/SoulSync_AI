import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";

import type { Profile } from "../types";
import { buildProfileText, embed } from "./index";

const profile: Profile = {
  id: "profile-1",
  userId: "user-1",
  visibility: "discoverable",
  is_synthetic: false,
  location: {
    city: "서울",
    district: "강남구",
  },
  salaryBand: "1억 이상",
  answers: {
    mbti: "ENFP",
    religionType: "기독교",
    values: ["신뢰", "대화", "성장"],
    interests: ["등산", "독서"],
    selfIntro: "차분하게 대화하며 함께 성장하는 관계를 원합니다.",
    salaryBand: "1억 이상",
    exactLocation: "강남구 역삼동",
  },
};

describe("embed", () => {
  test("returns a deterministic 384-dimension numeric vector", async () => {
    const vector = await embed("ENFP 신뢰 대화 등산");

    expect(vector).toHaveLength(384);
    expect(vector.every((value) => Number.isFinite(value))).toBe(true);
  });
});

describe("buildProfileText", () => {
  test("includes matching context while excluding exact district and salary", () => {
    const text = buildProfileText(profile);

    expect(text).toContain("ENFP");
    expect(text).toContain("기독교");
    expect(text).toContain("신뢰");
    expect(text).toContain("등산");
    expect(text).toContain("서울");
    expect(text).not.toContain("1억 이상");
    expect(text).not.toContain("강남구");
    expect(text).not.toContain("역삼동");
  });
});

describe("match_candidate_profiles", () => {
  test("returns oriented, non-blocked, non-self candidates ordered by similarity", () => {
    const output = psql(`
      delete from public.blocks where blocker_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004') or blocked_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004');
      delete from public.profile_embeddings where profile_id::text like '20000000-0000-0000-0000-0000000000%';
      delete from public.profiles where app_user_id::text like '10000000-0000-0000-0000-0000000000%';
      delete from public.app_users where id::text like '10000000-0000-0000-0000-0000000000%';

      insert into public.app_users (id, display_name) values
        ('10000000-0000-0000-0000-000000000001', 'query'),
        ('10000000-0000-0000-0000-000000000002', 'best'),
        ('10000000-0000-0000-0000-000000000003', 'second'),
        ('10000000-0000-0000-0000-000000000004', 'blocked'),
        ('10000000-0000-0000-0000-000000000005', 'wrong-orientation'),
        ('10000000-0000-0000-0000-000000000006', 'private');

      insert into public.profiles (id, app_user_id, gender, interested_in, city, religion_type, visibility) values
        ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'female', array['male'], '테스트매칭시', '기독교', 'discoverable'),
        ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'male', array['female'], '테스트매칭시', '기독교', 'discoverable'),
        ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'male', array['female'], '테스트매칭시', '기독교', 'discoverable'),
        ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'male', array['female'], '테스트매칭시', '기독교', 'discoverable'),
        ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'female', array['male'], '테스트매칭시', '기독교', 'discoverable'),
        ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000006', 'male', array['female'], '테스트매칭시', '기독교', 'private');

      insert into public.profile_embeddings (profile_id, embedding_model, embedding) values
        ('20000000-0000-0000-0000-000000000001', 'test', '${vectorLiteral(1, 0)}'::extensions.vector(384)),
        ('20000000-0000-0000-0000-000000000002', 'test', '${vectorLiteral(1, 0)}'::extensions.vector(384)),
        ('20000000-0000-0000-0000-000000000003', 'test', '${vectorLiteral(0.8, 0.6)}'::extensions.vector(384)),
        ('20000000-0000-0000-0000-000000000004', 'test', '${vectorLiteral(0.99, 0.01)}'::extensions.vector(384)),
        ('20000000-0000-0000-0000-000000000005', 'test', '${vectorLiteral(0.98, 0.02)}'::extensions.vector(384)),
        ('20000000-0000-0000-0000-000000000006', 'test', '${vectorLiteral(0.97, 0.03)}'::extensions.vector(384));

      insert into public.blocks (blocker_id, blocked_id) values
        ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004');

      select profile_id::text
      from public.match_candidate_profiles(
        '10000000-0000-0000-0000-000000000001',
        '${vectorLiteral(1, 0)}'::extensions.vector(384),
        10,
        0,
        'female',
        array['male'],
        '테스트매칭시',
        null
      );
    `);

    expect(output.split("\n").filter(Boolean)).toEqual([
      "20000000-0000-0000-0000-000000000002",
      "20000000-0000-0000-0000-000000000003",
    ]);
  });
});

const vectorLiteral = (first: number, second: number): string => `[${[first, second, ...Array.from({ length: 382 }, () => 0)].join(",")}]`;

const psql = (sql: string): string => execFileSync("docker", ["exec", "-i", "supabase_db_soulsync-ai", "psql", "-U", "postgres", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim();
