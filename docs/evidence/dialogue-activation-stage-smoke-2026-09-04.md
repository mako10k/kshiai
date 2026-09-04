# Compact-dialogue Stage smoke outcome — 2026-09-04

## Result

`DAF_STAGE_SMOKE_1` stopped on its first and only authorized Cloud Run Job
execution. The Stage deployment remained healthy and received no production
traffic, but the persistent observer rejected its retained character fixtures
before creating a battle. No battle advance, LLM provider attempt, fallback,
retry, token usage, cost estimate, or battle-bound dialogue activation receipt
was produced. The failed execution was not retried and no replacement battle
was started.

This is a retained failed Stage outcome. It is not evidence about compact
dialogue quality and does not authorize Promote, a persisted dialogue setting,
production traffic, or another provider-backed observation.

## Immutable target and execution identity

| Item | Readback |
| --- | --- |
| Release tag | `v0.22.0-rc.1` |
| Release commit | `c088e46e45da449502711ea4b10d3c6e7c68e664` |
| Backend image | `asia-northeast1-docker.pkg.dev/kshiai/kshiai/backend@sha256:b78366f16297f8a9de185dcaeebd10ed8c69177e5bbd755c5316ba2136a6c097` |
| Stage workflow | GitHub Actions run `33854375645`, success |
| Stage Cloud Run revision | `kshiai-api-00118-ziv`, Ready=True |
| Stage backend tag | `release-v0-22-0-rc-1`, no traffic percentage |
| Stage Worker version URL | `https://6a49f64a-kshiai-web.mako10k.workers.dev` |
| Production target during the observation | `kshiai-api-00116-doz`, 100% |
| Observer job | `kshiai-persistent-e2e`, generation 28 |
| Observation run ID | `stage-33854375645-1` |
| Job execution | `kshiai-persistent-e2e-l2hck` |
| Execution start | `2026-09-04T18:50:43.617917+09:00` |
| Execution completion | `2026-09-04T18:51:02.778851+09:00` |
| Execution outcome | failed, task exit code 1, Cloud Run retries 0 |
| Observer command readback | `sh -lc`, two arguments, wrapper SHA-256 `3d6314cd960d15c78813b51b5f5ac5e2ed43b70911aadfcf36883d5c7805bf7c` |

Immediately before execution, the immutable Worker health route returned
`ok=true`, `database=postgres`, `auth=supabase`, and the expected configured LLM
route. The Stage revision readback bound `compact`, `deployment_override`, the
release commit above, and the exact backend image above. Because no battle was
created, these deployment settings were never converted into a battle-owned
activation receipt.

The existing production-bound observer job was deliberately updated to the
Stage target for this one execution. It remains Stage-bound after the failure;
no scheduled execution was present and this task did not restore or execute a
production observer configuration.

## Authorized limits and measured use

| Measure | Authorized bound | Measured result |
| --- | ---: | ---: |
| Cloud Run executions | 1 | 1 failed execution |
| Battles | 1 | 0 |
| Advances | 24 | 0 |
| Physical provider attempts | 169 | 0 |
| Same-provider retries | existing adapter policy | not reached |
| Provider fallback | existing route | not reached |
| Reported tokens | observation only | unavailable; no provider run |
| Estimated cost | observation only | unavailable; no provider run |
| Dialogue loop outcome | stop on recurrence | not evaluated; battle loop not entered |

A read-only PostgreSQL reconciliation for the exact run ID returned zero
`provider_operation_runs`, zero battles with that `observation_run_id`, and zero
`persistent_e2e_observation` events. The provider run is created only after
fixture visibility passes, and battle creation follows that ledger creation.
The exact logged failure therefore occurred before every provider-backed or
battle-loop operation.

## Failure and causal classification

Cloud Logging retained the observer error:

```text
match candidates did not expose the shared E2E fixture chr_e2e_dialogue_gaku
```

The observer had already refreshed both synthetic Supabase passwords, mapped
the application accounts, set their account kinds to `e2e` and `test`, and
completed its fixture-ensure call. Existing character and battlefield rows
predate this execution. The narration-style row was refreshed during the
fixture-ensure phase. No fixture disposition receipt was printed because the
runner stopped at the following visibility assertion.

The subsequent read-only database and repository reconciliation established:

| Fixture | Exists / deleted | Current compatibility | Ready generation |
| --- | --- | --- | --- |
| `chr_e2e_dialogue_nagi` | exists / no | `unsupported`, schema 2, `missing_required_compiler` | absent |
| `chr_e2e_dialogue_gaku` | exists / no | `unsupported`, schema 2, `invalid_v2_envelope` | absent |

- **Root cause:** the persistent fixture reuse path treats an existing,
  correctly owned, non-deleted character row as reusable without checking that
  its current immutable generation still satisfies the active V2 compiler and
  envelope readiness contract. The matchmaking repository correctly exposes
  only ready V2 generations, so the two stale retained fixtures yielded zero
  eligible candidates.
- **Contributing cause:** the shared Stage database retains fixture generations
  created under earlier character contracts; later required-compiler and
  envelope validation can make those generations unsupported without changing
  the legacy character row that the reuse gate checks.
- **Escape cause:** the fixture regression creates fresh rows and then reuses
  those still-valid rows. It does not cover a retained fixture whose character
  row is valid while its immutable current generation has become unsupported.
- **Corrective direction:** make the synthetic fixture provisioning path
  readiness-aware and define an explicit immutable upgrade/reactivation for
  unsupported E2E generations while preserving accumulated operational state.
  Do not weaken the selector's fail-closed readiness rule.
- **Recurrence-prevention direction:** add a regression fixture for an existing
  E2E character with stale compiler/envelope compatibility and require the
  provisioning result to leave both observer characters selector-eligible.

The exact repair is intentionally deferred to `DAF_REPLAN_FOCUS`. This outcome
does not authorize directly mutating the shared fixtures, changing selector
eligibility, deploying a repair, or running the Stage observer again.

## Evidence sources

- GitHub Actions Stage run `33854375645` and its immutable release readbacks.
- Read-only Cloud Run service, revision, job, and execution descriptions on
  2026-09-04.
- Cloud Logging entries for execution `kshiai-persistent-e2e-l2hck`.
- Read-only PostgreSQL queries for exact run ID, account kinds, fixture
  compatibility, readiness, and creation/update timestamps.
- `backend/src/scripts/persistent-battle-e2e.ts` for the fail-before-ledger and
  fail-before-battle execution order.
- `backend/src/e2e-observer.ts` for the row-only character reuse gate.
- `backend/src/repositories/characters.ts` and
  `backend/src/repositories/character-assets-v2.ts` for fail-closed selector
  readiness.
- `backend/src/e2e-observer.test.ts` for the current fresh-and-reuse-only escape
  coverage.
