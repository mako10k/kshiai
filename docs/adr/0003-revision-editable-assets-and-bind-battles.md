# ADR-0003: Revision editable assets and bind battles

- Status: Superseded
- Date: 2026-08-12
- Decision owner: Product owner
- Superseded by: ADR-0010
- Related: GitHub Issue #98; ADR-0002; `docs/battle-phase-authority.md`; `docs/battle-world-model.md`

## Context

Characters, narration styles, battlefield presets, dialogue pipeline settings, and similar assets can be edited after a battle starts. A battle currently stores a concrete battlefield, a narration style snapshot, a dialogue-pipeline snapshot, and combatant parameters. However, each advance reloads the current character sheets and uses their latest skills, basic attacks, profiles, memories, and agent context. Editing a character mid-battle can therefore combine old combat state with new abilities or identity facts.

Timestamps and one-step undo snapshots do not provide durable generation identity. Historical battles, retries, narration jobs, and replays need to name the exact source generations they used.

## Decision drivers

- Every turn must use one internally consistent set of source facts.
- Retry, replay, and asynchronous narration must reconstruct the same inputs.
- Editing an asset must not alter an active or historical battle implicitly.
- Administrators must be able to identify the source generation of observed behavior.
- Legacy data must remain readable without inventing generation history.

## Considered options

1. Continue reading mutable current assets and rely on timestamps. This cannot reproduce overwritten content and is rejected.
2. Copy selected fields into each battle without generation records. This freezes behavior but cannot audit or deduplicate the source and risks omitting fields.
3. Store immutable asset generations and bind each battle to exact generation IDs plus validated snapshots. This adds storage and migration complexity but provides durable identity and reproducibility.

## Decision

Choose option 3.

Every editable domain asset has a stable logical asset ID and immutable monotonically increasing generations. An edit creates a new generation; it never mutates the content of an existing generation. The current pointer may move to a newer generation, while historical generations remain addressable subject to retention rules.

At battle creation, the server binds all gameplay and rendering dependencies to exact generations and stores a validated immutable battle asset manifest. At minimum it covers:

- Side A and Side B character generations, including identity, profile anchors, parameters, basic attack, skills, equipment, combat flags, decision profile, and other agent-authoritative character fields.
- Narration style generation and complete rendering/perspective snapshot.
- Battlefield preset generation and the concretized battlefield instance derived from it.
- Dialogue pipeline/settings revision.
- Versioned battle rules, balance, temporal, policy, and prompt-contract identifiers when they affect results.

Advancement, bucket retry, semantic reconciliation, character agents, narration jobs, history tools, and administrator observability use the battle manifest or its snapshots. They must not reload mutable current assets for authoritative inputs. Current asset records may be read only for explicitly non-authoritative presentation that cannot change historical meaning, and such use must be labelled.

An active battle stays on its bound generations. Applying newer generations requires an explicit migration operation governed by a separate ADR, compatibility validation, and an auditable receipt; ordinary edits never migrate battles automatically.

## Consequences

### Positive

- Mid-battle edits cannot change skills, personality, appearance semantics, battlefield rules, or narration style unexpectedly.
- Retries and asynchronous narration can reconstruct exact inputs.
- Historical evidence can name the asset generation that produced it.
- Editing and rollback become pointer changes or new generations rather than destructive overwrites.

### Negative and risks

- Repositories need generation tables or equivalent append-only storage and current pointers.
- Snapshots and old media references require retention and garbage-collection rules.
- Battle rows become larger unless manifests reference normalized generation records.
- Privacy deletion and legal erasure need tombstones and scoped redaction rather than ordinary deletion.
- Existing owner memory and rating fields must be classified as battle-frozen or live external state.

## Compatibility and migration

- Existing concrete battlefield, narration style, and dialogue pipeline snapshots are retained and treated as legacy embedded generations with unknown generation IDs.
- Existing character battles receive a legacy manifest from the data already embedded in the battle only where complete. Missing skills or profile facts remain `unknown`; they are not backfilled from the current character and presented as historical truth.
- New battles require a complete versioned manifest and fail closed if any authoritative generation cannot be bound.
- Active legacy battles may continue on the legacy path or require an explicit owner-approved migration; no silent rebinding is allowed.
- Public DTOs expose only safe asset/version labels. Internal observability exposes generation IDs and manifest validation status.

## Verification

- Editing either character during a battle does not change subsequent available actions, mechanics, profile grounding, speech identity, or narration inputs.
- Editing a narration style or battlefield preset does not change an existing battle or pending narration job.
- Retry and resume use the same manifest hashes and generation IDs.
- New battles reject missing, mismatched, or mutable generation bindings.
- Legacy records never claim a generation that was not recorded.
- Administrator observations display the bound generation and distinguish legacy unknowns.

## Implementation references

- Existing partial snapshots: concrete battlefield instance, narration style snapshot, and dialogue pipeline snapshot in `BattleState`.
- Existing inconsistency to remove: `advanceTurnWithLease` reloads current character sheets for authoritative mechanics and agent inputs.
