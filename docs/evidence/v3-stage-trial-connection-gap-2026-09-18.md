# First V3 character Stage-battle trial: local connection gap

- Checked: 2026-09-18 against `origin/main` at `afcba30`.
- Owner outcome: try V3 characters in a real Stage battle. The owner selected two new V3 characters for this first trial and excluded V3-versus-V2; full V2 migration is not the trial's completion condition.
- This is a local implementation survey, not a decision to deploy, activate a character, call a provider, or start a Stage battle.

## Local candidate outcome

`packages/shared/src/v3-stage-trial-candidate.ts` now constructs one original,
deterministic V3 envelope (夜航の灯守・ネヴァ) with V3 action norms,
conscious guidance, and mechanical fallback. The source is a short declared
manual brief; the fuller definition is authored in code. The public-profile
projection and claim receipt are internally consistent, but the claim receipt
is self-declared rather than independent editorial review. The candidate is
not exported by the shared package or stored in Stage.

`packages/shared/src/v3-stage-trial-second-candidate.ts` adds a distinct
second candidate (潮騒の記録士・リオ). Compared with Neva's cautious defense, Rio's
norms favor acting on an observed situation change while steady and using a
defensive note only in a critical condition. Both remain local source-code
fixtures, not registered Stage characters. Rio's claim receipt has the same
self-declared review limit.

Local observations after the second addition: 3 dedicated tests per candidate
and all 355 shared tests passed; full repository typecheck passed after building
the shared package. The dedicated tests reach
`CharacterBattleCompilerInputsV4Schema` but not a complete
`BattleCharacterAssetBindingV4` or battle execution. The candidate and test
have exact source-bound SealGraph refs
`implementation/v3-stage-trial-candidate` and
`verification/v3-stage-trial-candidate`. The second candidate and test have
corresponding refs `implementation/v3-stage-trial-second-candidate` and
`verification/v3-stage-trial-second-candidate`. All four are **draft** because
their authoring-v5 authority Cause is still draft. Their scoped statuses are
clean and `sealgraph fsck` reports `ok`. These facts are local structural
evidence, not accepted authoring or Stage-play evidence.

The root `npm test` run did not pass: shared tests passed, then backend tests
reported that the `better-sqlite3` native binding could not be located in this
worktree's dependency installation. The long-running backend suite was
interrupted after those failures; frontend tests in the same run passed.
This is a verification limit, not evidence of a V3 Stage battle defect or
success.

## What exists

Strict `CharacterDefinitionV3` and `CharacterGenerationEnvelopeV3` parsing, V3 compiler contracts, and `BattleCharacterAssetBindingV4` are defined in `packages/shared/src/character-definition-v3.ts`. `backend/src/repositories/character-generation-reader.ts` can read a specified immutable V3 generation, project its legacy sheet, and report capability compatibility. `backend/src/scripts/supabase-auth-smoke.ts` appends and reads a non-current V3 fixture in Stage smoke without moving the current pointer. That smoke does not make a V3 character selectable or use one in battle.

## Missing connections to the owner outcome

| Boundary | Current behavior | Needed for a real first trial |
| --- | --- | --- |
| New character registration and activation | `backend/src/repositories/characters.ts` `saveSheet` imports a newly inserted character as V2. Public `/characters/generate` and `/characters/:id/confirm` in `backend/src/routes.ts` use the V2 authoring/activation path; `backend/src/repositories/character-assets-v2.ts` asserts and appends schema 2. | A separately controlled path to register one owner-owned new character and append/activate its validated V3 envelope atomically, without silently importing V2 or moving an unrelated pointer. The candidate's provenance and owner review remain explicit. |
| Ready/read/select | `getCharacterCompatibility` and `getReadyCharacterGeneration` in `character-assets-v2.ts` require current schema 2. `listReadyCharacterIds` selects only schema 2. Public character DTOs use that readiness for `selectable`. | Capability-scoped current V3 readiness and selector/read-model behavior for the trial character. Historical V2 behavior stays readable; listing/search/battle must not generate or migrate as a side effect. |
| Battle creation and frozen binding | `backend/src/services/battle-service.ts` `startBattle` loads two V2-ready generations, parses two V2 envelopes, and freezes `character_generation_v2` plus `compilerInputsV2` in the manifest. | Bind the exact V3 generation, content digest, V3 basic-action source, and `CharacterBattleCompilerInputsV4` into an immutable battle. The current `BattleAssetManifestV3` in `packages/shared/src/battle.ts` denotes the dialogue V3 tuple but still contains V2 character-generation provenance; it cannot simply be relabeled as character V3. |
| Battle consumers and persistence | `boundConsciousCompiler` in `backend/src/llm/conscious-agency.ts` returns V2/V3 compiler inputs, while battle-service consumers read `compilerInputsV2` or `compilerInputsV3`. The shared battle manifest union supports versions 1–3, not a binding that contains compiler inputs V4. | Admit the V3 character compiler through the actual decision/narration/mechanics consumers, persist/reload the new immutable tuple, and verify a full Stage battle. A schema-only pass or an isolated V3 read is insufficient. |
| Stage use | Existing A3/B8 plan task `cc302` verifies corrected V2 creation and historical V2/non-current V3 reads. `.github/workflows/stage-release.yml` dispatches from an exact annotated tag and runs deployment and existing smokes. | Separately approve and deploy a revision containing the V3 trial path, register both trial characters, verify selectable/current/bound identities, then have the owner try a real Stage battle. No production promotion follows automatically. |

## Dependencies and trial boundary

The local candidates and battle-path implementation can be investigated independently. Actual Stage use needs both a V3 current/selection path and a V3 battle-bound path, followed by deployment and observed play. Full eight-character migration, provider-backed migration generation, and production schema-3 authoring cutover are not demonstrated predecessors of this first Stage trial.

The first battle uses two new V3 characters, per the owner's 2026-09-18 direction. V3-versus-V2 mixed binding is outside this first-trial scope. The current manifest contracts do not yet establish all-V3 runtime binding; the owner direction removes a mixed-version requirement but does not by itself make the battle path usable.

## Evidence boundary

This survey inspected repository code and the local plan only. It did not inspect current Stage character inventory, deploy a revision, create a user character, alter a pointer, call a provider, or run a battle. A locally validated new V3 candidate will demonstrate candidate structure and available compiler compatibility only; it will not prove automatic authoring, Stage activation, battle behavior, or user satisfaction.
