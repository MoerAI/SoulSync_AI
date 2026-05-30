# SoulSync AI Auth

## Authorization Server Decision

SoulSync AI will run a minimal OAuth 2.1 authorization server on Vercel, backed by Supabase Auth for user authentication and account storage. The authorization server issues authorization-code + PKCE grants for ChatGPT Apps and MCP clients, supports dynamic client registration, and signs access tokens for the MCP protected resource.

The MCP resource audience is the public MCP resource URL. Access tokens must carry `aud` equal to `OAUTH_AUDIENCE`, `iss` equal to `OAUTH_ISSUER`, a valid `exp`, and the scopes needed by the requested MCP tool. The protected-resource metadata endpoint advertises `profile.read`, `profile.write`, and `match.run` so clients can request only the permissions they need.

If the minimal Vercel authorization server becomes operationally too costly, the fallback is a managed OAuth/OIDC provider with dynamic client registration and JWKS support. The resource server contract stays the same: validate issuer, audience, expiry, and scopes before resolving identity.

## Identity Linking

ChatGPT Apps OAuth subjects are stored in `external_identities` with provider `openai_apps_oauth`. A new provider subject creates a new `app_users` row and a linked `external_identities` row.

Email is not a merge key. If an incoming `openai_apps_oauth` token has an email that already belongs to a different app user, the resource server creates a pending external identity with `app_user_id = null` and `raw_claims.link_status = "pending"`. The existing app user is recorded in `raw_claims.conflicting_app_user_id`, and a later explicit confirmation flow must complete the link. The resource server never silently merges accounts by email.

## Local Stub Issuer For Tests

Tests use a local HS256 stub issuer:

- `OAUTH_ISSUER=http://localhost:8787/oauth-stub`
- `OAUTH_AUDIENCE=http://localhost:3000/api/mcp`
- `OAUTH_STUB_JWT_SECRET=<test secret>`

`verifyOAuthAccessToken` accepts this localhost issuer only through the configured stub secret. Non-stub issuers must expose a JWKS URL through `OAUTH_JWKS_URL`, and tokens are rejected unless issuer, audience, expiry, and required scopes all validate.
