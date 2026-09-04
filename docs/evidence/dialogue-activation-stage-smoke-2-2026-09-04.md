# Repaired compact-dialogue Stage smoke outcome — 2026-09-04

## Result

`DAF_STAGE_SMOKE_2` completed its one authorized Cloud Run Job execution and
retained a second stopped Stage outcome. Release `v0.22.0-rc.2` deployed the
fixture-readiness repair successfully to a no-traffic Stage revision. The two
retained character fixtures were upgraded to ready V2 generations, so the
observer passed the character visibility boundary that stopped the first
smoke. Battle creation then returned `409 battlefield_upgrade_required`
because the retained battlefield fixture still had only a schema-1 generation
and no compatibility state.

No battle row, battle advance, physical LLM provider attempt, fallback, retry,
token use, cost estimate, dialogue-quality result, or battle-bound compact
activation receipt was produced. The failed execution was not retried and no
replacement battle was started.

This is evidence that the character-specific repair worked and exposed the next
fixture-readiness boundary. It is not evidence about compact dialogue quality
and does not authorize Promote, production traffic, a persisted dialogue
setting, fixture mutation, or another provider-backed observation.

## Immutable Stage target

| Item | Readback |
| --- | --- |
| Release tag | `v0.22.0-rc.2` (annotated, resolves to the release commit below) |
| Release commit | `bdef8d20a16cefee1e615bccca5fcf7deb5f170f` |
| Backend image | `asia-northeast1-docker.pkg.dev/kshiai/kshiai/backend@sha256:c5fab5aa83e820d8d4b76d35a06e8f6490d7322f51f505f7735c704e0778c2b9` |
| Stage workflow | GitHub Actions run `33865761855`, success |
| Workflow interval | `2026-09-04T19:58:48+09:00` through `2026-09-04T20:18:29+09:00` |
| Stage Cloud Run revision | `kshiai-api-00119-tov`, Ready=True |
| Stage backend tag | `release-v0-22-0-rc-2`, 0% traffic |
| Stage Worker version | `dd8d1e3e-020a-4b70-88fe-d7c90ed4cde2` |
| Stage Worker version URL | `https://dd8d1e3e-kshiai-web.mako10k.workers.dev` |
| Dialogue projection | `compact`, source `deployment_override` |
| Override identity | exact release commit and backend image above |
| Causal narration / pacing | `narration_guarded` / `current` |
| Production target after the observation | `kshiai-api-00116-doz`, 100% |

The Stage workflow also passed its migration, LLM-free narration receipt and
provider-accounting checks, staged Cloud Tasks OIDC check, immutable Worker
upload, edge/origin smoke, auth/SSE smoke, and R2 checks. Those checks establish
deployment readiness only; they do not substitute for a provider-backed battle.

## Observation execution

| Item | Readback |
| --- | --- |
| Observer job | `kshiai-persistent-e2e`, generation 29 |
| Observation run ID | `stage-33865761855-1` |
| Job execution | `kshiai-persistent-e2e-x7xbd` |
| Execution start | `2026-09-04T20:21:03.700270+09:00` |
| Execution completion | `2026-09-04T20:21:22.724420+09:00` |
| Execution outcome | failed, task exit code 1, Cloud Run retries 0 |
| Observer command | `sh -lc`, wrapper SHA-256 `3d6314cd960d15c78813b51b5f5ac5e2ed43b70911aadfcf36883d5c7805bf7c` |
| Observer image | exact backend image listed above |
| Observer API target | exact immutable Stage Worker version URL listed above |
| Expected backend revision | `kshiai-api-00119-tov` |
| Maximum advances | 24 |
| Physical provider-attempt ceiling | 169 |

The immutable Stage Worker health response immediately before execution was
`ok=true`, `database=postgres`, and `auth=supabase`, with the configured
`fallback:xai>openai>venice` route. The job configuration readback bound the
run ID, approved run ID, revision, projection mode, activation source, commit,
and image exactly as shown above.

