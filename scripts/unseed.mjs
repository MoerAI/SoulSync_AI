#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const dbContainer = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_soulsync-ai";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: node scripts/unseed.mjs\n\nRemoves all rows labeled is_synthetic=true from local Supabase seed-owned tables.");
  process.exit(0);
}

const sql = `
  with synthetic_users as (
    select id from public.app_users where is_synthetic = true
  ), synthetic_profiles as (
    select id from public.profiles where is_synthetic = true or app_user_id in (select id from synthetic_users)
  )
  delete from public.profile_embeddings where profile_id in (select id from synthetic_profiles);

  delete from public.profile_answers where app_user_id in (select id from public.app_users where is_synthetic = true);
  delete from public.recommendations where is_synthetic = true;
  delete from public.profiles where is_synthetic = true or app_user_id in (select id from public.app_users where is_synthetic = true);
  delete from public.app_users where is_synthetic = true;
`;

execFileSync("docker", ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", stdio: ["pipe", "inherit", "inherit"] });
console.log(JSON.stringify({ ok: true, removed: "is_synthetic=true" }, null, 2));
