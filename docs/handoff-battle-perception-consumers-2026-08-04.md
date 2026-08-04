# Battle perception consumer integration handoff

Date: 2026-08-04 (Asia/Tokyo)

Status: Continued after the time-limit checkpoint. `T_CONSUMERS` and `T_COMPAT`
are implemented on this branch; the original WIP commit remains a transfer
checkpoint and must still be rewritten before merge. See
[`release-0.5.0-plan.md`](release-0.5.0-plan.md).

## Objective and decision locks

- Preserve the parent objective: observer-relative perception must not grant a
  character or narrator access to hidden canonical state.
- XAI is the primary perception provider. OpenAI is only its ordered operational
  fallback. A failing XAI test is a diagnosis/blocker for the XAI path, not
  authority to promote OpenAI or redefine the objective.
- Keep the accepted XAI combined topology unless material evidence requires the
  already-designed XAI split topology. Do not add another LLM iteration merely
  to simplify consumer wiring.
- Character-limited input must distinguish `self` from all other perception.
  A non-self subject may be perceived but unidentified, misidentified, or not
  perceived at all.
- Internal IDs may be used as control data where the perspective requires them,
  but must not be exposed in user narration.

The planning source is `docs/battle-perception.pert`, version 6. The current task
is `T_CONSUMERS`, and it intentionally has no `status done`. The next task is
`T_COMPAT`; do not advance to it until the consumer boundary is reviewed and
accepted.

## WIP branch and base

- WIP branch: `wip/perception-consumers-20260804`
- Base commit: `51afb9a` (`Build perspective-safe narration views`)
- Starting branch was local `main`, which was nine commits ahead of
  `origin/main`. The WIP branch preserves that exact local ancestry.
- Expected WIP subject: `WIP: Integrate perception consumers and add handoff`

Obtain the exact WIP SHA after fetching with:

```sh
git rev-parse wip/perception-consumers-20260804
```

## Implemented in this WIP

### Derived narrator view

- `packages/shared/src/narration-perception.ts` adds a deeply frozen
  `NarrationTurnView` and deterministic `buildNarrationTurnView` boundary.
- Character-limited views contain their own action descriptions and frozen
  percept phenomena, not the canonical opposing action/event payload.
- External and omniscient views receive perspective-sanitized events and action
  beats. Participant labels are derived by the perspective layer.
- `backend/src/services/battle-service.ts` supplies the normal turn narrator with
  the derived view as its world/event source. The deterministic narration
  fallback also consumes that view.
- Subjective narration does not emit speech or reaction for an inaccessible
  counterpart.

### Character-agent input

- `backend/src/llm/types.ts` removes `foeName`, canonical cognition, and semantic
  observation from `advanceCharacterAgent`. The call now receives its immutable
  self-labelled perception frame, allowed action/decision data, and previous
  private continuity.
- `buildCharacterAgentConsumerInput` in
  `backend/src/services/battle-service.ts` clones and freezes the supplied frame.
- Counterpart name is included only for `identityKnowledge === "identified"`.
  Counterpart condition additionally requires current coarse or clear access.
- Both XAI-primary and OpenAI-fallback paths share the updated
  OpenAI-compatible adapter contract and prompt. The prompt treats the frame as
  authoritative, preserves uncertainty, and treats IDs as control-only data.
- The mock adapter follows the same frame/perception boundary.

### Initial state and private continuity

- `packages/shared/src/battle-engine.ts` initializes minimal A/B frames with
  self reserve cues.
- New battles keep `legacyCounterpartIdentified: false`; they must not acquire
  identity without evidence. Seeding active legacy battles is deliberately left
  to `T_COMPAT`.
- Inner digests include counterpart condition only when the counterpart is
  identified and currently available at coarse or clear resolution.

### Regression coverage added or updated

- `backend/src/services/battle-consumer-wiring.test.ts` covers A/B frame
  isolation and conditional counterpart knowledge.
- Shared narration tests cover the A/B subjective boundary and absence of IDs
  from external views.
- Mock tests cover omission of inaccessible opponent speech in subjective
  narration.

## Last completed validation

These commands passed against the implementation files in this WIP before this
handoff document was added:

```text
npm run typecheck
  passed all workspaces and deployment checks

npm test
  shared: 112
  backend: 67
  frontend: 13
  deployment: 3
  total: 195 passed

npm run build
  passed shared, backend, and frontend builds
  Vite emitted only the existing/non-blocking >500 kB chunk warning

perttool document check docs/battle-perception.pert
  passed with the existing PTDAG-208 closure warnings
```

An intermediate test correctly exposed that initializing new battles with
`legacyCounterpartIdentified: true` leaked setup identity. The implementation was
changed to `false`, and the full test/typecheck/build results above are after that
correction.

No live provider call was run for this WIP. In particular, there is no new live
XAI acceptance evidence. Do not substitute an OpenAI result for that evidence.

## Continuation completed after handoff

1. Reviewed normal-turn consumer wiring: agents receive frozen frames only;
   narrator receives `NarrationTurnView`; public/SSE/CLI paths omit frames and
   registries.
2. Decided `NarrationTurnView` stays TypeScript + deep-freeze only (ephemeral,
   never client-deserialized). No Zod runtime schema.
3. Confirmed prologue/aftermath remain specialized and unmigrated.
4. Implemented `ensureBattlePerceptionState` for active legacy battles: empty
   registries, identified counterpart from setup, explicit self frame.
5. Added compatibility coverage for legacy seed, conditional counterpart
   knowledge, sensory rejection with registry retention, and public non-leakage.
6. Next remaining work is `T_ACCEPT` plus clean history rewrite and the 0.5.0
   release process in [`release-0.5.0-plan.md`](release-0.5.0-plan.md).

## Suggested continuation

```sh
git fetch origin
git switch wip/perception-consumers-20260804
git status --short --branch
git show --stat --oneline HEAD

npm test
npm run typecheck
npm run build
perttool document check docs/battle-perception.pert
```

When `T_CONSUMERS` is genuinely complete, preview the PERT change before writing
it. Do not reuse the earlier preview as completion evidence:

```sh
perttool task finish docs/battle-perception.pert T_CONSUMERS --diff
perttool task finish docs/battle-perception.pert T_CONSUMERS --write
perttool document check docs/battle-perception.pert
perttool dag next docs/battle-perception.pert
```

Check the installed `perttool` help if its command-line contract differs on the
continuation machine.

## Mandatory WIP cleanup before final publication

This commit is a transfer checkpoint only. **Do not merge or finally publish the
`WIP:` commit as-is.** After implementation, review, PERT status, and validation
are complete, fold this checkpoint into clean focused history:

```sh
# If one final commit is appropriate:
git commit --amend -m "Integrate frozen perception consumers"

# If the continuation adds commits that should be combined:
git rebase -i 51afb9a
```

Use amend or squash to remove the WIP commit/subject before the final push. If
the already-pushed WIP branch itself is rewritten, update only that exact branch
with `--force-with-lease`; never use an unguarded force push. Re-run the complete
validation after the rewrite, read back the remote SHA, and only then finish the
normal PR/merge/push workflow. Do not push directly to `main` unless repository
policy and explicit user authority allow it.
