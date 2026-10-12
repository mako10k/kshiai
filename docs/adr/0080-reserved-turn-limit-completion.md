# ADR-0080: Restore reserved turn lifecycle and ordered independent narration

- Status: Accepted
- Revision: 2
- Date: 2026-10-12
- Decision owner: Repository owner
- Authority: [canonical decision](0080-reserved-turn-limit-completion.think)
- Related: ADR-0006/0009/0017/0062/0072; [migration audit](../reserved-turn-migration-adr-audit-2026-10-12.md); docs/unified-consciousness.pert

## Context

Application v0.25.0-rc.10 incorrectly copied36ticks into public maxTurns and omitted the existing turn-limit winner. Stage38227163875 committed36consistent turns/145closed attempts but could not finish. The subsequent audit found narration blocking canonical commit and effort integration gaps. The initial Proposed revision1 draw/no-winner choice was withdrawn. Owner confirms12turns and existing turn-end victory, then explicitly directs canonical state not to wait for narration, while result display and next narration wait; correct the other migration defects.

## Decision drivers

- Preserve owner-approved12turns and established victory mechanics.
- Make narration latency/failure independent of canonical gameplay.
- Preserve ordered public storytelling and delay result disclosure until narration completes.
- Carry existing effort and perception requirements across the engine migration.
- Preserve frozen historical bindings, paid evidence and unknown-send safety.

## Considered options

1. Unconditional draw/incomplete on maxTurns: withdrawn; contradicts existing victory contract.
2. Wait for narration before state commit: conflicts with owner clarification.
3. Canonical-first commit with existing durable ordered narration worker: selected.

## Decision

Accept revision2 under the owner's explicit direction. New reserved turn policy v8 binds12public turns. After each turn apply deterministic incapacitation; at turn12 use existing combatScore winner/tie rule, with incapacitation precedence. Set canonical winner/finish reason and settle rating once in the fenced world/memory transaction. Narration/referee prose never determines victory.

Commit canonical world, memories, plans, effective trace and receipt together with immutable narration input and durable outbox before provider narration dispatch. Reuse battle-local ordered narration leases, durable queue wake-up and terminal snapshots. Later canonical turns can commit while earlier narration is pending. Next narration generation waits for its predecessor terminal snapshot; public result display waits for the required narration endpoint. Terminal failure/fallback counts as a terminal snapshot; do not wait forever on transport failure. Preserve unknown-send receipts and never retry them automatically.

Restore ADR0062 effort mechanics using typed action/skill identity and bounded penalty proposals rather than parsing natural-language intent. Apply normal costs/floors, repeated-action2/4STA, bounded free-action penalty and one-incoming-attack defense expiry through server validation; do not impose a blanket cost on failed reservations or ordinary thought/speech. Retain current effort sensation and private feedback, complete immutable personality guidance and actual received speech in next inputs. Keep repeated valid speech permitted. Publish safe canonical verdict without raw internal rationale.

This partially supersedes ADR0072 only for its narration-before-canonical-commit boundary. It restores ADR0017/0006/0009/0062 requirements and retains intentional A/B parallel scheduling, ordered whole-turn adjudication and ranked memory. Later recovery ADR0076/0077/0078 remains for appropriate new receipt roles. No extra character/judge calls per normal turn.

## Consequences

### Positive

- Maximum-duration matches terminate under established victory mechanics.
- Narration latency cannot discard adjudicated gameplay.
- Result disclosure and narration order remain consistent.

### Negative and risks

- Narration may lag canonical gameplay; public projections must enforce disclosure boundaries.
- Worker takeover and physical accounting require cross-boundary regression tests.
- Typed effort metadata increases contract surface but avoids prose classification.

## Compatibility and migration

Only new immutable policy/prompt/output bindings adopt the repairs. Preserve historical v1–v7 policies and frozen prompts, failed battles and physical evidence. No old battle resume/rewrite or destructive migration. Existing queue tables are reused where sufficient. Production remains application v0.24.0-rc.9 until exact-source checks, successful Stage and Promote/readback. Cumulative406of461paid attempts; this record grants no new paid battle.

## Verification

Test12turn endpoint and old36policy continuity; per-turn incapacity/last-turn precedence/tie and once-only rating; commit while narration blocked/failed; frozen outbox and ordered worker replay/unknown-send handling; public result suppression until terminal narration; exact speech/personality/effort next-input propagation; deterministic costs/repetition/penalties and defense expiry. Preserve original cases and individually reseal affected authority; governed tests/typecheck/build/static/ADR/fsck and exact CI/tag before release.

## Implementation references

- Stage: https://github.com/mako10k/kshiai/actions/runs/38227163875
- Prior candidate: 56ff6d8430efe24eb19e8594418b4e4b8fa00f0b
- docs/evidence/reserved-turns-rc10-turn-limit-2026-10-12.json
