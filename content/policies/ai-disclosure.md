# AI Disclosure

SoulSync AI uses AI to create privacy-filtered persona previews, simulate short compatibility conversations, score recommendation quality, and explain match summaries. The default is **NO training/model-improvement use** of user data or AI outputs.

## Data Classes

| public | matching_private | internal |
| --- | --- | --- |
| Display name, age range, city, public persona summary, approved public photo references, synthetic badge | Matching answers, MBTI/religion/values, interests, city-level location, approved private photo moderation state, embeddings derived only from matching context | Account identifiers, consent ledger, blocks, reports, jobs, audit timestamps, model prompts/outputs needed to operate safety and matching |

## User Expectations

- AI outputs are generated summaries and compatibility signals, not guarantees about a person.
- Synthetic profiles are labeled separately and are never presented as real users.
- Safety filters remove private or non-consented details from model-visible matching context.
- Users can block, report, withdraw consent, or delete their account.
