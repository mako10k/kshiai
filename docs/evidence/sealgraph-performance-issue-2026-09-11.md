## Summary

Cause-heavy graphs with shared dependency subgraphs can make `impact`, `stale`, and per-REF `status` take minutes. Human-terminal commands emit no intermediate indication, so a valid long traversal is indistinguishable from a hang until completion.

## Resolution update (2026-09-11)

The owner reported that the Sealgraph performance problem has been resolved. A current read-only check in this repository observed:

- targeted `status`: 2.00 seconds
- targeted `impact`: 0.61 seconds
- global `stale --scan`: 3.00 seconds

These measurements confirm that the previously reported minute-scale symptom is not currently reproduced here. They do not independently identify or verify the upstream correction mechanism. GitHub Issue #13 was not closed or otherwise changed in this work; issue-state mutation requires a separate instruction.

## Observed environment

- `sealgraph 0.1.0-dev+5ae88c7`
- WSL2 Linux amd64
- Repository: 230 refs, 584 seals, 1,788 blobs; `fsck` reports `ok`

## Measurements

- `sealgraph impact evidence/semantic-migration-continuation --format json`
  - approximately 197 seconds
  - successful result with `impacts: []`
- `sealgraph stale --format json`
  - no output after more than seven minutes; manually interrupted
- five targeted `sealgraph status REF --format json` processes
  - all eventually returned `SEALED_STATE_CLEAN`
  - the batch took approximately 90 seconds

The graph is valid and the affected result REF had no downstream impact. The time is therefore not explained by an integrity error or a large result payload.

## Suspected scaling shape

Many current refs share Cause subgraphs. Recomputing stale paths and frontier reachability independently for each head can repeatedly traverse the same closure. This is a hypothesis for maintainers to verify, not a confirmed implementation cause.

A local uncommitted experiment already exists in the maintainer checkout around memoizing stale paths/frontier reachability and adding a shared-subgraph benchmark. This issue is the durable tracker; that WIP has not been validated as the complete fix and should not be inferred as resolving `impact`, `status`, or terminal feedback.

## Expected behavior

- Traversal work should scale primarily with unique observed nodes/edges plus returned paths, rather than refs multiplied by their shared closure.
- `impact`, `stale`, and `status` must preserve exact current results and deterministic ordering.
- Add regression/benchmark coverage for many heads sharing a deep Cause chain.
- If a valid traversal can still take materially long, human-terminal mode should provide bounded progress or an explicit “scanning graph” indication on stderr without contaminating JSON or line-protocol stdout.
- Cancellation must remain safe and must not mutate or repair the repository.

## Alternatives

- Memoize shared closure/path computations: likely highest performance benefit, but cached path slices must not be mutated by callers.
- Add only progress output: improves observability but does not fix the repeated work.
- Persist an index: may improve repeated commands but adds cache invalidation/storage complexity and should not become canonical stale state.
