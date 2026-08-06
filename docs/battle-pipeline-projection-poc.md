# Battle Pipeline Projection PoC

## Status

- Task: `T_PROJECTION_POC`
- State: built
- Date: 2026-08-06
- Authority: read-only prototype; not wired into battle resolution or commit
- Evaluation: not yet performed (`T_PROJECTION_EVAL` remains separate)

This artifact establishes that purpose-specific slices can be represented over
the current `BattleState`. It does not establish that the selected scope is
complete, that a projected interpretation is coherent, or that any battle
result is objectively correct.

## Implemented boundary

`packages/shared/src/battle-projection.ts` defines strict contracts for:

- `InteractionScope`
- `ObservationSlice`
- `AdjudicationSlice`
- `ConsistencySlice`
- `CanonicalReadResult<T>`
- request-specific and configurable projection limits

`BattleStateProjectionAdapter` takes one structured clone of the supplied
`BattleState`. All projection reads use that private snapshot and do not call
the resolver, commit state, update perception, or invoke an LLM.

### Observation boundary

Observation slices are character-facing. Canonical subject references are not
copied from perception slots. Instead they are replaced with:

```text
self
counterpart
subject.1
subject.2
...
```

The slice carries observer-safe percepts, qualitative changes, reserve cues,
observer-safe scene statements, and explicit identity/access uncertainty. Its
scope exposes only local references and observable interaction kinds. Internal
entity counts and canonical mappings are not included.

### Server-only boundaries

Adjudication and consistency slices retain canonical references because they
are server-only inputs. The adapter collects bounded mechanical, world,
semantic, temporal, and committed-event facts from the current state and recent
turn records.

Interaction traversal currently recognizes:

- physical contact, movement reachability, line of sight, and audibility
- ownership/control, containment, and attachment support
- action/event causal dependencies
- active effect propagation within a world area
- remote targeting relationships
- committed utterance communication
- shared world/semantic identity dependencies
- applicable rule dependencies

Traversal is deterministic and based on explicit current structures. It is not
a proof that every implicit dependency has been found.

## Limits

Each request may lower the following hard-bounded limits:

- entities
- facts
- rules
- serialized UTF-8 bytes
- retained history turns

Truncation is reported on the scope with omitted entity, fact, rule, and history
counts. If count trimming is insufficient, fact and presentation detail are
removed deterministically until the byte envelope fits.

## Consistency semantics

Every PoC read currently returns:

```text
consistency.level = unchecked
checkedFactRefs = []
unresolvedIssueRefs = []
```

This is deliberate. Phase 1 defines and populates projection contracts only.
It must not claim `locally_coherent` before lightweight checks and issue lookup
exist. `ProjectionPatchContext` is only a Phase-1 anchor preview; it is not the
Phase-2 `CanonicalPatch` contract.

## Automated evidence

`packages/shared/src/battle-projection.test.ts` covers:

1. strict observation-schema parsing and canonical subject-ID removal;
2. physical, remote, causal, support, communication, identity, and active
   world-process traversal;
3. configurable entity, fact, rule, byte, and history limits;
4. bounded consistency facts and causal history;
5. source-state non-mutation and unchanged deterministic resolver outputs.

These tests are implementation and hard-invariant evidence. They are not the
effectiveness evaluation. In particular, they do not measure decisive-fact
recall or irrelevant-fact reduction against the frozen corpus.

## Evaluation handoff

`T_PROJECTION_EVAL` must run before this intervention can be judged
`supported`, `revise`, `unsupported`, or `indeterminate`. It should measure:

- decisive-fact recall, including seeded remote and indirect dependencies;
- irrelevant-fact and serialized-byte reduction from the frozen baseline;
- observer isolation and canonical-ID leakage;
- limit compliance and projection latency;
- unchanged baseline resolver outcomes;
- false-negative examples caused by the current deterministic traversal.

No later PoC entry task is authorized by merely completing this prototype.
