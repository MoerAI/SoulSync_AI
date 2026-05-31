# SoulSync AI Auth

## Implemented Authorization Server

SoulSync AI currently includes a minimal OAuth 2.1-style authorization server in the Next.js app for MCP clients. It implements authorization code + PKCE S256, Dynamic Client Registration, and authorization server metadata:

- `GET /.well-known/oauth-authorization-server`
- `POST /oauth/register`
- `GET /oauth/authorize`
- `POST /oauth/token`
- `GET /.well-known/oauth-protected-resource`

The implementation is intentionally small. Dynamic client registrations and authorization codes are stored in process memory, so they survive within a running server process but are not durable across deploys/restarts. The `/authorize` route does not render a hosted login or consent page yet. It requires the caller to already have a Supabase Auth access token and send it as `Authorization: Bearer <supabase_access_token>`; invalid or missing Supabase sessions return `login_required`.

## OAuth Flow

1. The client reads `/.well-known/oauth-authorization-server` and discovers the issuer, authorization endpoint, token endpoint, registration endpoint, `code` response type, `authorization_code` grant, public-client token auth method `none`, and PKCE method `S256`.
2. The client registers with `POST /oauth/register` using at least `redirect_uris`. The server accepts public PKCE clients only and returns a `client_id` with `token_endpoint_auth_method = "none"`.
3. The client sends the user to `/oauth/authorize` with `response_type=code`, `client_id`, exact registered `redirect_uri`, optional `scope`, `state`, `code_challenge`, and `code_challenge_method=S256`.
4. `/oauth/authorize` validates the Supabase Auth bearer token through Supabase, resolves or creates the SoulSync `app_users` record using the Supabase user id, stores a short-lived authorization code, and redirects back to the registered redirect URI with `code` and `state`.
5. The client exchanges the code at `/oauth/token` with `grant_type=authorization_code`, `client_id`, exact `redirect_uri`, and `code_verifier`.
6. `/oauth/token` verifies the S256 PKCE challenge and issues an HS256 JWT access token signed with `OAUTH_AS_JWT_SECRET`.

The issued access token has:

- `iss` equal to `OAUTH_ISSUER`
- `aud` equal to `OAUTH_AUDIENCE`, the MCP resource URL
- `sub` equal to the Supabase Auth user id
- `app_user_id` equal to the resolved SoulSync `app_users.id`
- `scope` equal to the granted scopes
- `exp` set to one hour after issuance

Supported scopes are `profile.read`, `profile.write`, and `match.run`. If no scope is requested, the server grants `profile.read`.

## Required Environment

- `OAUTH_ISSUER`: public issuer origin for this authorization server, for example `https://app.example.com` or `http://localhost:3004` locally.
- `OAUTH_AUDIENCE`: MCP resource URL that tokens are valid for, for example `https://app.example.com/api/mcp`.
- `OAUTH_AS_JWT_SECRET`: shared HS256 signing secret for tokens issued by this authorization server.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: service-role key used server-side to validate Supabase Auth sessions and map users. Never expose it to widgets or browser code.

## Resource Server Verification

`verifyOAuthAccessToken` validates access tokens before MCP tools run. It requires issuer, audience, expiry, and requested scopes to match. It accepts three configurations:

- First-party SoulSync AS tokens when `OAUTH_AS_JWT_SECRET` is configured. These are HS256 tokens issued by `/oauth/token`.
- Local stub issuer tokens for tests when `OAUTH_ISSUER` is localhost or `http://localhost:8787/oauth-stub` and `OAUTH_STUB_JWT_SECRET` is configured.
- Managed IdP tokens when `OAUTH_AS_JWT_SECRET` is not configured and `OAUTH_JWKS_URL` points at the provider JWKS. This keeps Stytch/Auth0 or another MCP-compatible provider available as a fallback without changing the MCP resource contract.

For every path, the resource server rejects wrong audience, expired tokens, and missing required scopes.

## Identity Linking

OAuth AS tokens carry a confirmed `app_user_id`, so `actorFromClaims` can build the MCP actor directly after verification.

For Supabase-backed authorization, the AS maps the Supabase Auth `user.id` to `app_users.supabase_user_id` first. If that row exists, it is reused. If it does not exist and the Supabase email matches an existing app user, the AS creates a pending `external_identities` row with provider `supabase_auth`, `app_user_id = null`, and `raw_claims.link_status = "pending"`, then refuses to issue an OAuth code until an explicit account-link flow resolves the conflict. Email is not a merge key.

ChatGPT Apps or managed-IdP OAuth subjects resolved at the MCP resource layer still use provider `openai_apps_oauth`. The same pending-link behavior applies there: an email collision creates an unlinked external identity and never silently merges accounts.

## Managed IdP Fallback

If operating the custom AS becomes too costly, configure a managed OAuth/OIDC provider instead:

- Set `OAUTH_ISSUER` to the managed provider issuer.
- Set `OAUTH_AUDIENCE` to the MCP resource URL or the provider audience configured for SoulSync.
- Leave `OAUTH_AS_JWT_SECRET` unset.
- Set `OAUTH_JWKS_URL` to the provider JWKS endpoint.

In that mode SoulSync does not use `/oauth/authorize`, `/oauth/token`, or `/oauth/register` for issuance; the managed provider issues tokens and the MCP resource continues to verify issuer, audience, expiry, and scopes through JWKS.

## Local Stub Issuer For Tests

Tests can still use the local HS256 stub issuer:

- `OAUTH_ISSUER=http://localhost:8787/oauth-stub`
- `OAUTH_AUDIENCE=http://localhost:3000/api/mcp`
- `OAUTH_STUB_JWT_SECRET=<test secret>`

Do not use the stub issuer in production.
