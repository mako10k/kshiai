# Owner-directed manual Grok CLI character migration

## Authority and scope

On 2026-10-03 the owner explicitly requested the assistant to export every unmigrated character, convert it through Grok CLI, and add an updated V3 revision: 「今あなたが手動で行う」「全件を対応して下さい」. This is the manual owner-directed JSON migration route permitted by Accepted [ADR0043](../adr/0043-v3-character-updates-with-historical-v2-display.md). It does not add an application import endpoint or enable trial activation flags.

The initial production inventory contains 51 character rows: five current V3, 12 current schema2, one schema1, and 33 without a current immutable generation. The 46 non-V3 rows include 16 deleted records and existing test/observer fixtures. All are included; deleted records remain deleted. Existing V3 rows are excluded.

## Procedure

Exact source rows, immutable source content where present, conversion input, schema, CLI request/output/usage, validation, and success receipts are saved under `/home/mako10k/kshiai-manual-v3-20261003` with restricted local access. These private character artifacts are not committed to Git. Grok receives character definition and relevant source rules, without owner identifiers, battle records or opponent memories.

The existing legacy reader prepares a structured base for rows without a structured definition. A valid immutable V2 definition, including a partial-envelope fixture, takes precedence when available. Stable definition fields are preserved exactly. Grok converts only action norms, conscious guidance, and mechanical conflict fallbacks; 34 explicit source rules/objectives are individually accounted for. Empty source collections do not authorize invented rules. A separate stateless Grok request reviews the complete source and candidate, and assesses support for the unchanged public profile. Unresolved findings block registration.

Before registration, validate strict V3 definition/envelope schemas, all source accounting and registered references, the actual battle compiler, compiler readiness and profile claim receipt. Registration uses existing immutable asset append and CAS activation functions. Under the transaction lock, reread the live character and source pointer, reject source drift or concurrent authoring, and preserve live ownership, creation time, visibility, deletion state, records, opponent memories, improvement memo, and previous image reference. Retain the exact exported source in the restricted authoring attempt record; do not fabricate a historical V2 generation for a row that never had one. Each successful manual attempt is recorded as operator-directed import, not as an ordinary owner UI confirmation or application-provider run.

Existing immutable generations and battle bindings are untouched. This operation requires no service deployment or database DDL. CLI accounting is recorded from actual output; absent accounting must remain unknown rather than zero. Manual CLI use does not establish battle quality.

## Result

In progress. The sanitized completion receipt will record counts, candidate/source digests, appended generation IDs, verification, and any unresolved failures.
