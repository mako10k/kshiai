# Battle pipeline production observation handoff

Date: 2026-08-07 21:50 JST

Status: The current 35-point observation-driven plan is complete. Production
release `v0.12.2` and its retained E2E observation are recorded on `main`.
There is no implementation or release work in progress. The next machine must
replan the next bounded pipeline slice before starting it.

## Exact repository checkpoint

- Repository: `mako10k/kshiai`
- Remote branch: `main`
- Current merged checkpoint before this handoff:
  `03c49ca5503cfd03ec62a943c5799a04d56e3f1a`
- Observation closeout PR: [#60](https://github.com/mako10k/kshiai/pull/60)
- All four required PR checks passed: `validate`, `security`, `backend-image`,
  and `worker`.
- The worktree was clean and local `main` matched `origin/main` at the checkpoint.

After this handoff itself is merged, use the newer `origin/main` SHA as the
authoritative continuation point. Do not resume an older feature, release, or
observation branch.

## Production state

- Annotated release tag: `v0.12.2`
- Release commit: `b4155d7b49c417efce2ed989bc4933d13b48e64c`
- Stage workflow: 31177347444
- Promote workflow: 31177770404
- Backend revision: `kshiai-api-00048-fiw`, currently 100-percent traffic
- Backend image digest:
  `sha256:56929b8afe14d6a987bdbe8a801c1625aa9edc11a09fd45a3626ebd7664c92d6`
- Worker version: `7b272d2a-032f-4112-bc19-ae0b3599de82`
- Persistent E2E workflow: 31178518891
- Cloud Run Job execution: `kshiai-persistent-e2e-hpp4n`
- Retained battle: `btl_0c19c361b6d8127610c1c5b3`

The observation did not deploy or change traffic. A final readback still showed
`kshiai-api-00048-fiw` as the latest ready revision and sole 100-percent
untagged production target.

## What the observation established

The retained battle has 17 turn records, 16 canonical transitions, and 17
pipeline traces. It reused the two dedicated E2E identities and fixed character,
battlefield, and narrator fixtures. Cross-account battle, internal detail
access, and general-realm isolation passed.

Five environment proposals produced:

- one `accepted` receipt;
- two `no_canonical_change` receipts; and
- two `decision_rejected` receipts.

All four rejected proposals stayed private and mechanically inert: no resolved
event, source event, effect key, proposal-derived operation, or direct HP effect
was committed. The old environment-to-HP direct-injection phenomenon did not
recur.

The accepted turn-3 proposal crossed the intended temporal boundary with a
source event, resolved event, semantic/world revision advance, and
`/entities/stair_plate` effect key. Its meaning was wrong: the surface proposal
and public narration put a fallen stair plate on the wagon roof, but semantic
and world state placed it in Side B's hands. Site B then proposed that entity as
a defend instrument on turns 11 through 13, and the server accepted it.

This is recorded as `OBS-20260807-09`. It shows that acceptance density is no
longer the main obstruction. The next highest-value pipeline boundary is the
meaning equivalence between the proposed persistent result and the accepted
canonical operation, including downstream placement and affordance.

## Provider-routing readback

The exact observation window contained 78 successful LLM calls, all on xAI.
There were no retry lines and no OpenAI or Venice provider switch. Three invalid
character-state outputs were terminal `reason=other` failures; the router did
not switch providers, and the battle retained previous state.

This sample did not exercise timeout, HTTP 429, or HTTP 503. Their bounded
same-provider retry and no-provider-fallback behavior remains regression-tested,
not production-observed. Preserve the current policy:

- timeout: terminal, no provider fallback;
- 429: at most two same-provider retries, then terminal;
- 503: at most one same-provider retry, then terminal;
- DNS and billing/exhausted credit: one-hour cooldown and ordered next provider;
- parse, schema, and other operation errors: terminal, no provider fallback.

## Locked product and planning decisions

- Implement and try axial pipeline hypotheses before observation-only patching.
- Use retained observations to rank the next axial slice. Backlog entries record
  phenomena; they are not an automatic implementation queue.
- Keep the implementation thin and current-main-patchable. It need not be the
  final generalized world engine.
- Keep non-critical narrator wording, repetition, and unsupported flavor
  pending until pipeline maturity. Do not add an output guard. Improve narrator
  inputs when the selected pipeline slice naturally changes them.
- The accepted turn-3 narration also claimed the next move became easier without
  a corresponding canonical constraint. Retain this under `OBS-20260807-03`;
  do not let it preempt the canonical-operation meaning boundary.
- The environment pipeline and other new mechanisms remain always on in the
  current single-user production cohort. Do not add cohort splitting merely for
  this continuation.
- Preserve the reusable E2E users, fixtures, battles, and observations. Do not
  delete them after a run.

## Planning and actuals checkpoint

- Canonical execution plan: `docs/battle-pipeline-work.pert`
- Plan status: all 35p complete; finish milestone reached
- Last task: `T_TRY_ALIGNED_ENVIRONMENT_PROPOSALS`, estimate 1p
- Last task boundaries: start `2026-08-07T20:14:57+09:00`, finish
  `2026-08-07T21:42:00+09:00`
- Last task active time and effort: 3900s, `13/12h`, `13/12ph`
- Current measured Velocity: `2880p/1117h`
- Remaining forecast in the completed plan: 0p, `0h`

Do not reopen or rewrite the completed task. Extend or replace the plan with a
new point-estimated task only after deciding the next bounded slice. Record its
exact start before implementation, preserve suspend/resume/finish timestamps,
append actuals, and refresh Velocity from the latest one to three completed
tasks.

## Suggested continuation on another PC

```sh
cd /path/to/kshiai
secdat exec git fetch origin --prune
git switch main
secdat exec git pull --ff-only origin main
git status --short --branch
git rev-parse HEAD

npm install
npm run sync:secdat
perttool document check docs/battle-pipeline-work.pert
perttool dag analyze docs/battle-pipeline-work.pert
```

Read these sources before replanning:

1. `docs/battle-pipeline-production-rollout.md` for the decision hierarchy;
2. `docs/battle-pipeline-work.pert` for the completed plan and work events;
3. `docs/battle-pipeline-actuals.md` for exact actuals and Velocity history;
4. `docs/battle-fit-gap-backlog.md`, especially the v0.12.2 observation and
   `OBS-20260807-09`;
5. `docs/release-0.12.2-plan.md` for exact release and observation receipts.

The recommended next discussion is not “fix the narrator.” It is: define the
smallest patchable contract that can prove the accepted canonical operation is
semantically equivalent to the environment proposal's persistent result, while
preserving server authority, rejected-proposal inertness, and no direct
proposal-owned mechanics.

Use `secdat exec` for GitHub and remote Git operations. If `perttool` itself
blocks the planning workflow, open a bounded issue against `mako10k/perttool`
with `secdat exec gh issue ...` and preserve the exact command and output.
