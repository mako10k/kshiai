# Production observation — 0.17.4 (2026-08-13)

## Result

The single authorized bounded observation passed on the exact `v0.17.4`
production artifacts. The battle finished normally, the provider-operation
ledger stayed below its atomic ceiling, and the retained narration attempt
count reconciled exactly with both narration receipts and physical provider
attempts. No rollback was triggered.

## Immutable release and workflow identity

| Item | Evidence |
| --- | --- |
| Release tag | `v0.17.4` |
| Release commit | `abb42e6b138b27f6f3ef075178d5d00b0b3bf151` |
| Backend image | `sha256:3d21a2f60d1cbab14ae5a493033a4701bc85e4d045d16ddcb91014b5137cc5b8` |
| Cloud Run revision | `kshiai-api-00090-luh` |
| Worker version | `4b25b139-bebf-49d3-9dc5-d057bafaf674` |
| Stage | run `31657704957`, success |
| Promote | run `31658001263`, success |
| Observation | run `31658142563`, success |
| Observation run ID | `github-31658142563-1` |
| Cloud Run Job execution | `kshiai-persistent-e2e-5nwlr` |
| Receipt artifact | `persistent-e2e-kshiai-persistent-e2e-5nwlr`, artifact `9165209481` |
| Receipt file SHA-256 | `3cfaabca7177477e3efbf4f8c8772deecb2aceca51910ec210c9e0b9d91a8e4a` |
| Retained battle | `btl_85a6e128fdba9fc15d30d1e4de62238c` |

The workflow independently verified that the revision was the single 100%
production target, used the digest-bound image above, and had guarded narration
and the expected administrator binding before creating the battle.

## Provider-operation acceptance

The approved ceiling was 169 physical attempts for at most 24 advances. The
battle used 57 attempts:

| Layer | Projected ceiling contribution | Actual physical attempts |
| --- | ---: | ---: |
| Encounter | 2 | 2 |
| Character expression | 92 | 29 |
| Deep psyche | 4 | 4 |
| Environment | 44 | 11 |
| Narration | 26 | 11 |
| Referee | 1 | 0 |
| **Total** | **169** | **57** |

- Taxonomy revision was `battle-provider-operations-v1`.
- The by-layer total equalled the durable ledger total: 57.
- Retained narration provider operations, physical narration attempts, and
  terminal narration receipts were all 11.
- All narration receipts converged in order, each had one attempt, and live
  delivery generations were zero.
- The provider returned a total token count of 260,247. It did not provide a
  reliable monetary cost, so `estimatedCostUsd` correctly remained `null`.

## Battle and presentation observation

- The cross-account test-realm battle finished at turn 9 of a 12-turn policy;
  side A won by incapacitation.
- Eleven advances completed in 99,138 ms total. Advance latency was 9,279 ms
  p50 and 12,238 ms p95/max for this one sample.
- The retained internal view contained 10 turn records and 9 canonical
  transitions. Battle history visibility passed.
- Test-realm sharing passed and general-character leakage was not observed.
- Dialogue contained 19 lines with a 0.684 exact-unique rate. Six exact
  duplicates came from side B, whose longest exact repeat run was four; no line
  was classified as a reaction. This is a quality observation, not an
  accounting or release acceptance failure.

## Scope and remaining unknowns

This is one bounded synthetic battle. It confirms the release path and fixes
the v0.17.3 provider-attempt accounting gap, but it does not establish a
population pacing distribution or authorize another paid observation. The
owner's separate pacing-policy decision remains the next PERT frontier.
