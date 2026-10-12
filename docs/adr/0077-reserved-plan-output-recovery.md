# ADR-0077: Recover received invalid character plans without stopping the battle

- Status: Accepted
- Revision: 1
- Date: 2026-10-12
- Decision owner: Repository owner
- Related: ADR0070/0072/0076 revision1; docs/unified-consciousness.pert
- Authority: [canonical decision](0077-reserved-plan-output-recovery.think)

## Context

Application v0.25.0-rc.7 Stage38202989828 committed five turns with consistent world and ranked memory, then side A omitted required memory at turn6. All23 physical attempts closed; there were no adjudication repairs or world/memory mismatches. The entire battle became incomplete because character validation still lacked the recovery boundary adopted for adjudication. Cumulative attempts are120, leaving141 under the approved261 ceiling. Production remains application v0.24.0-rc.9.

## Decision drivers

Preserve mandatory ranked-memory output and canonical integrity while containing a received model-format error to its planning side. Keep four normal calls, explicit diagnostics, bounded exceptional work and immutable historical bindings. Apply the owner's existing automatic-repair/error-directed-correction direction and explicit repair-retry/deployment authority without requesting the same confirmation again.

## Considered options

1. Prompt clarification alone: useful but cannot guarantee every response.
2. Silently accept missing memory or invent replacement intentions: rejected.
3. Versioned error-directed correction and explicit rejected-plan continuation: selected.

## Decision

New battles bind reserved turn policy v6/prompt v6 with unchanged reserved turn output v3. Policy v6 adds maxCharacterCorrections=1 for each side per turn, retaining the existing single adjudication correction. Four calls remain normal; at most two character corrections and one judge correction are exceptional logical calls, each physically accounted including known429 retries.

A physically received invalid character JSON/plan, unknown target reference or invalid ranked-memory reference is rejected and retained privately. Give the same side one error-directed corrective request on the same frozen context and original role hard deadline. Do not replan the valid counterpart or mutate world/memory before the turn commit. Unknown sends, timeouts, fencing failures and hard budgets are not correction-replayed.

If the received correction is still invalid, reject that side's entire current plan: no accepted action reservations and no invented substitute action. Preserve its last committed memory through server-owned rank references and deliver explicit private PLAN_INVALID feedback to the next character decision. The invalid model response remains a failed receipt; it is never accepted as satisfying the mandatory memory contract. The server failure plan is a separate, explicit failed planning outcome. The counterpart's valid reservations continue normally. The lost planning opportunity is the penalty; there is no flat extra resource penalty. Accepted character outputs still require valid explicit memory, including an explicit empty array when clearing it.

Prompt v6 requests memory first and supplies a complete minimal output plus the correction instruction. Preserve prompt v1-v5 bytes. Persist logicalStartedAt for policy v6 requests so the original role deadline survives replay/restart. Centralize acceptance of physically closed failed invalid receipts: only policy v5/v6 adjudication ADJUDICATION_INVALID, and policy v6 character PLAN_INVALID, with failed status, raw response and no outstanding send. Commit and completion still require four effective prepared outputs and exact physical usage mapping. Narration behavior remains unchanged.

Owner direction: the current instruction requires mechanical repair or explicit-error redo because LLM adjudication is imperfect; earlier explicit repair retries and approval for correction, tests, deployment, staging and switching persist. This applies the same recovery direction to the newly observed character-output defect while preserving required-memory semantics. Paid repair acceptance stays within the approved cumulative261 attempts:120 used,141 remaining, one corrected fixed fixture/max38advances, unpriced. No unchanged-candidate automatic rerun, unknown-send replay or character generation. Successful Stage precedes exact-artifact production promotion.

## Consequences

A received malformed plan no longer automatically terminates the entire battle. A side may lose its complete planning opportunity after two invalid responses; explicit diagnostics distinguish protocol failure from tactical failure. Exceptional correction calls consume the existing physical budget. A valid counterpart can act against a side whose plan was rejected. No claim is made that narration, infrastructure or exhausted hard budgets can always continue.

## Compatibility and migration

No database migration or historical rebinding. Existing policy v5 battles retain strict character validation and their original prompt. Preserve the failed application v0.25.0-rc.7 battle; new application v0.25.0-rc.8 creates policy v6 bindings. Output v3 adjudication semantics and canonical world ownership remain unchanged.

## Verification

Regress actual missing-memory output, error diagnostics and one-sided correction, original deadlines and replay without duplicate sends, invalid rank/reference errors, capped rejected-plan continuation with unchanged memory and no actions, private feedback, valid counterpart progress, raw evidence, strict policy v5 compatibility, receipt-status/role/version guards and atomic commit/completion. Individually review affected authority; run full governed PostgreSQL tests, typecheck/build/static, exact-source CI and the bounded fixed Stage.

## Implementation references

- https://github.com/mako10k/kshiai/actions/runs/38202989828
- docs/evidence/reserved-turns-rc7-failure-2026-10-12.json
