# ADR-0032: Bind V3 characters to versioned battles

- Status: Accepted
- Revision: 1
- Date: 2026-09-18
- Decision owner: Product owner
- Authority: Same-basename `.think`; this Markdown is its human-readable projection.
- Related: ADR-0010, ADR-0030; `docs/character-v3-stage-trial.pert` vt101–vt103; `docs/evidence/v3-stage-trial-connection-gap-2026-09-18.md`.

## Context and decision drivers

The first V3-versus-V3 Stage trial needs a battle to freeze two V3 character generations and use their V4 compiler inputs after save and reload. Today `startBattle` reads V2-ready generations and records `character_generation_v2` and `compilerInputsV2`. Existing battle-manifest version 3 changes the dialogue tuple, not the character generation. Reusing that version for V3 characters would change the meaning of recorded battles. Accepted ADR-0010 requires read-only binding of exact compatible current generations; ADR-0030 defines the V3 compiler and provenance identities; ADR-0028 fixes the dialogue-V3 compact, activation, psyche-reaction and complete-discriminator tuple. The owner excluded a mixed V3-versus-V2 first trial.

## Considered options

1. Relabel manifest version 3 for V3 characters: smallest schema diff, but misrepresents historical version-3 battles.
2. Introduce a general mixed-version manifest now: broader capability, but adds execution and compatibility behavior not needed for this first trial.
3. Add one distinct all-V3 manifest variant: a new persistence/consumer branch, but preserves old meanings and matches the trial scope. **Accepted.**

## Decision

1. Add `BattleAssetManifestV4` for battles created with two V3 character generations. Each side uses the existing `BattleCharacterAssetBindingV4` contract: exact asset and generation IDs, content digest, immutable combat-ready snapshot, `character_generation_v3` basic-action source, and `CharacterBattleCompilerInputsV4`. Preserve ADR-0028's dialogue schema-3 compact projection, activation identity, psyche-reaction-policy-v1, exact character digests, and complete-tuple discrimination. The character compiler member advances from V3 to V4; other frozen asset and rule identities remain bound.
2. Battle creation reads each current V3 generation through the compatible current-pointer/readiness contract provided by `vt101`. Missing, mismatched, blocked-capability, or mixed-version inputs fail closed. The exact battle-required capability set must match V4 consumers and be verified with `vt101` before integrated creation. Creation does not append/activate generations, call authoring, silently convert V2, or rebind an active battle. `vt102` may prepare binding independently; a complete local creation proof depends on `vt101`.
3. Execution, retry, reload, narration, presentation, and observation consume the frozen V4 tuple. V3 action norms select actions; conscious guidance does not become a mechanical selector. Registered fallback follows legality revalidation and records its conflict receipt under ADR-0030. Do not coerce V4 inputs into a V2/V3 norm program or reread mutable current character data as authoritative input.
4. Parse and persist version 4 while retaining versions 1–3 with their existing meanings. Existing battles are not migrated. This ADR does not decide mixed-version battles, V2 migration, provider generation, Stage activation, or production promotion.

## Consequences and compatibility

The all-V3 battle has an auditable immutable identity and can preserve behavior across retries and reloads. Cost: a new manifest variant and V3-specific consumer routing; missed consumers could reject version 4 or read stale current data. The V3 reader currently reports compatibility but does not itself reject blocked current generations; `vt101` must supply and test that boundary. Existing V2 and dialogue-version-3 battles must continue unchanged. `vt101` registration/selection and the separately authorized release and Stage gates remain outside this decision.

## Verification and implementation boundary

Test exact generation/digest binding, schema rejection of mixed or malformed tuples, persistence/reload, retry after a character edit, V3 norm/guidance/fallback consumption, narration and public projection, and V1–V3 regression. A fixture-only schema test is not completion evidence. No Stage write or owner play is authorized by this ADR.

## Acceptance

On 2026-09-18 the product owner accepted exact revision 1 after the full Japanese review scope, alternatives, risks, and unknowns were presented. Its pre-acceptance authoritative `.think` SHA-256 was `39fa661060cba238014836fca416ff819d80ce0c3b85ba9a60c7e08e6e8ce3ed`. Acceptance authorizes vt102 implementation of this contract, not Stage writes, release, or trial completion.
