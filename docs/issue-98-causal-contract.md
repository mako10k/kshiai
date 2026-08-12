# Issue #98 causal turn contract — Phase 0 draft

Date: 2026-08-12 (JST)

Plan task: `T_DRAFT_CAUSAL_CONTRACT` (3p)

Status: draft. `T_ACCEPT_CAUSAL_CONTRACT` must accept these choices before the
bucket-engine refactor begins.

## Baseline and Phase-1 scope

The current active-turn path consumes both `plannedActionA/B` in one
`resolveTurn` call, reconciles the completed turn, then advances both character
agents in parallel. Agent output becomes the following turn's reservation. No
durable boundary therefore exists between a first-bucket commit and a
later-bucket decision.

The proposed initial scope is exactly two combatants. Historical records retain
`initiative-window-v1`; new ordinary turns follow ADR-0001 and always use
sequential action buckets. Equal initiative reuses the prior resolved order, or
performs one persisted weighted draw when no prior order exists; absent weights,
the draw is exactly 50/50. Both normal-turn decisions move in-turn, so action
source and pre-action expression are unambiguous. Legacy battles continue
through their existing path. Random initiative beyond ADR-0001's persisted tie
draw, new tactical `wait`, delayed effects, and new participants are excluded.

## Durable state machine

| State | Durable data | Next operation |
| --- | --- | --- |
| `ready` | current completed state | create execution with turn, ruleset, snapshot digest, and bucket plan |
| `awaiting_first_decision` | execution and first bucket | call only first-bucket actor(s) |
| `first_bucket_committed` | accepted action, engine receipt, observer snapshots | apply selected semantic/world observation boundary once |
| `awaiting_later_decision` | first receipt and later observer projection | call only later actor |
| `later_bucket_committed` | both receipts and committed consequences | post-action expression, narration, terminal handling |
| `finalizing` | complete causal receipt and public input | save final turn and response receipt |
| `finished` | immutable execution/idempotency receipt | return receipt without rerunning work |

Same-bucket turns call both actors from the same snapshot, commit one atomic
bucket, and omit `awaiting_later_decision`. Each transition carries execution,
battle, turn, expected state revision, ruleset, and immutable receipt IDs. A
stale lease or version reads the durable state; it never invokes an LLM.

## Receipt, projection, and authority

Each bounded phase receipt has `executionId`, `turn`, `bucketIndex`, actor
sides, `decision | pre_action_expression | action_commit |
observable_consequence | post_action_expression`, `committed | skipped |
failed`, reason, source receipt IDs, and one provenance tag:

- `action(actionId)`
- `scheduled_effect(effectId)`
- `system_rules(turn_start | terminal)`
- `environment_world(transitionId)`

This allows normal system-origin restoration and terminal events without
fabricating an action source. Failed/skipped receipts create no invented action,
speech, or effect. Legacy records are not rewritten and honestly lack the new
detail.

`CausalDecisionProjection` for the later actor contains only committed,
observer-visible action/result, semantic/world facts, and permitted utterances.
It excludes raw patches, IDs that disclose private data, private cognition,
uncommitted proposals, narrator output, and provider traces.

| Producer | Existing edge | Phase-1 rule |
| --- | --- | --- |
| engine | combat state, temporal result, mechanical evidence | canonical owner remains unchanged |
| semantic/world reconciler | validated state and observer facts | server-validated; first-bucket timing is explicit |
| character agent | private state, speech, action proposal | server validates proposal before action receipt |
| narrator | public text and recognition continuity | presentation continuity only; never later-decision/mechanics input |
| terminal referee | turn-limit winner edge | retained exceptional edge, outside Phase 1 |

## Recovery and streaming

The checkpoint and public response receipt must commit transactionally with the
battle state or be connected through a recoverable outbox. A successful
`saveBattle` followed by failed `completeIdempotentRequest` cannot be the only
durability record.

One frontend advance attempt retains one idempotency key across reconnects. The
server binds it to user, battle, expected turn/state revision, and execution.
Duplicates return the receipt and never rerun a bucket, effect, or LLM call.

| Event class | Public SSE | Replay | Timing |
| --- | --- | --- | --- |
| durable public causal receipt | yes | yes | only after checkpoint commit |
| ephemeral progress | phase name only | no | no content or intent |
| private diagnostic trace | no | no | administrator-only storage |
| uncommitted proposal/LLM stream | no | no | never emitted |

Current streamed narrator text is neither causal evidence nor later-decision
input. Its pre-save streaming behavior remains a separately tracked legacy
case.

## Required fixtures

1. Faster A and faster B: the later action changes only with its permitted
   first-bucket projection; private intent does not cross.
2. Same bucket: both decisions read the same snapshot, and A/B swap preserves
   mechanics.
3. First-bucket incapacity, invalid later proposal, and later LLM timeout:
   durable skipped/failed receipt, no invented output, deterministic resume.
4. Save-success/response-failure, reconnect, and stale concurrent advance:
   durable receipt readback and no duplicate execution.
5. DTO, SSE history, records, traces, and later LLM payloads contain no private
   first-actor proposal/psyche or uncommitted fact.
6. Legacy battles retain old behavior and lack causal receipts rather than
   receiving guessed history.

## Required owner decision

The recommended decision is to migrate both normal-turn decisions in-turn;
admit accepted first-bucket semantic/world observer facts before the later
decision; retain narrator continuity and terminal referee as explicit
exceptions; defer `OBS-20260807-09` remediation; and exclude random initiative
beyond ADR-0001's persisted equal-initiative tie draw, new tactical `wait`, and
participant join. Acceptance authorizes no release,
deployment, production observation, or Issue mutation.
