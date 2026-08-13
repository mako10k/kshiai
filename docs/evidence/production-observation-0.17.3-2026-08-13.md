# Production observation — 0.17.3 (2026-08-13)

## Conclusion

One bounded synthetic observation confirmed the production battle lifecycle and
provider path operate normally on `v0.17.3`. The battle finished, every
narration receipt converged, history was visible, and all 58 logged LLM
operations succeeded without a logged retry or failure.

The cost telemetry is not acceptance-grade. Persisted observation data reported
zero narration HTTP attempts despite 11 successful narration operations, and
the projected layer budget omitted four observed deep-psyche operations.
Additional paid observation is paused until by-layer actual-operation accounting
is corrected and verified without another production battle.

## Bound identity

| Item | Value |
| --- | --- |
| Release | `v0.17.3` / `6bbf60f2c92b3b1084d8a74fa6fcdf330577f875` |
| Cloud Run revision | `kshiai-api-00088-guy` (100% traffic) |
| Workflow run | [31653257074](https://github.com/mako10k/kshiai/actions/runs/31653257074) |
| Observation run | `github-31653257074-1` |
| Cloud Run job execution | `kshiai-persistent-e2e-lxc2g` |
| Battle | `btl_bdc8bd7c4df5c9766dbb68a4b86a7419` |
| Receipt artifact | `persistent-e2e-kshiai-persistent-e2e-lxc2g` (`sha256:59cec2f25d823806669d3de2031ce0885f5fc8aea9ccac806345df72e96e9c88`) |
| Observation time | `2026-08-13T00:08:52.321Z` |

The workflow was dispatched once with `max_advances=24` and an overall
provider-operation ceiling of 100. No retry or second observation was run.

## Confirmed functional results

- The workflow and Cloud Run observer job exited successfully.
- The battle finished at turn 9 of 12 with side A winning by
  `incapacitated`; the prologue, nine turns, and aftermath produced 11 advances.
- Internal observation returned 10 turn records and nine canonical transitions.
- All 11 narration queue entries were terminal, ordered, projected, and had
  exactly one receipt attempt. No entry remained blocking or leased.
- Cross-account test-realm sharing and history visibility passed; general
  character leakage was not observed.
- Revision logs contained 58 successful LLM operations and no logged provider
  failure or retry during the observation window.

| Logged operation | Count |
| --- | ---: |
| `advanceCharacterAgent` | 21 |
| `advanceCharacterPsyche` | 4 |
| `concretizeBattlefield` | 1 |
| `decideCharacterAction` | 8 |
| `narrateAftermath` | 1 |
| `narratePrologue` | 1 |
| `narrateTurn` | 9 |
| `prepareBattleEncounter` | 1 |
| `proposeHappening` | 3 |
| `reconcileTurnSemanticState` | 9 |
| **Total** | **58** |

## Cost-telemetry discrepancy

- The durable observation summed narration `httpAttempts` as 0, while revision
  logs show 11 successful narration calls: one prologue, nine turns, and one
  aftermath. This matches the 11 terminal narration receipts, so the functional
  path succeeded but the actual-attempt counter did not represent it.
- The projected budget assigned zero operations to `deepPsyche`, while logs show
  four `advanceCharacterPsyche` calls.
- The projection assigned one encounter operation, while logs show both
  `concretizeBattlefield` and `prepareBattleEncounter`. Whether both belong to
  that layer is under-specified, so the layer taxonomy also needs an explicit
  mapping.
- Only narration HTTP attempts were presented as measured actuals; all other
  layer values remained projections. The observed total of 58 is below the
  overall ceiling of 100, but the current evidence cannot enforce that ceiling
  accurately by layer.

## Product observation boundary

The 19 dialogue lines contained 11 exact-unique lines and eight exact
duplicates; each speaker's longest exact-repeat run was four. This is useful
quality evidence, not a pacing decision: one fixed synthetic fixture cannot
support adopting or rejecting the candidate or retuning policy values.

No database migration, environment change, release change, or additional
production battle is authorized by this result. Resume observation only after
actual provider operations are accounted for by layer and the corrected guard
has passed local and Stage validation.
