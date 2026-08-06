# Actual-Turn Local Shadow Observer

Status: offline observer ready; capture authority not decided

Plan task: `T_OFFLINE_OBSERVER`

Protocol:
[battle-pipeline-actual-turn-shadow-observation-protocol.md](battle-pipeline-actual-turn-shadow-observation-protocol.md)

## Result

The offline observer implements the protocol without adding a battle-runtime
hook. It accepts one explicit local JSON file, reads and hashes its bytes before
and after processing, emits only a redacted structural audit to stdout, and
does not write the source or any report.

```text
npm run observe:battle-pipeline-actual-turn --workspace=@kshiai/backend -- \
  --input <local-json>
```

The accepted versioned input modes are:

- `actual_turn_shadow_observation_envelopes`
- `persisted_battle_state`
- `persisted_battle_turn_records`

Complete envelopes require opaque SHA-256 reference tokens and literal
zero-write, zero-provider, and zero-identity evidence. Existing persisted
state and turn records are accepted only for a sufficiency audit. They produce
`insufficient_source` for all five classifier input areas:
`allowedFallbacks`, `proposals`, `adaptive`, `reads`, and `issues`.

The observer does not infer missing fields from actions, events, cognition,
speech, narration, or other prose. Its report excludes the source path,
battle and observation identifiers, turn number, capture timestamp, names,
prose, prompts, provider payloads, and media URLs.

## Implemented boundaries

- local regular non-symlink files only
- maximum input size of 16 MiB and maximum 500 records
- strict schema/version and pseudonymous reference validation
- source byte SHA-256 before and after observation
- fail closed if the source changes between reads
- no source/report file writes
- no repository, service, DB, HTTP, provider, LLM, or XAI imports
- no classifier invocation, canonical write, persistence write, release, or
  deployment

## Effectiveness evidence at this milestone

Synthetic regression tests demonstrate:

- complete privacy-safe envelope acceptance
- canonical-looking reference and source-mutation claim rejection
- complete-envelope structural audit without private output
- persisted-record `insufficient_source` behavior with zero inferred fields
- fail-closed behavior when source bytes change between reads
- explicit `--input`-only CLI and forbidden dependency boundary

This supports only offline observer readiness. It does not demonstrate that a
complete envelope can be captured from actual turns, that an actual sample is
sufficient, or that the classifier is accurate. Runtime hook implementation,
activation, DB/network access, and actual data capture remain gated by
`T_CAPTURE_AUTHORITY_DECISION`.
