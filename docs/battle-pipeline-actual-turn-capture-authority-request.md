# Actual-Turn Capture Authority Decision Request

Status: awaiting explicit user decision

Candidate ID: `actual-turn-capture-authority-v1`

Recommended decision: `defer`

Plan task: `T_CAPTURE_AUTHORITY_DECISION`

This document freezes the decision input. Committing it does not authorize a
runtime hook, capture activation, DB or network access, user-data collection,
release, or deployment.

## 1. Confirmed source evidence

| Artifact | SHA-256 |
|---|---|
| `docs/battle-pipeline-actual-turn-shadow-observation-protocol.md` | `0fb763c3e2b1706b86c10f797a7ff5c242b63baa2fe6f8240b7c8b863c0d6d56` |
| `docs/battle-pipeline-actual-turn-shadow-observer.md` | `210b9c0c57d2506169b62bca4ac2cfe88681951312dfaee8270a451bc86dce71` |
| `docs/battle-pipeline-actual-turn-shadow-observation.pert` | `7dc8536ea63eea56a995dda8ed4bbbbca1afa50d0860f69e42e0c9b0cad555d3` |
| `packages/shared/src/battle-actual-turn-shadow-observation.ts` | `859e419e7a2fbb0b52488b6fcf49743a9d5af1b4c409459b06ac3e6e91c767a6` |
| `packages/shared/src/battle-conflict-handling-applicability.ts` | `f8561c8cda612d75ee5d6af592a1547d7cfbf5ad8d565c72baab75cd729b7905` |
| `packages/shared/src/battle.ts` | `2bc0bbb4372168d1a12abd9332c8e00f0e86f42c143eaf0800e7e40b59d3e494` |
| `backend/src/services/battle-service.ts` | `65604abce2bdb4ae828a321611be41337451a7259c8cfa27aac21152678d0a10` |
| `backend/src/repositories/battles.ts` | `2bd12b2d08f84fb583a7866ce39c978b68a5ec162043ba6a03462976379da344` |
| `backend/src/scripts/observe-battle-actual-turn-shadow.ts` | `440b60542fd7cef405143d7c441fdde09fa79a825011e64013fd59ad78aeeaad` |

Reviewed repository commit:
`03c299e7a00543f7beddc83689840aeacd4c6f48`

## 2. Exact runtime findings

The ordinary combat-turn path is
`advanceTurnWithLease` in `backend/src/services/battle-service.ts`.

1. `resolveTurn` produces deterministic engine results at lines 2510–2519.
2. Free actions are committed to the resolved result at lines 2520–2532.
3. Semantic reconciliation and observer evidence are produced at lines
   2573–2591.
4. Character-agent and perception updates finish at lines 2597–2608.
5. Narration begins after line 2613.
6. The KO-pending branch saves at lines 2911–2915.
7. The ordinary/final branch saves at lines 3034–3038.

A future extraction candidate can therefore be built in memory immediately
after `next = agentTurn.state` and before narration, then flushed only after the
corresponding existing `saveBattle` succeeds. Prologue and aftermath paths are
not eligible.

However, the current runtime does not produce a complete
`ConflictHandlingApplicabilityInput`:

| Required field | Current authoritative runtime source |
|---|---|
| `allowedFallbacks` | absent |
| `proposals` | only later resolved actions exist; coarse proposal identity and exact action-kind contract are absent |
| `adaptive` | adaptive execution receipt and contested-claim refs absent |
| `reads` | purpose-scoped consistency read results absent |
| `issues` | consistency issue lifecycle refs absent |

`resolved.actions`, turn records, events, cognition, or narration cannot be
used to infer these missing fields under the fixed protocol. The existing
offline observer correctly classifies persisted records as
`insufficient_source` for all five areas.

## 3. Recommendation

Defer runtime capture. Activating a hook now would have one of two outcomes:

- emit only `insufficient_source`, repeating a fact already established by the
  source audit; or
- invent or retrofit missing adaptive/canonical/read semantics, which would no
  longer be a passive capture and would violate the fixed observation
  protocol.

