# Actual-turn source-authoring shadow PoC WIP handoff

Date: 2026-08-06 (Asia/Tokyo)

Status: Superseded by the closure update below. This document preserves the
exact WIP freeze point for auditability; it is no longer the current restart
instruction.

## Closure update

The WIP was resumed on 2026-08-06 from remote commit `693db96`. Two stale test
expectations were corrected without changing the frozen production boundary:
the synthetic observer now actually throws after its immutability assertion so
the fail-open error path is exercised, and the exhausted-resource case expects
the canonical `rest` substitution while still proving that fallback policy is
not inferred from the resolved action.

The targeted three-test suite, full `npm test`, `npm run typecheck`, and
`npm run build` all pass. `T_SOURCE_AUTHORING_SHADOW_POC` is complete with a
conformant basis-bound outcome. The exploratory PoC phase ends here; the old
`T_SOURCE_AUTHORING_EVAL` path is blocked as superseded and actual capture
remains unauthorized. Current execution authority is
[`battle-pipeline-production-rollout.pert`](battle-pipeline-production-rollout.pert),
with operating rationale in
[`battle-pipeline-production-rollout.md`](battle-pipeline-production-rollout.md).

## Objective and decision locks

- Preserve the parent objective: evaluate whether five authoritative owner-stage
  artifacts can be assembled during an ordinary turn without affecting battle
  results or performing external effects.
- Actual-turn capture remains unauthorized. Do not access actual user data, a
  database, the network, providers, external LLMs, or XAI from this WIP.
- Keep source authoring in shared deterministic code. Do not add canonical,
  battle, or persistence writes to complete the shadow PoC.
- The shadow observer is disabled by default, receives a deeply frozen clone,
  ignores its return value, and must fail open if either observation or error
  reporting throws.
- PERT task `T_SOURCE_AUTHORING_SHADOW_POC` is active, not complete. Do not mark
  it complete until the targeted and full validation gates pass and the evidence
  is reviewed.

## Branch and checkpoint base

- Branch: `poc/battle-pipeline-projection`
- WIP base: `48d1f6347111efdb91d177cac70c18816b0ab867`
  (`Implement actual-turn source authoring core`)
- Protocol commit: `4bd1bfe` (`Freeze actual-turn source authoring protocol`)
- Protocol digest remains
  `34ef9f701450b78fd9afda85633e3e8e379b7d80e6240474712d831bb6893285`.

Obtain the exact WIP checkpoint SHA after fetching with:

```sh
git rev-parse origin/poc/battle-pipeline-projection
```

## Implemented but not yet accepted

- `packages/shared/src/battle-engine.ts` adds an optional requested-action
  observer immediately after both requested actions and action IDs are fixed,
  before temporal resolution. It receives only a cloned and deeply frozen
  snapshot. Observer and error-handler failures are swallowed and observer
  return values are unused.
- `packages/shared/src/battle-actual-turn-source-authoring-shadow.ts` runs paired
  control/shadow turns, assembles the five source-authoring artifacts through
  the core lifecycle, and compares outcome, state, actions, events, mechanical
  evidence, narration input, persistence candidate, and empty effect traces.
- The harness fixes the exclusion boundary at zero for backend wiring, actual
  capture, repository, DB, network, provider, LLM, XAI, canonical writes, battle
  writes, and persistence writes.
- `packages/shared/src/battle-actual-turn-source-authoring-shadow.test.ts` defines
  the preregistered S01-S09 synthetic ordinary-turn cases, including observer
  failure, conflicted reads/issues, world-process proposal, and exhausted-budget
  fallback cases.
- `packages/shared/src/index.ts` exports the new shadow harness.
- `docs/battle-pipeline-actual-turn-shadow-observation.pert` records only the
  task start event `WE_SOURCE_AUTHORING_SHADOW_POC_START`. It has no completion
  event, outcome, or reached shadow milestone.

Checkpoint file digests before this handoff document was added:

```text
battle-engine.ts                                      e997d22bd90103be6d63751c6c9320d42fcbd4d61d01bec47898ae24d8dfd85f
battle-actual-turn-source-authoring-shadow.ts         08a7fd0533f44ecedae03a1ee44d71bc4ecca2aaf6e5c2524f4c670abbabb9de
battle-actual-turn-source-authoring-shadow.test.ts    a2e3c71b254fcb658358ed1d656cb778cd520ce1ceabf8c1da48e9640af6f6b1
index.ts                                              ddf532a8982bcf8e4140334caf6fdf9daf4de672ecbc14c221b68d092ed05159
battle-pipeline-actual-turn-shadow-observation.pert   5f03f808437e83cb23dd257efe8be6492976d0d0a4491a3133559e88b86e4eac
```

## Historical validation at the freeze point

Passed after all current implementation and test files were added:

```text
npm run typecheck --workspace @kshiai/shared
```

Not run due to the time-limit interruption:

```text
node --import tsx --test packages/shared/src/battle-actual-turn-source-authoring-shadow.test.ts
npm test
npm run typecheck
npm run build
perttool document check docs/battle-pipeline-actual-turn-shadow-observation.pert
```

No test result, parity result, S01-S09 completion claim, or PoC effectiveness
claim should be inferred from the passing shared typecheck alone.

## Historical continuation (superseded)

```sh
git fetch origin
git switch poc/battle-pipeline-projection
git status --short --branch
git show --stat --oneline HEAD

npm run typecheck --workspace @kshiai/shared
node --import tsx --test packages/shared/src/battle-actual-turn-source-authoring-shadow.test.ts
```

If the targeted tests fail, first inspect fixture/schema assumptions and the
fixed-clock behavior. In particular, verify the interrupted-partial case and
the unaffordable-skill-to-basic fallback rather than weakening their assertions.
After targeted correction, run the full validation commands listed above.

Only after those gates pass should the continuation preview and digest-bind the
PERT completion, add the conformant outcome evidence, reach
`SOURCE_AUTHORING_SHADOW_READY`, and run `perttool dag next`. The expected next
task is `T_SOURCE_AUTHORING_EVAL`; this expectation is not completion evidence.

## Mandatory WIP cleanup

This checkpoint must not be merged as a final implementation commit. After the
shadow PoC is genuinely validated and its PERT evidence is recorded, amend this
commit or squash the continuation into focused history, then rerun validation.
If updating the already-pushed WIP branch after rewriting it, use
`--force-with-lease` only for this exact branch and verify the remote SHA.
