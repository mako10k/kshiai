# Latent output truncation after PostgreSQL repair

## Observations

The [rc7 Stage run37400614046](https://github.com/mako10k/kshiai/actions/runs/37400614046) deployed API revision `kshiai-api-00172-qag` at zero public traffic. Boot, receipt persistence, physical accounting, Cloud Tasks, Worker, auth and SSE checks passed. Creation and the first awareness advance succeeded, confirming the preceding PostgreSQL initialization repair in the actual path. Public promotion was not performed.

Battle `btl_bb7481f135d18c45541a25a3e3d856e7` reached tick1 and became incomplete with `Provider returned invalid JSON`. The matching Luna role log failed after6109ms. The SDK ledger retained a completed physical response with 600 output tokens, finishReason `length`, contentLength1524, elapsed6070ms. Nearby Luna calls ended `stop` with333/382/551 output tokens. Verified-TLS `BEGIN READ ONLY` reads projected only runtime status and usage diagnostics, without exposing prompts or generated content.

The observed producing condition is output generation terminating at the bound token cap followed by JSON syntax failure. The rejected text is intentionally kept only in memory, so the exact malformed boundary and reason for the larger generation remain unknown. Missing whole-output brevity guidance is a plausible contributor, not an independently proven root cause. This is not a timeout: the actual bound normal policy permits60000ms for subconscious calls. The5000ms standard policy is a separate historical/default policy.

## Authorized bounded correction

Accepted ADR0056 permits updating the latest output instructions before normal completion. Preserve the600-token cap, schema, state meaning, perception boundaries, reflection/affective separation, model selection, deadlines, retry policy and failure handling. Add compact-output guidance and a full schema-validated example that retains sensations, emotions, a learned reaction and both desire sources. Instruct compression without discarding necessary meanings or imposing an item-count limit. Examples show shape, not world facts or mandated emotions/actions. Keep user data unchanged.

This changes the prompt identity to `awareness-prompt-v4`; the engine remains `awareness-v5`. Historical prompt identitiesv1/v2/v3 remain readable and execute current instructions. Replace the narration builder's duplicated current-version literal with the shared constant to keep recorded/effective identities aligned.

Raising the output cap requires an upstream policy/economics decision; silent JSON repair, empty-state fallback or an implicit retry would change the accepted failure contract. Those alternatives are not part of this correction.

## Verification and remaining gate

Focused tests verify full-schema examples, current side/tick identity, desire source/lifetime acceptance across successive ticks and latest-instruction execution for historical labels. Existing normal creation/current narration tests are updated to the new explicit prompt identity; old identity parsing remains covered. CLI causal/decision audit: fatal/error/warning zero. Local and exact CI results will be appended after observation. These checks do not prove live outputs always fit600tokens; a new immutable candidate must pass the normal staging battle before public promotion and fresh public completion.

Canonical task `awareness-public-deploy` remains active, and the old cutover trial stays suspended. The previous merged tree matches origin/main; branch preflight records why `codex/awareness-latent-output` isolates this correction while preserving unrelated WIP and PERT actuals.

## Actual SDK usage retained for the failed rc7 observation

| Role | Physical responses | Reported input | Reported output | Reported total |
| --- | ---: | ---: | ---: | ---: |
| creation | 1 | 1467 | 193 | 2791 |
| conscious | 3 | 13256 | 1190 | 16392 |
| subconscious | 4 | 20386 | 1866 | 22252 |
| narration | 1 | 5188 | 377 | 5565 |

All nine recorded HTTP responses settled. Provider-reported total tokens sum to47,000; totals are retained as reported rather than reconstructed from input/output fields. Invalid logical JSON does not undo physical usage. Monetary cost remains unknown without verified prices. These usage records are not successful public completion evidence.

Local validation after correcting the new internal side-type reference and replacing the now-supportedv4 negative fixture with an unsupported label: focused tests11 pass; awareness281 pass, zero failures, two explicitly skipped native-PostgreSQL cases (dedicated service is supplied by CI); sealed normal suites201 pass. Full build, workspace/deployment typecheck and static checks pass. Independent implementation review found no boundary dispute or contract violation. Exact CI and real output adequacy remain pending.