This is an effectiveness decision, not a safety incident and not a claim that
the classifier is incorrect. The observation method is not currently
derivable from the adopted runtime pipeline.

If the `defer` recommendation is accepted, record
`T_CAPTURE_AUTHORITY_DECISION` as a changed outcome so downstream sample
capture is assurance-withheld. Replan a separate input-derivability PoC before
returning to actual sampling.

## 4. Frozen future capture candidate

The following is retained as the maximum permissible candidate after the
source gap has conformant evidence. It is not currently authorized.

### Environment identity

- local development host only
- `HOST=127.0.0.1`
- `NODE_ENV` must not equal `production`
- `DATABASE_URL` must be unset and `databaseKind()` must equal `sqlite`
- `DATABASE_PATH=data/actual-turn-shadow-poc.db`
- `LLM_PROVIDER=mock`
- `AUTH_PROVIDER=legacy`
- `MEDIA_STORAGE=local`
- production, staging, Cloud Run, Supabase, R2, and external providers excluded

### Activation and hook

- exact flag: `ACTUAL_TURN_SHADOW_CAPTURE=local-poc-v1`
- default and every other value: disabled
- build an immutable candidate immediately after
  `next = agentTurn.state` in the ordinary combat-turn path
- retain the candidate in memory through narration
- enqueue it only after the existing branch-specific `saveBattle` succeeds
- do not hook prologue, aftermath, battle start, retry, replay, or repository
  read paths

### Read allow-list

- `next.turn`
- `next.id` only as HMAC input; never emit it
- `resolved.actions[].id`
- `resolved.actions[].actorSide`
- `resolved.actions[].kind`
- `resolved.actions[].executed`
- `resolved.actions[].skippedReason`
- `resolved.actions[].resolution.outcome`
- `resolved.actions[].resolution.reason`
- a future authoritative, preconstructed
  `ConflictHandlingApplicabilityInput` containing exactly
  `allowedFallbacks`, `proposals`, `adaptive`, `reads`, and `issues`
- normalized before/after and authoritative-outcome digests only

No character/user IDs, names, parameters, sheets, scene text, events,
cognition, speech, narration, prompts, provider payloads, media URLs, or raw
`BattleState` may enter the capture artifact.

### Pseudonymization and destination

- HMAC-SHA-256 with one capture-local random 256-bit salt
- observation-local typed refs required by the versioned envelope schema
- ignored raw destination:
  `data/actual-turn-shadow-observation-v1.ndjson`
- ignored salt destination:
  `data/actual-turn-shadow-observation-v1.salt`
- both files mode `0600`
- exact `.gitignore` entries added before activation
- no raw envelope, salt, source path, or direct identity committed

### Limits and failure behavior

- maximum 500 eligible envelopes
- maximum 14 elapsed days from an activation timestamp frozen in the local
  capture manifest
- require at least 50 turns, 10 battles, and 2 capture dates for evaluation
- request-path extraction budget: 10 ms; over-budget candidate discarded
- bounded writer queue: 16 candidates
- one append attempt per candidate; no blind retry
- append timeout: 50 ms; on ambiguity disable further capture and retain the
  local file for readback
- every capture error, full queue, invalid envelope, or missing field is
  fail-open for the battle result and counted without private payloads

Maximum capture-local writes are one salt-file creation plus 500 envelope
append attempts. The capture adds zero DB, canonical, network, provider, LLM,
or XAI calls and zero battle-persistence writes.

### Disable and rollback

1. Unset `ACTUAL_TURN_SHADOW_CAPTURE` and restart the local backend.
2. Verify no new envelope line appears after one ordinary turn.
3. Preserve the ignored files for digest/readback; deletion or transfer needs
   a separate explicit decision.
4. Revert the capture-only implementation commit if code rollback is needed.

No environment promotion, traffic change, DB migration, backfill, release, or
deployment is included.

## 5. Decision requested

The requested decision is whether to accept `defer` for candidate
`actual-turn-capture-authority-v1`. Acceptance authorizes only recording the
changed PERT outcome and replanning input derivability. It does not authorize
the future capture candidate described above.
