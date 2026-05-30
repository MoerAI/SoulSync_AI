# Retention and Deletion Policy

SoulSync AI retains data only as long as needed to provide the matching service, honor user choices, and operate safety controls. Account deletion removes the profile from discovery immediately and deletes account-linked rows through database cascades or explicit cleanup. The default is **NO training/model-improvement use**, so deleted user data is not retained for model improvement datasets.

## Data Classes

| public | matching_private | internal |
| --- | --- | --- |
| Display name, age range, city, public persona summary, approved public photo references, synthetic badge | Matching answers, MBTI/religion/values, interests, city-level location, approved private photo moderation state, embeddings derived only from matching context | Account identifiers, consent ledger, blocks, reports, jobs, audit timestamps, model prompts/outputs needed to operate safety and matching |

## Retention

- Public profile data is retained while the account is active and discoverable.
- Matching-private data is retained while consent is granted and the account remains active.
- Internal safety and consent ledger entries are retained while the account exists; deletion removes account-linked rows unless law or abuse-prevention obligations require a separately documented hold.

## Deletion

The delete-account routine first makes the profile non-discoverable, then deletes account-linked photos, embeddings, answers, consents, jobs, recommendations, simulations, blocks, reports, identities, profiles, and the app user. Foreign keys with `ON DELETE CASCADE` are the primary cleanup path, with explicit cleanup for relationship tables that do not cascade.

## Consent Withdrawal

Consent changes are append-only ledger entries. Withdrawal writes a new `granted=false` entry with scope, version, locale, and source instead of editing historical consent events.
