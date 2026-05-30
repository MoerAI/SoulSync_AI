# Synthetic Profile Policy

SoulSync AI may use clearly labeled synthetic profiles to keep the matching experience useful during cold start or sparse pools. Synthetic profiles must carry an `is_synthetic=true` marker and visible synthetic disclosure. The default is **NO training/model-improvement use** of user data to create or improve synthetic profiles.

## Data Classes

| public | matching_private | internal |
| --- | --- | --- |
| Display name, age range, city, public persona summary, approved public photo references, synthetic badge | Matching answers, MBTI/religion/values, interests, city-level location, approved private photo moderation state, embeddings derived only from matching context | Account identifiers, consent ledger, blocks, reports, jobs, audit timestamps, model prompts/outputs needed to operate safety and matching |

## Rules

- Synthetic profiles are generated fixtures, not real people.
- Synthetic profiles cannot copy a real user's identity, exact location, workplace, photos, or private answers.
- Synthetic recommendations must stay labeled in APIs, widgets, and summaries.
- Reports and blocks can still be recorded against synthetic candidates for product safety review.
