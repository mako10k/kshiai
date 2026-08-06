# Battle Pipeline Canonical Patch PoC

## Status

- Task: `T_PATCH_POC`
- State: built
- Date: 2026-08-06
- Estimate: 2p
- Forecast velocity: 2p/day
- Forecast duration: 1 day
- Authority: shadow-only; no canonical commit or battle-service wiring
- Evaluation: pending (`T_PATCH_EVAL` remains separate)

This prototype tests whether selected authoritative results can be represented
as bounded canonical fact assertions, retractions, and causal links without
moving authority out of their existing subsystems.

## Contracts

`packages/shared/src/battle-canonical-patch.ts` defines strict schemas for:

- canonical temporal points and provenance;
- shadow canonical facts;
- causal links;
- assertion, retraction, and touched-reference patches;
- deterministic audit issues and results;
- `converted` and `indeterminate` conversion results.

Every patch has `mode: "shadow"`. The module exposes no commit function and is
not called by `battle-service`, the deterministic resolver, semantic commit, or
world commit.

## Selected conversions

The PoC converts only already-decided results:

1. non-zero deterministic mechanical evidence;
2. applied semantic transitions using authoritative before/after state;
3. applied world transitions over existing entities and areas;
4. accepted or partial free-action world transitions with free-action
   provenance.

Mechanical facts remain owned by the deterministic resolver. Semantic and
world facts require their validated transitions. Free-action facts retain
`free_action_commit` authority. A converter cannot create a new canonical
identity, infer a missing old fact reference, or reinterpret a rejected result.
Those cases return `indeterminate`.

## Lightweight audit

The code audit checks:

- strict schema and hard count limits;
- serialized patch bytes;
- subject and object reference existence;
- assertion/retraction overlap and missing retraction targets;
- conflicting assertions and conflicting unretracted current facts;
- simple forbidden character/mechanical states;
- causal coverage and causal relation/target compatibility;
- touched-reference completeness;
- subsystem/authority compatibility;
- explicitly incomplete audit context.

`no_issue_found` means only that these checks found no issue in the supplied
scope. `indeterminate` remains distinct when the audit context is incomplete.

## Automated evidence

`packages/shared/src/battle-canonical-patch.test.ts` covers:

- mechanical, semantic, world, and free-action shadow conversion;
- source-state non-mutation and absence of commit authority;
- preservation of old fact retractions and causal attribution;
- successful audits for representative valid conversions;
- schema, unknown-reference, conflict, forbidden-state, size, retraction,
  causal, touched-reference, and authority defects;
- `indeterminate` fallback for missing prior facts, new identities, and
  incomplete contexts.

These are construction and static-audit checks, not effectiveness evidence.
`T_PATCH_EVAL` must separately measure parity, defect recall, false rejection,
scope size, unexplained changes, and authority regressions before later tasks
can be unblocked.

## Limitations

- New entity and area declarations are intentionally not converted.
- Only structured before/after values are converted; prose is never treated as
  canonical evidence.
- Embedded references are checked only when converters expose them as
  `objectRef`.
- No patch is persisted, committed, or used to resolve a battle.
- Static audit cannot prove global consistency or objective battle correctness.
