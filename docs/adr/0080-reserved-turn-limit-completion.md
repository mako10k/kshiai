# ADR-0080: Explicit reserved turn limit completion

- Status: Proposed
- Revision: 1
- Date: 2026-10-12
- Decision owner: Repository owner
- Authority: [canonical decision](0080-reserved-turn-limit-completion.think)
- Related: ADR-0072/0074; docs/reserved-turns-v1.md; docs/unified-consciousness.pert reservedTerminalDecision; docs/evidence/reserved-turns-rc10-turn-limit-2026-10-12.json

## Context

Application v0.25.0-rc.10 Stage38227163875 committed all36 turns using145 physical attempts, all closed, with zero world or memory mismatches. Both actors retained62HP. Four invalid narration responses were recovered without extra calls. The runtime remained active after turn36, so the next advance failed RESERVED_TURN_BOUNDARY_INVALID. The original design says limits stop incomplete without inventing a winner; the Stage acceptance observer requires a finished battle with terminal runtime. A successful normal maximum-duration battle therefore cannot satisfy the existing release gate.

## Decision drivers

- Make the normal turn limit an explicit, understandable endpoint.
- Preserve the final committed turn, memory, narration and exact usage.
- Avoid an additional LLM call or unsupported winner inference.
- Keep transport, budget and timeout failures distinct from normal maximum-turn completion.

## Considered options

1. Explicit draw at maxTurns when both actors remain able to fight: recommended, satisfies finished/terminal and uses existing turn_limit finish reason. Incapacitation on the last turn takes precedence. Draw rating settlement must follow the existing draw contract exactly once.
2. No-winner limit completion: preserve incomplete/no rating semantics, expose an explicit turn-limit reason and allow only this precisely verified endpoint through Stage acceptance. This changes the release completion contract and must never admit other incomplete battles.
3. Additional judgment call or HP-based winner: not proposed because this introduces extra cost or a new victory criterion.

## Decision

The prior option1 recommendation and draw/no-winner owner question are withdrawn. The owner confirms12public turns and asks where existing turn-end victory determination went. Restore that existing contract; do not introduce unconditional draw semantics. See [migration audit](../reserved-turn-migration-adr-audit-2026-10-12.md). The remaining paragraph below describes the superseded proposal for audit history only.

Previously proposed option1: The earlier proposal incorrectly treated an existing rule as an unresolved product choice; neither implementation nor relaxed acceptance is authorized by this Proposed ADR. After acceptance, define a new immutable policy revision for the selected endpoint, preserve older policy semantics, and implement only that option. Keep numeric limits, provider/model routes, prompt v6 and output v3 unchanged unless compatibility requires an explicitly documented binding adjustment. No existing failed battle is resumed, rewritten or retrospectively declared successful.

## Consequences

### Positive

- A full maximum-duration match has a specified endpoint without extra model calls.
- Release acceptance tests the intended finite battle lifecycle.

### Negative and risks

- Draws may remain repetitive; terminal correctness does not prove entertaining combat.
- Option1 introduces draw/rating semantics for new policy bindings; option2 changes accepted Stage endpoints.

## Compatibility and migration

Bind the selected endpoint in a new immutable policy revision; preserve historical policy bindings and paid evidence. No destructive database migration or old battle replay. Production remains application v0.24.0-rc.9. Remaining owner-approved paid capacity is55 physical attempts after cumulative406 of461; it is insufficient for another normal36-turn fixed battle. A new full paid battle needs a concrete separate approval; offline saved-turn validation requires no provider call.

## Verification

Regress turn35 active to turn36 endpoint, last-turn single and mutual incapacitation precedence, final world/memory/narration atomicity, no turn37 dispatch, idempotent terminal advance, exactly-once rating semantics or unchanged no-rating semantics, historical policy continuation and strict rejection of other incomplete/unknown-send cases. Replay retained final-turn inputs offline without provider sends. Review affected authority individually, full tests/typecheck/build/static/ADR checks, exact PR/main CI, annotated tag, successful Stage and exact-artifact Promote/readback.

## Implementation references

- Stage run: https://github.com/mako10k/kshiai/actions/runs/38227163875
- Candidate source: 56ff6d8430efe24eb19e8594418b4e4b8fa00f0b
- Sanitized evidence: docs/evidence/reserved-turns-rc10-turn-limit-2026-10-12.json
