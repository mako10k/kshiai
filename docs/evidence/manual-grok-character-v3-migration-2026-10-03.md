# Owner-directed manual Grok CLI character migration

## Authority and scope

On 2026-10-03 the owner explicitly requested the assistant to export every unmigrated character, convert it through Grok CLI, and add an updated V3 revision: 「今あなたが手動で行う」「全件を対応して下さい」. This is the manual owner-directed JSON migration route permitted by Accepted [ADR0043](../adr/0043-v3-character-updates-with-historical-v2-display.md). It does not add an application import endpoint or enable trial activation flags.

The initial production inventory contains 51 character rows: five labelled current V3, 12 current schema2, one schema1, and 33 without a current immutable generation. Full value validation found two of the five schema3-labelled fixtures lack valid envelopes. Therefore 48 rows require migration or repair, including 16 deleted records and existing test/observer fixtures. All are included; deleted records remain deleted. The three valid existing V3 rows are excluded.

## Procedure

Exact source rows, immutable source content where present, conversion input, schema, CLI request/output/usage, validation, and success receipts are saved under `/home/mako10k/kshiai-manual-v3-20261003` with restricted local access. These private character artifacts are not committed to Git. Grok receives character definition and relevant source rules, without owner identifiers, battle records or opponent memories.

The existing legacy reader prepares a structured base for rows without a valid complete envelope. A valid immutable V2 envelope takes precedence when available. Incomplete fixture envelopes with definitions conflicting with their saved character use the current saved sheet for identity and mechanics, while their existing semantic rules are preserved and the entire inconsistent original remains in the source backup and old immutable generation. Stable fields of the chosen base are preserved exactly. Grok converts only action norms, conscious guidance, and mechanical conflict fallbacks; 36 explicit source rules/objectives are individually accounted for. Empty source collections do not authorize invented rules. A separate stateless Grok request reviews the complete source and candidate, and assesses support for the unchanged public profile. Unresolved findings block registration.

The owner explicitly approved changing the dragon's legacy `gekirin_fury` constraint into a conscious commitment while preserving its exact statement and priority. This is the sole owner-approved semantic strength change; it is not recorded as mechanically equivalent. Legacy DecisionProfile is an explicit conscious decision input, so its principles map to awareness `aware`, and its defaultObjective is an explicit goal mapped to `commitment`, rather than classifying natural language through pattern matching.

Before registration, validate strict V3 definition/envelope schemas, all source accounting and registered references, the actual battle compiler, compiler readiness and profile claim receipt. Registration uses existing immutable asset append and CAS activation functions. Under the transaction lock, reread the live character and source pointer, reject source drift or concurrent authoring, and preserve live ownership, creation time, visibility, deletion state, records, opponent memories, improvement memo, and previous image reference. Retain the exact exported source in the restricted authoring attempt record; do not fabricate a historical V2 generation for a row that never had one. Each successful manual attempt is recorded as operator-directed import, not as an ordinary owner UI confirmation or application-provider run.

Existing immutable generations and battle bindings are untouched. This operation requires no service deployment or database DDL. CLI accounting is recorded from actual output; absent accounting must remain unknown rather than zero. Manual CLI use does not establish battle quality.

## Result

Pre-registration gate passed: 48 converted/reviewed candidates, exact stable-field and source-rule audit, and 48 real transactional registration dry runs rolled back successfully. Grok CLI produced 134 recorded request receipts, maximum five per character, including one cancelled terminal response. CLI-estimated cost totals USD 4.17275608; this is the CLI estimate, not a billing statement. Actual model identities were `grok-4.7-build` and `grok-4.7-build-fast`.

The required projector repair is committed at `c341bfd9fec37aecb4af483b1447d2c493bcf4ca`. [CI 37106881597](https://github.com/mako10k/kshiai/actions/runs/37106881597) passed all four jobs. Build, typecheck, governed tests (229; active41/provisional2), static checks, ADR0048 audit and four direct profile/permission regression tests passed. No disabled historical test is counted as passed.

Cloud Build `9effd690-2e23-49c5-bbb3-6142fad8542f` succeeded. Image digest `sha256:bab0ada1af3cff207afd55a971225bfe9125b11449e07a4d99b11e528520ae32` was deployed as `kshiai-api-profile-c341bfd`; Worker `40f39b55-0661-4114-88bc-97faa4baeb13` points to its tagged URL. Tagged health and container configuration comparison passed before promotion; public deployment smoke passed after promotion.

Registration is the remaining step. The sanitized completion receipt will record final generation IDs, readback, and historical-source preservation.
