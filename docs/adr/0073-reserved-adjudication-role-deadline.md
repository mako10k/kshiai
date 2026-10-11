# ADR-0073: Separate reserved-turn adjudication deadline

- Status: Superseded
- Revision: 1
- Superseded by: [ADR-0074 revision1](0074-reserved-soft-limits-and-compact-input.md) for new-creation timing and prompt selection; historical policy v2 remains valid.
- Date: 2026-10-11
- Decision owner: Repository owner
- Authority: [canonical decision](0073-reserved-adjudication-role-deadline.think)
- Related: Accepted ADR0072 revision1; docs/reserved-turns-v1.md; docs/unified-consciousness.pert; Stage38140597482

## Context

Application v0.25.0-rc.2 sends correct explicit pre-action revisions using adjudication prompt v2. Its Stage battle btl_9729dab655e215993fcd20013bfa4df8 nevertheless stopped before its first commit: grok-4.5 received approximately34306input characters and three reservations, then the SDK timed out after59933ms without a received response. Both character calls succeeded in approximately3-4seconds. The failed adjudication remains physically unresolved with unknown usage; do not resend it or infer zero cost. The battle stayed turn0 with bothHP90, no committed memory or narration. Across rc.1/rc.2,8physical attempts were used and neither candidate was promoted.

The initial reserved-turn policy v1 gives every role60seconds. Previous historical awareness operating policy already allows longer adjudication, but changing new-battle immutable policy and its request deadline must remain explicit. This is an owner choice about maximum waiting time, not evidence that180seconds will guarantee completion.

## Decision drivers

- Preserve four logical calls per turn and the selected adjudication model.
- Allow a larger whole-turn adjudication request to finish without lengthening character or narration deadlines.
- Preserve exact historical bindings, unknown-send evidence and finite battle/attempt limits.

## Considered options

1. Keep60seconds and switch to a lighter model or reduce the judgment contract: may reduce latency but changes quality/model behavior; not selected without separate measurement.
2. Increase every role deadline: needlessly lengthens the planner/narrator bound; rejected.
3. Introduce reserved-turn policy v2 with adjudication-only180seconds: proposed, preserving all other limits and strict result validation.

## Decision

Owner accepted revision1 on2026-10-11: 「裁定180秒への変更と追加1対戦・200試行を承認」. Accept: new battles bind reserved-turn policy v2 with adjudicationDeadlineMs180000; character/narration deadlineMs60000, max36turns, battle duration600000ms, max200physical attempts and four normal logical calls remain unchanged. Compute each request deadline as min(role deadline,battle deadline). Keep models and prompt v2 unchanged. No timeout retry, schema repair, fallback model or replay of unknown sends. A known physical response received late may close accounting but cannot prepare or commit a turn.

Authorize one additional corrected fixed Stage battle only, max38advances/200physical attempts, no character generation or unchanged automatic rerun. Prior8plus proposed200means cumulative208maximum; money remains unpriced. Exact-artifact production promotion remains conditional on successful functional acceptance. This exact owner acceptance authorizes implementation and the bounded additional fixture.

## Consequences

### Positive

- Character/narration keep short bounds; adjudication has a larger explicit completion window.
- Preserve the one-trace architecture and immutable source/model binding.

### Negative and risks

- One turn can wait materially longer; total10minute battle cap may still stop long battles.
- No guarantee the provider will respond or produce a valid trace. Unknown usage is not a monetary cap.

## Compatibility and migration

Add a policy v2 schema and per-role selection while preserving policy v1's exact60second behavior. New creation selects v2 under this acceptance. No database migration or historical conversion. Saved rc.1/rc.2 battles and failed attempts remain unchanged; do not repair their runtime outstanding state without a physical receipt.

## Verification

Test v1 compatibility, v2 role-specific timeout dispatch, global deadline clipping, unchanged planner/narrator bounds, unknown sends and late accounting with zero world/memory commit. Individually review/reseal affected authority, build shared before official tests, run all required CI and stage a new immutable candidate. Inspect actual elapsed time, trace application, memory carry-forward, public narration and usage ledger before promotion.

## Implementation references

- Implementation authorized by exact owner acceptance above.
- Prior repair: PR187, commit310faa1c8b244cbeccc38d06133bed41df271949, exact-main CI38139960971 passed.
- Failed Stage: https://github.com/mako10k/kshiai/actions/runs/38140597482 .
