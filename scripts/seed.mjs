#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const dbContainer = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_soulsync-ai";
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node scripts/seed.mjs [--count N]\n\nSeeds deterministic, labeled synthetic SoulSync candidates into local Supabase. Counts must be 50-200. FRIENDLI_API_KEY is optional; the default path uses deterministic MockFriendli and never calls the network.");
  process.exit(0);
}

async function main() {
  const count = parseCount(args);
  execFileSync("pnpm", ["--filter", "@soulsync/core", "build"], { cwd: rootDir, stdio: "inherit" });
  patchBuiltEsm(resolve(rootDir, "packages/core/dist"));

  const { seedSyntheticCandidates } = await import(pathToFileURL(resolve(rootDir, "packages/core/dist/seed/generate.js")).href);
  const database = new PsqlSeedDatabase(dbContainer);
  const result = await seedSyntheticCandidates(database, { count });

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

function parseCount(values) {
  const index = values.indexOf("--count");

  if (index === -1) {
    return undefined;
  }

  const raw = values[index + 1];
  const parsed = Number(raw);

  if (!Number.isInteger(parsed)) {
    throw new Error("--count must be an integer.");
  }

  return parsed;
}

class PsqlSeedDatabase {
  constructor(container) {
    this.container = container;
    this.embeddingClient = {
      from: (table) => ({
        select: () => ({
          eq: (_column, value) => ({
            single: async () => {
              const json = this.one(`
                select coalesce(row_to_json(profile_row)::text, 'null')
                from (
                  select id, app_user_id, city, district, mbti, religion_type, values, salary_band, profile_text, visibility, is_synthetic
                  from public.profiles
                  where id = ${sqlString(value)}::uuid
                ) profile_row;
              `);

              return { data: json === "null" || json.length === 0 ? null : JSON.parse(json), error: json === "null" || json.length === 0 ? new Error(`Missing profile ${value}`) : null };
            },
          }),
        }),
        upsert: async (row) => {
          this.exec(`
            insert into public.profile_embeddings (profile_id, embedding_model, embedding, updated_at)
            values (${sqlString(row.profile_id)}::uuid, ${sqlString(row.embedding_model)}, ${vectorLiteral(row.embedding)}::extensions.vector(384), ${sqlString(row.updated_at)}::timestamptz)
            on conflict (profile_id) do update set
              embedding_model = excluded.embedding_model,
              embedding = excluded.embedding,
              updated_at = excluded.updated_at;
          `);

          return { error: null };
        },
      }),
    };
  }

  async upsertAppUser(row) {
    this.exec(`
      insert into public.app_users (id, primary_email, display_name, is_synthetic, birth_year, age_verified, updated_at)
      values (${sqlString(row.id)}::uuid, ${sqlString(row.primary_email)}, ${sqlString(row.display_name)}, true, ${Number(row.birth_year)}, true, ${sqlString(row.updated_at)}::timestamptz)
      on conflict (id) do update set
        primary_email = excluded.primary_email,
        display_name = excluded.display_name,
        is_synthetic = true,
        birth_year = excluded.birth_year,
        age_verified = true,
        updated_at = excluded.updated_at;
    `);
  }

  async upsertProfile(row) {
    this.exec(`
      insert into public.profiles (id, app_user_id, gender, interested_in, city, district, mbti, mbti_scores, religion_type, religion_intensity, values, salary_band, visibility, is_synthetic, profile_text, updated_at)
      values (${sqlString(row.id)}::uuid, ${sqlString(row.app_user_id)}::uuid, ${sqlString(row.gender)}, ${textArray(row.interested_in)}, ${sqlString(row.city)}, ${sqlString(row.district)}, ${sqlString(row.mbti)}, ${jsonb(row.mbti_scores)}, ${sqlString(row.religion_type)}, ${Number(row.religion_intensity)}, ${jsonb(row.values)}, ${sqlString(row.salary_band)}, 'discoverable', true, ${sqlString(row.profile_text)}, ${sqlString(row.updated_at)}::timestamptz)
      on conflict (id) do update set
        app_user_id = excluded.app_user_id,
        gender = excluded.gender,
        interested_in = excluded.interested_in,
        city = excluded.city,
        district = excluded.district,
        mbti = excluded.mbti,
        mbti_scores = excluded.mbti_scores,
        religion_type = excluded.religion_type,
        religion_intensity = excluded.religion_intensity,
        values = excluded.values,
        salary_band = excluded.salary_band,
        visibility = 'discoverable',
        is_synthetic = true,
        profile_text = excluded.profile_text,
        updated_at = excluded.updated_at;
    `);
  }

  async replaceProfileAnswers(appUserId, rows) {
    this.exec(`delete from public.profile_answers where app_user_id = ${sqlString(appUserId)}::uuid;`);

    if (rows.length === 0) {
      return;
    }

    this.exec(`
      insert into public.profile_answers (id, app_user_id, question_id, answer, privacy_class)
      values ${rows.map((row) => `(${sqlString(row.id)}::uuid, ${sqlString(row.app_user_id)}::uuid, ${sqlString(row.question_id)}, ${jsonb(row.answer)}, ${sqlString(row.privacy_class)})`).join(",\n")}
      on conflict (id) do update set
        app_user_id = excluded.app_user_id,
        question_id = excluded.question_id,
        answer = excluded.answer,
        privacy_class = excluded.privacy_class;
    `);
  }

  async updateProfilePersona(profileId, persona) {
    this.exec(`
      update public.profiles
      set persona_spec = ${jsonb(persona)}, persona_version = 'synthetic-seed-v1', persona_updated_at = now(), updated_at = now()
      where id = ${sqlString(profileId)}::uuid;
    `);
  }

  exec(sql) {
    execFileSync("docker", ["exec", "-i", this.container, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  }

  one(sql) {
    return execFileSync("docker", ["exec", "-i", this.container, "psql", "-U", "postgres", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim();
  }
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonb(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function textArray(values) {
  return `array[${values.map(sqlString).join(",")}]::text[]`;
}

function vectorLiteral(values) {
  if (!Array.isArray(values) || values.length !== 384 || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("Embedding vector must contain 384 finite numbers.");
  }

  return sqlString(`[${values.join(",")}]`);
}

function patchBuiltEsm(distDir) {
  for (const filePath of jsFiles(distDir)) {
    const source = readFileSync(filePath, "utf8");
    const patched = source.replace(/(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g, (_match, start, specifier, end) => `${start}${resolvedSpecifier(filePath, specifier)}${end}`);

    if (patched !== source) {
      writeFileSync(filePath, patched);
    }
  }
}

function jsFiles(dirPath) {
  return readdirSync(dirPath).flatMap((name) => {
    const filePath = resolve(dirPath, name);

    if (statSync(filePath).isDirectory()) {
      return jsFiles(filePath);
    }

    return filePath.endsWith(".js") ? [filePath] : [];
  });
}

function resolvedSpecifier(filePath, specifier) {
  if (specifier.endsWith(".js")) {
    return specifier;
  }

  const absolute = resolve(dirname(filePath), specifier);

  if (existsSync(`${absolute}.js`)) {
    return `${specifier}.js`;
  }

  if (existsSync(resolve(absolute, "index.js"))) {
    return `${specifier}/index.js`;
  }

  return specifier;
}

await main();
