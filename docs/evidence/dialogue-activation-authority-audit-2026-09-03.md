# Dialogue activation authority audit — 2026-09-03

Status: `DAF_AUDIT` complete. This is a sanitized read-only evidence record. It
does not accept an ADR, change an administrator setting, call an LLM provider,
deploy, promote, or alter a running battle.

## Audit basis and limitations

- Repository current-main basis: `4d446e4e4459114dab9ac87ba2589040814224b4`.
  The GitHub API independently returned that revision as `main`, and release
  `v0.21.7` binds the same commit.
- The audit was performed from branch
  `work/sda-character-norm-receipts-20260814` at
  `a9ea6acebc9382b0b00c92e769e826461bb3d002`. That branch is 13 commits ahead
  and 16 commits behind current `main`, so code conclusions below use the
  verified current-main revision rather than the branch working copy.
- Direct Cloud Run service description was unavailable because the existing
  local `gcloud` session required interactive reauthentication. No login,
  account switch, or credential mutation was attempted. The exact live service
  revision and live `CHARACTER_FOCUS_SHADOW_MODE` therefore remain unknown.
- The public health endpoint returned `ok: true` and identified the Cloudflare
  Worker runtime, but it does not expose dialogue or focus activation state.
- The production database was queried in one read-only transaction through the
  repository secret-injection route. Only the enums, revisions, artifact IDs,
  digests, and trace-presence metadata below were retained; no secret, user
  identity, prompt, or private battle content was printed or recorded.

## Exact dialogue-mode precedence

| Situation | Effective precedence, highest first | Frozen or live | Evidence |
| --- | --- | --- | --- |
| New battle with a valid revision-local override | `DIALOGUE_CONTEXT_PROJECTION_OVERRIDE` (`legacy` or `compact`) → persisted global setting → runtime default `legacy` | The resolved value is frozen when the battle is created | `backend/src/services/battle-service.ts@4d446e4:587-592,712-717`; `backend/src/config.ts@4d446e4:44-50,292-295` |
| New battle without the override | persisted global setting → runtime default `legacy` when the singleton row is absent | The resolved value is frozen when the battle is created | `backend/src/repositories/dialogue-pipeline-settings.ts@4d446e4:36-51`; `packages/shared/src/dialogue-pipeline.ts@4d446e4:75-87` |
| Existing battle with a dialogue snapshot | battle-owned `dialoguePipelineSnapshot` | Immutable for the battle; later settings or deployment changes do not apply | `packages/shared/src/dialogue-pipeline.ts@4d446e4:45-72`; `backend/src/services/battle-service.ts@4d446e4:4356-4362,4819-4832` |
| Legacy existing battle without a dialogue snapshot | current persisted global setting → runtime default `legacy` | Compatibility-only live fallback; the deployment override is not reapplied | `backend/src/services/battle-service.ts@4d446e4:4356-4362`; `backend/src/repositories/dialogue-pipeline-settings.ts@4d446e4:47-51` |

For a new battle, the server writes a `dialogue-pipeline` asset generation and
binds its generation ID, content digest, and effective snapshot into the battle
manifest. The snapshot contains the effective mode and settings revision, but
does not identify whether the effective mode came from the default, the
persisted administrator setting, or the deployment override. It also does not
bind a deployment revision for an override. Sources:
`backend/src/services/battle-service.ts@4d446e4:790-808,918-935` and
`packages/shared/src/battle.ts@4d446e4:1812-1853,1889-1903,1961-1962`.

## Release, persisted-setting, and retained-trace readback

The latest GitHub release is `v0.21.7` at commit
`4d446e4e4459114dab9ac87ba2589040814224b4` with these immutable artifact
identities:

- backend image digest:
  `sha256:430891fec8dfdefcf298ecfd59ddcf257aac982418788e8589494cde700170ad`;
- Cloud Run revision: `kshiai-api-00116-doz`;
- Worker version: `d76ee358-8a3d-425a-8d07-a528233f6c08`;
- Stage workflow: `31943443643`;
- Promote workflow: `31943743584`.

