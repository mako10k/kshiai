# ADR-0053: Explicit action output guidance and physical response evidence

- Status: Superseded
- Superseded by: [ADR0056](0056-latest-prompt-contract-until-completion.md)（旧版実行と固定開始条件を変更。その他の決定は後継へ継承）
- Date: 2026-10-05
- Decision owner: Repository owner
- Related: [ADR0051](0051-observed-llm-usage-accounting.md), [repair design](../battle-awareness-response-repair-2026-10-05.md), PERT response-completion-repair

## Context

The owner authorized the proposed response-format and waiting-reservation correction with 「では、それをお願いします」. The isolated long-timeout trial recorded all five SDK attempts completed, but postresponse output-schema failures left four runtime physical slots outstanding. Existing body-action prompt guidance conflates offered action options with strict action intents.

## Decision drivers

- Preserve strict authoritative output and canonical failure semantics.
- Separate observed physical completion, logical acceptance, and unknown monetary cost.
- Preserve immutable old prompt bindings and natural-language input.

## Considered options

1. Close all rejected calls: would mistake timeout or network uncertainty for remote completion.
2. Accept action strings or copy option objects: would weaken the accepted action contract.
3. Carry narrowly observed response-completion evidence and clarify the existing output contract: selected.

## Decision

Implement the existing output and accounting obligations as specified in the linked repair design. New battles bind prompt revision awareness-prompt-v2 with compact prose instructions and schema-validated examples for body-action intent; old awareness-prompt-v1 bindings retain their original rendering. Output revision awareness-output-v1 is unchanged. Propagate the same prompt revision through rendering, admission proof and model execution.

Observe physical response completion independently of JSON parsing and domain validation. An invocation-local typed completion error may release the corresponding runtime physical slot when every started attempt received a complete SDK response. Logical failure still ends/discards the relevant result; monetary cost stays unknown without a price table. Unconfirmed timeout or transport failure keeps the physical slot outstanding. Late or cancelled jobs are accounted without applying results to terminal canonical state.

## Consequences

### Positive

- Invalid completed results do not occupy unknown physical slots indefinitely.
- Models receive the actual strict action shape rather than ambiguous option-copy guidance.

### Negative and risks

- Clearer instructions cannot guarantee a real model obeys the schema.
- Invocation-local evidence does not reconstruct pre-repair historical outstanding reservations after restart; no retrospective migration is authorized.

## Compatibility and migration

No output-schema, policy, model, retry/fallback, public API or canonical battle-rule change. Existing battle prompt revisions remain pinned. No paid trial or deployment is included. Past isolated trial DBs and owner-held cutover contracts remain unchanged.

## Verification

Offline SDK/usage/provider/execution readbacks for complete invalid JSON, invalid action shape, cancellation and late completion; unknown timeout slot retention; concurrent observation isolation; new and old prompt routing and exact dispatch digest; strict types and existing regressions.

## Implementation references

- [long-timeout evidence](../evidence/awareness-long-timeout-measurement-2026-10-05.json)
- [repair lifecycle and causal limits](../battle-awareness-response-repair-2026-10-05.md)
