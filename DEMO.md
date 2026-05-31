# SoulSync AI — Hackathon Demo Runbook (ChatGPT in-app)

Goal: in ChatGPT, type **"외로워"** → profile form appears → fill it → **generated profile card** → **matching results**, all inline.

Fastest reliable path (Oracle-recommended): run locally + expose via a Cloudflare tunnel + demo no-auth mode. No Vercel/Supabase-cloud needed for the demo.

---

## 0. Prerequisites
- Local Supabase running (`supabase start`) with migrations applied (0001–0006).
- `cloudflared` installed (`brew install cloudflared`).
- A FriendliAI API key (already set locally — see below).
- Node + pnpm; `pnpm install` done.

## 1. Env — `apps/web/.env.local` (gitignored)
```bash
# LLM (agent conversation / judge / persona) — EXAONE on Friendli
FRIENDLI_API_KEY=flp_xxxxxxxx
FRIENDLI_MODEL=LGAI-EXAONE/K-EXAONE-236B-A23B
FRIENDLI_BASE_URL=https://api.friendli.ai/serverless/v1

# Supabase (local) — from `supabase status`
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service_role key>

# DEMO toggles (OFF in production)
DEMO_NOAUTH=1           # ChatGPT connects without OAuth; all calls -> one fixed demo user
DEMO_INSTANT_CARD=1     # get_profile_card lazily generates the card on the spot (MockGgui, instant)
DEMO_INSTANT_MATCH=1    # match job runs synchronously via the mock LLM path so recommendations appear in ~1s (no cron, no live EXAONE latency)

# Public origin = the tunnel URL (set AFTER you get it in step 2). Must NOT be localhost.
OAUTH_AUDIENCE=https://<your-tunnel>.trycloudflare.com
APP_BASE_URL=https://<your-tunnel>.trycloudflare.com
```

## 2. Start the stack
```bash
# 1) Supabase (if not running) + migrations
supabase start
supabase migration up   # ensure 0006_profile_cards is applied

# 1b) Seed synthetic candidates so matching has people to match with (idempotent)
node scripts/seed.mjs --count 60

# 2) Build widgets (the MCP server serves the built bundles)
pnpm --filter @soulsync/widgets build

# 3) Run Next.js locally
pnpm --filter @soulsync/web dev --port 3000

# 4) In another terminal: public HTTPS tunnel -> your local server
cloudflared tunnel --url http://127.0.0.1:3000
# prints https://<random>.trycloudflare.com  ← put this in OAUTH_AUDIENCE/APP_BASE_URL, then restart `pnpm dev`
```
> Re-set `OAUTH_AUDIENCE`/`APP_BASE_URL` to the printed tunnel URL and **restart `pnpm dev`** so the widget CSP + resource origins use the public URL.

## 3. Register in ChatGPT (Developer Mode — no file, just the URL)
1. ChatGPT → **Settings → Apps & Connectors → Advanced → enable Developer mode**.
2. **Settings → Apps & Connectors → Create**.
3. Name: `SoulSync AI`; Description: `values-based companionship matcher`; **MCP URL**: `https://<your-tunnel>.trycloudflare.com/api/mcp`.
4. Create. With `DEMO_NOAUTH=1` it connects without an OAuth dance and lists the tools.
5. New chat → tool picker (+) → enable **SoulSync AI** for the conversation.

## 4. Run the demo
- Type: **`외로워`**
  - Expected: the model calls `render_profile_form` → the **profile form widget** appears.
  - Fallback prompt if the model just chats: **`외로워. SoulSync 프로필 폼 열어줘.`**
- Fill the form (age gate → consent → MBTI → values → appeal → 2–3 photos → persona).
- On finish, the widget **auto-advances**: ✨ generated **profile card** → 💞 **matching results** (no extra prompts needed).

## 5. Gotchas (live-demo killers — avoid)
- **Use the tunnel URL everywhere ChatGPT sees the app** (OAUTH_AUDIENCE/APP_BASE_URL), never `localhost`.
- **Cron is NOT used** for the demo — the card is generated lazily inside `get_profile_card` (`DEMO_INSTANT_CARD=1`).
- **Photos** are stored in **local** Supabase; their signed URLs point at `127.0.0.1:54321`, so present on the **same machine** running Supabase (the widget CSP allows the Supabase origin).
- If the tunnel URL changes, **re-create the connector** in ChatGPT (old registration breaks).
- Keep the laptop awake; restart order if anything breaks: **Supabase → `pnpm dev` → `cloudflared` → reconnect the app in ChatGPT.**

## Production note
`DEMO_NOAUTH` / `DEMO_INSTANT_CARD` are demo-only env flags (off by default). Production uses OAuth 2.1 + the background cron worker (see `DEPLOYMENT.md`). Rotate the Friendli key after the hackathon (it was shared in chat).
