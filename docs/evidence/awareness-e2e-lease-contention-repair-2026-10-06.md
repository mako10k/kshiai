# rc.8 E2E lease-contention observation and repair

Date: 2026-10-06. Governing behavior: Accepted ADR0051/0054/0056/0057; owner-authorized official Stage → Promote → Observe and normal public completion.

## Observed release state

- Commit `779efe4400e69ecd678f842ace21f3be989e9906`, annotated tag `v0.23.0-rc.8` object `71e4177cb909d95c8029d6fea09d2a84afcb0753` independently read back.
- [Stage37402978782](https://github.com/mako10k/kshiai/actions/runs/37402978782) failed in its actual battle observation. All preceding build, migration, boot, accounting, task delivery, edge, auth and SSE checks passed.
- Staged API `kshiai-api-00173-vuk` Ready; digest `sha256:17db55ecee7797b8b81772258950645ae85862f50aac8a408b1a557c112f8ae2`. Public API retained100% `kshiai-api-speech-9ce565d`; no promotion.
- Battle `btl_acdb6ce74b33e047164811322847d3f2`: runtime tick7, active, incompleteReason null after observer exit. This is not normal completion evidence.
- Cloud Run observer execution `kshiai-persistent-e2e-2sg2q` exited1; error `Battle advance stream error: BATTLE_BUSY` at02:20:22.594628Z.
- Prior advance succeeded at02:20:22.281370Z. Next advance started02:20:22.503788Z and returned BATTLE_BUSY at02:20:22.531013Z. Narration subsequently reported PROVIDER_OPERATION_RUN_INACTIVE at02:20:22.610968Z.

## Actual SDK usage after late responses settled

Verified-CA PostgreSQL diagnostic used BEGIN READ ONLY and verified transaction_read_only=on; scope exact battle only. All33 physical usage rows completed. All16 subconscious calls finishReason=stop. No length truncation was observed in this sample. SDK-reported totals remain authoritative and may include provider-specific token categories; do not reconstruct them from input+output. Monetary cost remains unknown without verified pricing.

| Role | Calls | Input tokens | Output tokens | Reported total tokens |
|---|---:|---:|---:|---:|
| creation | 1 | 1467 | 189 | 2490 |
| conscious | 7 | 31889 | 2442 | 43124 |
| subconscious | 16 | 92632 | 4144 | 96776 |
| narration | 7 | 54799 | 2270 | 57069 |
| adjudication | 2 | 16305 | 48 | 17521 |

Total reported tokens: 216980. This failed observation contributes measurement and defect evidence, not public acceptance.

## Producing condition, alternatives and boundary

The observation driver treats every SSE error as fatal, including explicit pre-execution lease contention. withBattleLease rejects BATTLE_BUSY before executing the advance callback. The route abandons the rejected idempotency admission before sending the error. Narration reservation shares the battle lease briefly and can contend. The exact historical lease owner at02:20:22 is not retained; do not claim narration ownership is independently proven.

Failure of the driver ends the observation provider run while async work may still be settling. The subsequent RUN_INACTIVE is a downstream failure after observer exit, not evidence of a provider retry or output JSON problem.

Repair scope: observation-only bounded same-idempotency-key retry for an unambiguous SSE BATTLE_BUSY before advance execution. Retain sequence and one absolute600second request deadline across waits and requests. No retry for provider/network/timeout/other SSE failures, malformed bodies or ambiguous done+error. No server lease, model, policy, physical ceiling, schema, old trial or completion threshold change.

Current review phase is implementation conformance to existing lease/idempotency and normal observation contracts. Real Stage/public normal completion is the successor evidence gate and cannot be claimed from deterministic tests. Raising policy caps, changing lease semantics or weakening acceptance lies outside this repair.

[CLI-audited reasoning](awareness-e2e-lease-contention-repair-2026-10-06.think): fatal0, error0, warning0. Independent discovery agrees on pre-execution contention handling; its mistaken SSE409 wording was corrected against routes.ts, where SSE is HTTP200 and the explicit error is inside the stream.

## Verification checkpoint

Focused tests must cover samekey busy→done, other errors, ambiguous/malformed response and deadline exhaustion. Workspace checks and independent implementation review precede a new immutable Stage candidate. No rc8 promotion or unchanged-input rerun. Public normal completion remains outstanding. PERT awareness-public-deploy resumed for this scoped repair; old awareness-verify remains held.

Implementation review: initial finding rejected progress-event+busy as unproven pre-execution; fixed by requiring the busy error to be the only data event. Final independent review reports no residual INSIDE findings. The observation wait uses at most8 retries,250/500/1000ms then2000ms backoff, with maximum9same-key requests and one600second deadline including body read. Regression coverage includes this distinction, mixed/doubled terminal events, malformed responses and persistent contention limit.

Local verification: full sealed suite201 passed; awareness suite288 tests,286passed,2explicit local PostgreSQL skips,0failed; full build passed. Final decoder-only change uses a local Zod discriminated union and existing schemas, with7focused SSE/busy regressions passed and independent readback no findings. Earlier agent Node25 invocation caused a local native SQLite ABI mismatch; authorized Node22 run passed, so this is not recorded as a product defect. Static hand-validator complexity regression was corrected by declarative schema validation; baseline unchanged. Final workspace/deployment typecheck, static duplication/complexity checks and backend build passed; static baselines unchanged.
