# Battle Pipeline Canonical Graph View PoC

## Status

- Task: `T_GRAPH_POC`
- State: built and construction-validated
- Date: 2026-08-06
- Estimate: 2p
- Forecast velocity: 2.3125p/day
- Forecast duration: approximately 0.86 day
- Authority: read-only in-memory view; no commit or persistence authority
- Evaluation: active; fixture, evaluator, and protocol frozen while the formal
  20-repetition run remains separate

This prototype tests whether the current `BattleState` JSON can be
deterministically reconstructed as a bounded, indexed canonical graph view
without migrating storage or changing battle resolution.

## Adapter boundary

```text
BattleState snapshot
    -> deterministic graph reconstruction
    -> immutable graph indexes
    -> graph-backed projection reads / patch context reads
```

`packages/shared/src/battle-canonical-graph.ts` defines the immutable
`BattleStateCanonicalGraphView`. The view clones its inputs and exposes no
canonical commit function. A graph can be discarded and rebuilt from the same
legacy state.

The existing projection module now accepts an optional
`BattleProjectionReadSource`. Without one, `BattleStateProjectionAdapter`
retains its prior direct behavior. With the graph view supplied, adjudication
and consistency projections obtain entities, interaction edges, facts, causal
links, active processes, rules, and relevant issue views through graph indexes.
Observer-local projection still reads the cloned perception frame because it
is observer-owned state rather than canonical graph fact authority.

## Indexed views

The graph snapshot and indexes cover:

- entity identity from world areas, world entities, semantic-only entities,
  characters, the battle scene, and active effect processes;
- state-derived mechanical, world, semantic, temporal, and event facts;
- subject and inverse-object fact references;
- fact validity by turn;
- causal links by source and target fact;
- interaction edges by source and interaction kind;
- active world-process references;
- purpose-scoped consistency-issue views from the optional shadow envelope;
- applicable battle rule references.

The deterministic snapshot is strict-schema validated, uniqueness-checked,
reference-checked, bounded to 4 MiB, and sorted independently of JSON object or
pair-relation insertion order. Raw graph queries are explicitly marked
`server_only_graph_query`; their canonical references are not character-facing
observation DTOs and must not be sent directly to an LLM.

## Projection and patch reads

`createCanonicalGraphProjectionAdapter` supplies the graph as the indexed read
source for the existing projection contracts. It does not add runtime wiring;
callers must opt in explicitly.

`readPatch` builds a bounded shadow context containing:

- current facts whose subject is touched;
- inverse facts that refer to a touched entity;
- requested retraction facts and missing retraction references;
- current facts occupying an assertion's state slot;
- recent causal facts and their connected links;
- connected issues and rules.

The patch path remains a read only. It does not audit, apply, or commit the
patch, and it reports `sourceMutated: false` in the strict result envelope.

## Construction evidence

`packages/shared/src/battle-canonical-graph.test.ts` covers:

- deterministic graph reconstruction after legacy JSON map and relation order
  changes;
- mechanical character identity and facts when legacy state has no world or
  semantic overlay;
- source-state immutability;
- entity, fact, temporal, causal, process, issue, rule, and interaction indexes;
- direct and inverse patch context lookup;
- graph-backed observation, adjudication, and consistency projection parity;
- unchanged deterministic turn actions, events, and combat parameters.

These tests establish construction behavior only. `T_GRAPH_EVAL` must
separately measure frozen fact equality, ordering independence, committed
outcome parity, latency, memory and serialized growth, index maintenance,
reconstruction and restart cost, complexity, and rollback behavior.

The separate evaluation definition is frozen in
`battle-pipeline-canonical-graph-evaluation-protocol.md`. Its construction
smoke is not formal evidence and does not complete `T_GRAPH_EVAL`.

## XAI decision

No XAI request was made. Reconstruction, expected facts, references, parity,
and mutation boundaries are structured deterministic claims. XAI may be used in
the separate evaluation only if an actually semantic comparison cannot be
resolved from frozen structured evidence.

## Limitations

- Graph fact IDs remain deterministic projection-view IDs, not independently
  persisted canonical fact identities.
- Minimal entity attributes describe the adapter source and current canonical
  label; they do not promote legacy labels into new authority.
- The graph keeps only the state and history already represented by
  `BattleState`; it cannot recover omitted historical facts.
- The optional issue envelope remains shadow storage outside `BattleState`.
- No restart envelope was added because construction did not require one;
  restart and serialized-growth value remain evaluation questions.
- Current parity tests use representative structured battles, not the frozen
  evaluation corpus.
- Passing construction tests cannot guarantee globally consistent or
  objectively correct battle outcomes.
