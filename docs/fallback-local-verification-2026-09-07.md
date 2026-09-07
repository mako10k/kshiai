# Fallback remediation local verification

Status: local acceptance evidence for `FPR_LOCAL_VERIFY`

Reasoning record: [`fallback-local-verification-2026-09-07.llmthink.dsl`](fallback-local-verification-2026-09-07.llmthink.dsl)

Baseline: local tracking ref `origin/main` at
`a4184d4188e050d8db63aea5aac004d1b6496d07`

Candidate: `codex/monotony-log-rca` at
`78c2dfd86bdf7bd6c0b0e9218c362e352480f68f` before this verification record

Remote freshness is not established by this task. This record accepts the local
candidate for owner review; it does not establish push, hosted CI, merge, release,
deployment, migration, or production behavior.

## Twenty-one-point reconciliation

The `Source correction or retained contract` column identifies what controls the
mechanism that creates or selects state. The `Detection or containment evidence`
column is intentionally separate: a receipt or test does not substitute for source
correction.

| ID | Class | Source correction or retained contract | Detection or containment evidence | Direct regression evidence | Local verdict |
|---:|:---:|---|---|---|:---:|
| 1 | U/P0 | Create and revision requests use complete-definition generation; gap fill is limited to upgrades and rejects an empty owner source while gaps remain. | Structure failures remain errors rather than mock or unchanged success. | `openai-compatible-character-definition.test.ts`: `does not replace a structure error with mock output`, `rejects missing owner source while definition gaps remain`, `returns an already complete upgrade base without calling the provider`, `routes revisions through complete definition generation` | corrected |
| 2 | A/P0 | Prose is no longer synthesized into executable predicates, selectors, or a `wait` constraint; incomplete and selector-free norms are rejected. | Validation reports the invalid authoring result at its boundary. | `character-definition-check.test.ts`: incomplete action norm and selector-free structured norm rejection cases | corrected |
| 3 | A/P0 | Legacy principles are carried only into explicit structured-generation preparation and are not converted into executable norms. Existing immutable generations are not rewritten. | Migration input retains the legacy source instead of concealing invented mechanics. | `character-definition-check.test.ts`: unstructured legacy principle rejection and explicit preparation cases | corrected |
| 4 | U/P0 | Invalid review fills terminate as application-invalid output; provider failure is separate and cannot become `null` or mock acceptance. | Bounded validation details identify the application failure. | `openai-compatible-character-definition.test.ts`: `rejects an invalid review fill instead of treating it as no revision` | corrected |
| 5 | B/P2 | Ordered provider continuation is retained. | Durable route receipts contain the failed provider, bounded reason, cooldown state, and selected provider or exhaustion. | `fallback.test.ts`: `captures failed and cooldown-active routing with the selected provider`, `captures exhausted routing with no selected provider` | retained + observed |
| 6 | DEV | Real providers remain `fallbackOnError: false`; mock authority requires explicit non-production configuration. | Configuration tests guard the environment boundary. | `provider-config.test.ts`: `mock provider boundary` | retained |
| 7 | B/P2 | Deterministic encounter presentation remains the bounded substitute, but an incomplete proposal is rejected before selection. | Encounter source and bounded provider-route receipts are persisted with the creation/idempotency snapshot. | `battle-social.test.ts`: `rejects incomplete encounter proposals before deterministic fallback`; `battle-create-idempotency.test.ts`: provider-route persistence cases | retained + observed |
| 8 | U/P0 | Transport unavailability may retain prior psyche state; schema or consistency rejection is a distinct application defect and cannot masquerade as provider absence. | Deep-psyche trace records disposition and bounded causal detail. | `battle-speech-wiring.test.ts`: inherited compact-memory clearing on provider unavailability; `records deep-psyche schema rejection as an application defect` | split + corrected |
| 9 | U/P0 | Agent proposals are validated against server action authority; invalid actions are not accepted, while absence/unavailability produces the explicit conservative no-proposal result. | Agent trace distinguishes provider unavailability from application rejection and records why no proposal was accepted. | `battle-speech-wiring.test.ts`: `records fulfilled speech with a rejected action as application rejection` and invalid/targeted action-rejection cases | split + corrected |
| 10 | B/P1 | Conservative policy/stance selection remains and uses the same observer-safe inputs; it receives no hidden opponent input. | `ActionSelectionReceipt` records planned disposition, source layer, reason, policy, and opponent-input disposition. | `battle-engine.test.ts`: `records repeated planned-action fallback without hidden opponent input` and planned-action acceptance cases | retained + provenance restored |
| 11 | B/P3 | Rejected later-bucket proposals still select one deterministic listed action. | `causalLaterDecision` persists rejection, selected action, provider, validation, elapsed time, and reason. | `scene-beat-wiring.test.ts`: `persists a rejected later-bucket proposal and its deterministic choice` | retained |
| 12 | B/P3 | The accepted feasibility mapping remains bounded by canonical reasons and available actions; absence of any feasible action remains failure. | The original reason and chosen substitute remain in the resolution. | `action-feasibility.test.ts`: `retains every remaining feasibility reason-to-substitute mapping` plus partial, spacing, and line-of-sight cases | retained |
| 13 | B/P3 | Constraint conflicts use the highest-ranked legal declared fallback, otherwise legal `wait`; no unavailable action is invented. | Receipt retains conflict, norm IDs, exclusions, ranking, and fallback identity. | `character-definition-rules.test.ts`: declared fallback and illegal-fallback-to-wait cases | retained |
| 14 | U/P1 | Only typed recoverable absence may continue with minimal projection; invalid deterministic perception state throws rather than being normalized by a blanket catch. | The narrowed continuation can be identified without swallowing invariant/schema failures. | `battle-public.test.ts`: `projects engine cues normally after invalid sensory evidence is rejected`, `does not normalize an invalid prior perception registry` | split + corrected |
| 15 | A/P0 | Committed utterance projection is atomic: invalid continuity rejects the expression commit instead of retaining a stale frame as current. | The failure boundary is explicit and no partial perception transition is committed. | `battle-speech-wiring.test.ts`: `rejects expression commit atomically when current projection continuity is invalid` | corrected |
| 16 | B/P3 | Semantic and world reconciliation retain atomic no-change behavior; malformed patches commit neither half. | Rejected semantic and skipped dependent world receipts share the zero revision. | `battle-public.test.ts`: `keeps the committed state when a provider patch is invalid` | retained |
| 17 | B/P2 | Failed free-action adjudication still makes no canonical change. | Durable subtype distinguishes provider unavailability from malformed/schema-invalid adjudication. | `free-action-service.test.ts`: `classifies a malformed adjudication as an application schema failure`, `persists provider failure subtype without changing canonical state` | retained + observed |
| 18 | U/P1 | Only absent legacy semantic seed uses tagged obstacle compatibility; present invalid seeds and invalid assembled state are rejected. An intentionally empty valid seed remains valid. | Compatibility source is explicit rather than inferred from parse failure. | `semantic-state.test.ts`: empty seed preservation, present-invalid rejection, and invalid-assembled-state rejection | split + corrected |
| 19 | U/P1 | `CombatReadyCharacterSheet` requires `basicAttack`; defaulting exists only at the named legacy hydration boundary, and modern definitions must author it. | Manifest binds `basicAttackSource` to its source generation and rejects mismatches. | `battle-asset-manifest.test.ts`: missing-current rejection, v1 compatibility labeling, generation match; `structured-character.test.ts`: authored modern basic action | split + corrected |
| 20 | B/P3 | Terminal narration continuity is retained; raw exception text is no longer persisted or published and is mapped to a closed reason taxonomy. | Failed public event keeps deterministic narrative and bounded reason, then releases its successor. | `narration-worker.test.ts`: `bounds retries and releases the successor with a terminal fallback` | retained + privacy corrected |
| 21 | B/P3 | Engine result exclusively owns `winnerSide`; provider explanation cannot change the committed winner. Provider absence uses deterministic reason/facts. | Adjudication records deterministic-fallback source and `engineFallbackSide`. | `battle-speech-wiring.test.ts`: `persists one canonical adjudication independent of presentation inputs` | retained |