The Stage workflow dispatch selected dialogue override `none`, and the deploy
step used `--remove-env-vars=DIALOGUE_CONTEXT_PROJECTION_OVERRIDE`. The Promote
record routed the exact staged revision. Sources:
[release v0.21.7](https://github.com/mako10k/kshiai/releases/tag/v0.21.7),
[Stage workflow](https://github.com/mako10k/kshiai/actions/runs/31943443643),
[Promote workflow](https://github.com/mako10k/kshiai/actions/runs/31943743584), and
`docs/release-0.21.7-plan.md@4d446e4:15-22`.

The current persisted singleton readback is:

| Setting identity | Mode | Revision |
| --- | --- | ---: |
| `dialogue-pipeline:global` | `legacy` | 5 |

The newest retained developer/test battle found by the bounded query is
`btl_ab2a5d9e1c161517ed019e0d5e3e4e83`. Its immutable binding is:

| Mode | Settings revision | Generation ID | Content digest | Focus rule | Pipeline trace |
| --- | ---: | --- | --- | --- | --- |
| `legacy` | 5 | `dialogue-pipeline:global:g1:b1bef75b445834cc` | `b1bef75b445834cc52d7ed770254a6ff1f8a9287b622c2ba4c7e247f91645650` | absent | retained |

This retained battle proves that its own effective mode was frozen as `legacy`;
it does not prove the current service environment. Combining the current
database setting with the release-bound removal of the override supports a
high-confidence inference that a new battle on the unmodified `v0.21.7`
revision resolves to `legacy`. Because the direct live service descriptor was
not available, current production activation is still classified as inferred,
not independently observed.

## Character-focus boundary

Current-main code defaults `CHARACTER_FOCUS_SHADOW_MODE` to `off`. If explicitly
set to `shadow`, only newly created battles bind
`character-focus-shadow-v1`; the resulting focus state and receipt remain an
internal, no-effect shadow and are deliberately removed from the expression
consumer input. Sources: `backend/src/config.ts@4d446e4:79-86,285-287` and
`backend/src/services/battle-service.ts@4d446e4:930-932,1660-1663`.

The latest retained battle above has no character-focus rule. The Stage release
workflow neither sets nor removes `CHARACTER_FOCUS_SHADOW_MODE`, and direct live
environment readback was unavailable. Therefore the current live shadow enum is
unknown. Regardless of that enum, current-main code does not let focus affect
product expression.

## DCL and plan-drift reconciliation

The compact-dialogue implementation is present on current `main`. Its bounded
implementation lineage includes:

- `9fe542fe57790f6f62cb32bec6bb2d44a9299eb2` — separate compact dialogue
  context threads;
- `12158368cdbbdbea51e1a55dad9ae3a1b83846c1` — complete compact dialogue
  appraisal loop;
- `5ba5201ac4dc2946ac6e9e7e11b75bb3bb256379` — scope dialogue projection to
  staged revisions;
- `291b7391307aed9e32945963dac524a40b05334c` — strengthen dialogue social
  feedback;
- `bf207e6c94280187cab085c589e2fbd51612c735` — type dialogue social
  consequences;
- `afe2eda4fdda9b1bcfd1e3ab23b0c7aeb4714694` — separate matchup memory from
  dialogue state;
- `15f7845e2fa716e84ab3cea1d33f29d9e5ece40b` — clear compact memory on prologue
  fallback;
- `efb3e7f80a69cab4d2cc0ec40b7858ae9793613b` — allow dialogue reappraisal after
  a failed approach.

Tests on current main cover revision-local override non-mutation, stable
battle-owned snapshots, compact consumer input, no-effect focus shadow, matchup
memory isolation, and the rejected-prologue fallback. Sources:
`backend/src/services/battle-speech-wiring.test.ts@4d446e4:253-264,542-655,698-756`
and `packages/shared/src/dialogue-context.test.ts@4d446e4:128-140`.

Therefore `DCL_IMPLEMENT` is achieved and its `active` status was stale. This
audit marks only that implementation task done. It does not mark the later DCL
acceptance milestones reached: the historical observations used different
revision-local candidates, the final-candidate six-battle Stage set is not
established, and the required three protected production observations are not
established. Normal compact activation is also not established: the current
persisted mode remains `legacy` and the current release selected no override.

The character-focus plan is separately stale. It lists
`CF_IMPLEMENT_OPT_IN_CANDIDATE` as the next task, while
`docs/character-focus-replay-rca.llmthink.dsl@4d446e4:161-190` explicitly says
not to select B, C, or D from that replay and requires a revised experiment.
This audit records the contradiction but does not perform the separately gated
`DAF_REPLAN_FOCUS` task.

## ADR namespace and next boundary

The handoff branch assigned dialogue activation to ADR-0016, but verified
current `main` already uses ADR-0015 through ADR-0017 for other decisions. The
next collision-free identity at the audited current-main revision is therefore
ADR-0018. A Proposed ADR-0018 accompanies this audit. Its identity must be
rechecked against current `main` before integration, and the branch's divergent
ADR-0015 must be reconciled rather than merged as a duplicate.

No implementation, administrator-setting change, Stage dispatch, provider
call, production write, or ADR acceptance follows from this audit.

## Validation

- The LLMTHINK audit of the RCA returned zero fatal, error, warning, info, and
  hint findings.
- `npm run adr:check` accepted ADR-0018 as `Proposed` with pending owner
  acceptance.
- Both changed PERT documents pass document, schedule, and next-task analysis
  without diagnostics. The recovery frontier is now
  `DAF_ACCEPT_ACTIVATION_ADR`; the DCL frontier is `DCL_LOCAL_VERIFY`.
- The optional disposable sealgraph reconstruction was attempted with
  sealgraph `0.1.0-dev`, but the installed CLI now requires
  `add --root --clear-cause-links` and is incompatible with the advisory
  adapter. No canonical ADR was changed. Per ADR-0015, this advisory-tool drift
  is reported but does not alter or block the canonical result.