## Authorized limits and measured use

| Measure | Authorized bound | Measured result |
| --- | ---: | ---: |
| Cloud Run executions | 1 | 1 failed execution |
| Battles | 1 | 0 persisted battles |
| Advances | 24 | 0 |
| Physical provider attempts | 169 | 0 |
| Same-provider retries | existing adapter policy | not reached |
| Provider fallback | existing route | not reached |
| Reported tokens | observation only | 0 recorded |
| Estimated cost | observation only | USD 0 recorded |
| Dialogue loop outcome | stop on recurrence | not evaluated; battle loop not entered |

The exact run ledger was created with a projected ceiling of 169 and then
finalized as `failed`. It reserved zero attempts and contains zero physical
attempt rows. Its generated battle ID is not present in `battles`. Read-only
PostgreSQL reconciliation also found zero battles with the observation run ID
and zero `persistent_e2e_observation` events. Thus the 169 figure is an unused
upper bound, not measured provider use.

## Failure evidence and fixture state

Cloud Logging retained the observer error:

```text
API POST /api/battles failed: 409: {"error":"battlefield_upgrade_required","message":"BATTLEFIELD_UPGRADE_REQUIRED"}
```

The read-only database reconciliation for the fixed fixtures found:

| Fixture | Current state after this execution |
| --- | --- |
| `chr_e2e_dialogue_nagi` | ready, schema 2, generation 3 |
| `chr_e2e_dialogue_gaku` | ready, schema 2, generation 3 |
| `bfp_e2e_dialogue_rainy_alley` | no compatibility-state row; current schema 1, generation 1 |

Both character generation-3 rows were created at
`2026-09-04T20:21:18.929+09:00`, confirming that the deployed repair upgraded
the retained characters before battle creation. The battlefield row and its
schema-1 generation both date from `2026-08-09T17:02:53.710+09:00` and were
unchanged by this execution.

## Causal classification

- **Root cause:** `ensureBattlefield` treats any existing, correctly owned,
  non-system battlefield row as reusable without verifying that its immutable
  current generation satisfies the active V2 battlefield readiness contract.
  The retained fixture therefore remained on schema 1, while battle creation
  correctly accepts only a ready V2 preset.
- **Contributing cause:** the shared Stage database retains synthetic fixtures
  created under older asset contracts. Existence of their legacy rows does not
  imply current immutable-generation readiness.
- **Escape cause:** the prior repair and regression coverage were bounded to
  the character failure observed first. The structurally similar battlefield
  reuse branch was not included, so the next fail-closed asset boundary became
  visible only after the character repair passed.
- **Corrective direction:** make synthetic battlefield provisioning
  readiness-aware and, for an existing owned fixture lacking a ready V2
  generation, append and activate a deterministic LLM-free imported V2
  generation while preserving its operational state.
- **Recurrence-prevention direction:** cover retained stale fixtures for every
  fixed observer asset family, and assert all four fixture dispositions and
  selector/readiness contracts before allowing the provider-run ledger or
  battle creation boundary.

The current task records this stopped outcome only. It does not implement that
next repair or authorize a third observation execution.

## Evidence sources

- GitHub Actions Stage run `33865761855` and its immutable release readbacks.
- Read-only Cloud Run service, revision, job, and execution descriptions on
  2026-09-04.
- Cloud Logging entries for execution `kshiai-persistent-e2e-x7xbd`.
- Read-only PostgreSQL queries for exact run ID, provider attempts, battles,
  observation events, and fixture generation state.
- `backend/src/scripts/persistent-battle-e2e.ts` for the fixture, ledger,
  battle-create, and failure-finalization order.
- `backend/src/e2e-observer.ts` for the battlefield row-only reuse gate.
- `backend/src/repositories/battlefields.ts` and
  `backend/src/repositories/battlefield-assets-v2.ts` for fail-closed V2
  battlefield readiness.
