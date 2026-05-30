# SoulSync AI Deployment

## 1. Supabase Project

Create the production Supabase project in a global/non-EU region. Do not select an EU data-residency region for the ChatGPT Apps submission path.

From a clean clone, install dependencies and apply migrations:

```sh
pnpm install --frozen-lockfile
supabase link --project-ref <project-ref>
supabase db push
```

Confirm the migration output includes the `vector` extension in the `extensions` schema, the profile embedding tables, match job tables, and the `notifications` table. The current schema uses database-backed queue rows in `public.match_jobs`; no separate pgmq queue is required unless the worker is redesigned. Completion notifications are written to `public.notifications` with `payload.realtimeChannel` values such as `match-job-<job-id>`, so enable Supabase Realtime for `public.notifications` if client-side push updates are needed in addition to MCP polling.

Confirm Storage buckets created by migrations:

```sh
supabase db remote commit --dry-run
```

The required buckets are `profile-public` (public) and `profile-private` (private). Profile uploads use `profile-private/{app_user_id}/...`; keep the service-role key server-only.

Collect these keys from Supabase project settings for Vercel only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Never place the service-role key in widget bundles, browser code, screenshots, or docs.

## 2. friendli.ai Environment And Smoke Test

Create a friendli.ai serverless API key and configure the model endpoint used by SoulSync:

```sh
FRIENDLI_API_KEY=<friendli-serverless-key>
FRIENDLI_BASE_URL=https://api.friendli.ai/serverless/v1
FRIENDLI_MODEL=LGAI-EXAONE/K-EXAONE-236B-A23B
```

Run a chat smoke test before deploying. Use a placeholder locally and paste the real key only into your shell or secret manager:

```sh
curl -sS "$FRIENDLI_BASE_URL/chat/completions" \
  -H "authorization: Bearer $FRIENDLI_API_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"'"$FRIENDLI_MODEL"'","messages":[{"role":"user","content":"Return the word ok."}],"temperature":0,"max_tokens":8}'
```

Then verify structured judge output support with `json_schema` response format:

```sh
curl -sS "$FRIENDLI_BASE_URL/chat/completions" \
  -H "authorization: Bearer $FRIENDLI_API_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"'"$FRIENDLI_MODEL"'","messages":[{"role":"system","content":"Return JSON only."},{"role":"user","content":"Score this as ok true."}],"temperature":0,"response_format":{"type":"json_schema","json_schema":{"name":"judge_smoke","schema":{"type":"object","additionalProperties":false,"properties":{"ok":{"type":"boolean"}},"required":["ok"]}}}}'
```

Both calls must return HTTP 200 JSON before enabling production match jobs.

## 3. Vercel Import And Deploy

Import the GitHub repository into Vercel with these build settings:

```text
Framework Preset: Next.js
Root Directory: apps/web
Install Command: cd ../.. && pnpm install --frozen-lockfile
Build Command: cd ../.. && pnpm --filter @soulsync/widgets build && pnpm --filter @soulsync/web build
Output Directory: apps/web/.next
Node.js Version: 22.x
```

Keep the repository root `vercel.json` committed. It enables Fluid compute, schedules `/api/cron/process-match-jobs`, and sets the cron route max duration to 300 seconds. The cron route also exports `maxDuration = 300` for Next.js.

Set exactly these Vercel environment variables for Production and Preview as appropriate:

```text
FRIENDLI_API_KEY
FRIENDLI_BASE_URL
FRIENDLI_MODEL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OAUTH_ISSUER
OAUTH_AUDIENCE
CRON_SECRET
APP_BASE_URL
```

Use these value shapes, replacing domains with the deployed production URL:

```text
OAUTH_ISSUER=https://<app-domain>
OAUTH_AUDIENCE=https://<app-domain>/api/mcp
APP_BASE_URL=https://<app-domain>
```

Deploy, then run:

```sh
node scripts/smoke-deploy.mjs https://<app-domain>
```

The smoke test must pass `/api/health`, `/.well-known/oauth-protected-resource`, and the unauthenticated `/api/mcp` 401 check.

## 4. ChatGPT Developer Mode MCP Registration

In ChatGPT Developer Mode, register the MCP server URL as:

```text
https://<app-domain>/api/mcp
```

Use OAuth discovery through:

```text
https://<app-domain>/.well-known/oauth-protected-resource
```

The protected-resource metadata must advertise `profile.read`, `profile.write`, and `match.run`; its resource value must match `OAUTH_AUDIENCE`. OAuth access tokens must validate `iss`, `aud`, `exp`, and scopes as described in `docs/auth.md`.

Verify widget CSP before submission by rendering each MCP widget resource in ChatGPT Developer Mode. The widget metadata should allow connections only to the deployed app origin and the configured Supabase origin. If a widget cannot fetch data, inspect `openai/widgetCSP` and compare it to `OAUTH_AUDIENCE` and `SUPABASE_URL`.

Use these test prompts after OAuth succeeds:

```text
Open the SoulSync profile form.
Generate my persona preview from the profile answers I entered.
Start a SoulSync match job and show me the match status.
List my recommendations when the match job finishes.
```

An unauthenticated MCP request must return 401, and authenticated tools must avoid exposing exact address, workplace, GPS coordinates, salary, or non-consented private fields.

## 5. Submission Checklist For platform.openai.com/apps-manage

Prepare the manual submission package; do not auto-submit from scripts or CI.

Checklist:

```text
Privacy policy URL published from content/policies/privacy-policy.md
AI disclosure and synthetic profile policy URLs published from content/policies/ai-disclosure.md and content/policies/synthetic-profile-policy.md
Retention/deletion policy URL published from content/policies/retention-deletion.md
Production MCP URL: https://<app-domain>/api/mcp
OAuth protected-resource metadata URL: https://<app-domain>/.well-known/oauth-protected-resource
Screenshots of profile onboarding, persona preview, match status, and recommendations widgets
Demo credentials or a reviewer OAuth path that does not expose real user data
Tool descriptions for save_profile_step, generate_persona, update_persona, upload_profile_photo, start_match_job, get_match_job, list_recommendations, report_profile, block_profile, delete_account, render_profile_form, render_recommendations, and render_match_status
Evidence that synthetic profiles are labeled and user data is not used for training/model improvement by default
Evidence that the Supabase project is in a global/non-EU region
```

Before submission, rerun `node scripts/smoke-deploy.mjs https://<app-domain>` and confirm the Vercel deployment, Supabase migrations, friendli.ai smoke tests, OAuth registration, CSP verification, and privacy policy URLs are all current.

## 6. Rollback

For application rollback, use Vercel Deployments to promote the last known-good deployment. Re-run `node scripts/smoke-deploy.mjs https://<app-domain>` after promotion and temporarily disable the cron schedule if match job processing is causing user-visible errors.

For environment rollback, restore the previous Vercel environment variable values from the Vercel audit log or secret manager, redeploy, and rerun the smoke test. Rotate any key that was pasted into logs, screenshots, tickets, or committed files.

For database rollback, prefer additive forward fixes. If a migration must be reversed, write and review an explicit down migration for the specific deployed migration, test it against a disposable copy or branch database, back up production first, and only then apply it with Supabase tooling. Do not run `supabase db reset` against production or shared environments.

After any rollback, verify ChatGPT Developer Mode still discovers `/.well-known/oauth-protected-resource`, OAuth tokens still target `/api/mcp`, and unauthenticated MCP requests still fail with 401.