Count: **21/21 reconciled**. Source-producing defects are corrected for points
1-4, 8, 9, 14, 15, 18, and 19. Point 20 also contains a source-side privacy
correction. Points 5, 7, 10-13, 16, 17, 20, and 21 retain bounded continuation
with proportional receipts or regression protection; point 6 remains explicitly
development-only.

## Boundary review

- The branch adds no `any`, `Record<string, any>`, `Record<string, unknown>`,
  double-cast, or TypeScript suppression escape on added lines. Closed shared
  schemas cover battle state, continuation, provider routes, action selection,
  agent traces, semantic receipts, and basic-action provenance. This is a claim
  about this branch and the repaired boundaries, not an assertion that unrelated
  historical repository code contains no casts.
- Battle creation binds character, narration-style, battlefield, and dialogue
  pipeline generation IDs with embedded snapshots. Point 19 additionally binds
  `basicAttackSource.generationId` to the character generation. No task in this
  branch mutates an existing immutable asset generation in place.
- Persisted/public failure details use bounded classifications. In particular,
  narration no longer exposes `Error.message`; provider-route and application
  rejection details are purpose-specific receipts rather than arbitrary records.
- The local `origin/main...HEAD` diff contains the intended shared contracts,
  backend LLM/battle services, regression tests, and fallback planning evidence.
  It contains no `.env`, token store, SQLite data, generated `dist`, or user media.

## Validation

Final command results:

- `git diff --check origin/main...HEAD` and the working-tree diff check: passed.
- Focused seventeen-file regression run: **210 passed, 0 failed**.
- `npm test`: shared **304/304**, backend **294/294**, frontend **20/20**,
  deployment **3/3**.
- `npm run typecheck`: passed for every workspace and deployment worker.
- `npm run build`: passed; Vite reported only the existing advisory that one
  generated chunk exceeds 500 KiB.
- Command-line `llmthink dsl audit` for every reasoning record added by this
  branch and this verification record: **0 fatal, 0 error, 0 warning**. The local
  verification record retains one informational item because external evidence is
  intentionally still pending.
- Added-line type-escape scan: **0**; prohibited artifact-name scan: **0**;
  secret-assignment pattern scan: **0**; ADR change count: **0**.
- `perttool document check`: passed. `perttool dag analyze --schedule both`:
  passed with only `PTDAG-208` closure-milestone advisories already represented
  by completed predecessor tasks.
- PERT readback: digest
  `sha256:a91dcd95b4dec967705802327673f9f24f4d013f0b3cfab79dc4096f8dd21117`,
  no active task, and `FPR_APPROVE_PUSH` is the sole ready/recommended task with
  owner `user`.
- `npm run adr:check`: not applicable; this branch changes no ADR

## Retained unknowns and next gate

- Current GitHub `main` freshness is unknown because this local verification does
  not contact the remote.
- Hosted CI, Stage, production behavior, operational fallback frequency, and
  historical affected-generation inventory are not established locally.
- Passing tests do not mark owner review, push approval, integration, release, or
  migration complete. The next PERT task remains owner-gated and must not be
  started by this verification task.
