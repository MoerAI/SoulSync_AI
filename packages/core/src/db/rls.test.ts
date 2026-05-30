// RLS Integration Test Scaffold
// Run against local Supabase: supabase db reset && pnpm vitest run packages/core/src/db
import { describe, expect, it } from "vitest";

void expect;

describe("RLS policies", () => {
  it.todo("User A cannot read User B private profile");
  it.todo("User A cannot read User B recommendations");
  it.todo("RLS enabled on all tables");
});
