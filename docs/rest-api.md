# SoulSync Mobile REST API

The mobile REST API is a React Native readiness surface for the same product capabilities exposed through MCP tools. REST adapters stay thin: authentication resolves a Supabase Auth JWT into `app_users.id`, routes call shared services, and response bodies use `packages/core/src/serializers.ts`.

## Parity Contract

| REST route | MCP tool | Shared serializer |
| --- | --- | --- |
| `POST /api/mobile/profile/step` | `save_profile_step` | `serializeProfileStep` |
| `POST /api/mobile/persona/generate` | `generate_persona` | `serializePersona` |
| `POST /api/mobile/persona/update` | `update_persona` | `serializePersona` |
| `POST /api/mobile/photo` | `upload_profile_photo` | `serializePhotoUpload` |
| `POST /api/mobile/match-jobs` | `start_match_job` | `serializeMatchJob` |
| `GET /api/mobile/match-jobs/[id]` | `get_match_job` | `serializeMatchJob` |
| `GET /api/mobile/recommendations` | `list_recommendations` | `serializeRecommendations` |
| `POST /api/mobile/report` | `report_profile` | `serializeReport` |
| `POST /api/mobile/block` | `block_profile` | `serializeBlock` |
| `DELETE /api/mobile/account` | `delete_account` | `serializeDeleteAccount` |

## Authentication

Every REST route requires `Authorization: Bearer <Supabase Auth JWT>`. `actorFromSupabaseJwt(req)` verifies the token with `SUPABASE_JWT_SECRET`, `SUPABASE_URL/auth/v1` as issuer by default, and `authenticated` as audience by default. The token `sub` is mapped through `app_users.supabase_user_id`; missing, invalid, expired, or unlinked tokens return `401`.

## Response Safety

Recommendation payloads are produced by `serializeRecommendations` for both MCP and REST. The public shape includes recommendation ids, rank, overall score, safe subscores, Korean summary, candidate id/display fields when available, and `is_synthetic`. It excludes salary, exact location, raw transcripts, private profile answers, service-role values, storage paths, and internal rationale.

## Route Summary

`POST /api/mobile/profile/step` accepts `{ "step": string, "data": object }` and returns `{ "step": string, "saved": true }`.

`POST /api/mobile/persona/generate` accepts optional `{ "consent": boolean | object }` and returns `{ "persona": ... }` using the same safe persona fields as MCP.

`POST /api/mobile/persona/update` accepts `{ "updates": object }` and returns the updated serialized persona.

`POST /api/mobile/photo` accepts `{ "fileName": string }`, initializes a private signed upload, stores a pending photo row, and returns `{ "photoId": string, "status": "pending", "upload": ... }`.

`POST /api/mobile/match-jobs` enqueues matching work and returns `{ "jobId": string, "status": "queued" }`.

`GET /api/mobile/match-jobs/[id]` returns `{ "jobId": string, "status": string, "progress": number }` for the authenticated user's job.

`GET /api/mobile/recommendations?jobId=&limit=` returns `{ "count": number, "recommendations": [...] }`, identical to the MCP `list_recommendations` structured content for the same rows.

`POST /api/mobile/report` accepts `{ "profileId": string, "reason": string }` and returns `{ "reportId": string, "reported": true }`.

`POST /api/mobile/block` accepts `{ "profileId": string }` and returns `{ "blockId": string, "blockedProfileId": string }`.

`DELETE /api/mobile/account` deletes the authenticated account through the core enforcement cleanup service and returns `{ "deleted": true }`.
