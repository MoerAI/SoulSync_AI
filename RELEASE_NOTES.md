# SoulSync AI — v0.1.0

Values-based compatibility matching as a ChatGPT App (OpenAI Apps SDK / MCP server on Vercel + Supabase + friendli.ai EXAONE).

## What's in v1

A consented user profile becomes an editable persona "agent". A background pipeline funnels candidates (MBTI soft-filter → religion/values/coarse-location → ranked top-3), runs deterministic agent-to-agent conversations powered by EXAONE, and an LLM judge scores chemistry to return explainable, one-way recommendations. The differentiator is **context-based** matching, not photos/conditions.

## Deliverables

- **Monorepo** (pnpm): `apps/web` (Next.js 15 MCP + REST + cron), `packages/core` (shared services), `packages/widgets` (React widgets), `content/` (40-question spec), `supabase/` (migrations).
- **ChatGPT App**: MCP server at `/api/mcp` with OAuth 2.1 (protected-resource metadata, 401 + `WWW-Authenticate`), data + render tools, and 3 widgets (profile-form, recommendations, match-status).
- **Matching engine**: MBTI axis scoring + soft compatibility, religion/values/location funnel with relaxation-ladder fallback, gte-small (384-dim) embeddings + pgvector RPC, persona generation with redaction + prompt-injection sanitization, deterministic A↔B conversation orchestrator, LLM-as-judge with structured rubric + bias controls.
- **Background jobs**: enqueue + cron/worker drain (never inline in MCP tools), notifications + realtime channel.
- **Data layer**: Supabase migrations (schema + pgvector + RLS + storage buckets + match RPC + notifications) applying cleanly from an empty DB; labeled synthetic seed pool (≥50).
- **Safety/privacy**: 18+ age gate, granular consent ledger, block/report enforcement, account deletion + cascade, photo moderation (NSFW/apparent-minor) + EXIF/GPS strip, policy docs (privacy, AI disclosure, synthetic-profile, retention) with a data-class table. Default: no training use.
- **RN readiness**: thin REST adapters (`/api/mobile/*`) sharing the same core serializers as the MCP tools.
- **Deployment**: `DEPLOYMENT.md` (reproducible) + `scripts/smoke-deploy.mjs`.

## Verification

- `pnpm -r build` + `pnpm -r test` green (Vitest: core, content, web).
- `supabase db reset` applies all migrations (0001–0005) from empty DB.
- `pnpm e2e` (seeded full flow, deterministic mocked LLM) green, including the adversarial edge battery: <3-candidate fallback, invalid judge JSON, Friendli 429 backoff, prompt-injection neutralization, unauth tool → 401, RLS cross-user denial, synthetic badge on every surface, EXIF strip.

## Known limitations

- **Matching pool is synthetic** (labeled `is_synthetic` on every surface) for cold-start; real users join the same funnel.
- **One-way recommendations only** — real-time human-to-human chat and mutual-match handshakes are deferred.
- **Local embeddings** fall back to a deterministic 384-dim keyword vector when the Supabase `gte-small` endpoint is unavailable.
- **No React Native app** in v1 (architecture/adapters only); no payments/Toss/push.
- **Public directory listing** is a separate, post-v1 submission gate given the category.

## Deploy

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for a clean-clone deploy (Supabase → friendli.ai → Vercel → ChatGPT Developer Mode registration → submission checklist → rollback).
