# ADR-0055: Consistent phase narration contracts and bounded response diagnostics

- Status: Superseded
- Superseded by: [ADR0056](0056-latest-prompt-contract-until-completion.md)（旧版実行と固定開始条件を変更。その他の決定は後継へ継承）
- Date: 2026-10-05
- Decision owner: Repository owner
- Authority: 「実装・テストを修正して、デプロイ、再試合換装試験まで行ってください」 and explicit public kshiai.mk10.org/API+Worker completion-test reply.
- Related: ADR0053, ADR0054, [prompt inspection](../battle-awareness-prompt-inspection-2026-10-05.md), PERT awareness-prompt-repair / awareness-public-deploy / awareness-public-completion.

## Context

E-PC-01: All narration phases retain legacy single-object output examples while the awareness wrapper requires receipts; combat focus and punctuation permissions also conflict with the strict schema. Root cause is construction of a new contract around legacy content that includes a different wire contract. E-PC-02: Prior real sample completed8HTTP attempts but stopped on narration rejection at tick1; consciousA invalid JSON lacked selected-response shape metadata. E-PC-03: Owner explicitly authorizes implementation/test repair and public deployment followed by a new complete battle.

## Decision drivers

C-PC-01: One coherent output contract per new invocation, matching current strict output schema and exact committed speech. C-PC-02: Preserve historical frozen materials, old direct consumers and runtime-bound prompt identity. C-PC-03: Observe failure category without recording raw generated/private content. C-PC-04: Prove real public behavior with scoped release and postpromotion new-battle readback.

## Considered options

Append more instructions: contradictions remain. Relax schemas or invent receipt identity: violates accepted output boundary. Rewrite v2 globally: changes recorded prompt semantics. Narrow phase-rule/output-contract separation and new prompt-v3: selected.

## Decision

New battles bind awareness-prompt-v3. Latent/conscious v3 render the already repaired v2 instructions unchanged. For narration, phase builders expose typed content/output contract injection with default legacy behavior. New v3 frozen sources use phase content rules with exact speech preservation and no legacy single-object grammar. Final v3 dispatch has one complete receipts contract with phase identity and schema-valid examples; strict output remains awareness-output-v1. Old v1/v2 requests and already frozen material are retained without retroactive rewriting.

The usage snapshot JSON accepts backward-readable optional response diagnostics: selected finish reason, content length and empty predicate. New nonstream responses record these scalar values before JSON/domain parsing; raw content and chain-of-thought remain absent. No new SQL column is required. Completed HTTP usage and invalid logical output remain different states. Correct the stale provider-json fixture and test final phase-builder requests, not merely hand-written successful model responses.

## Consequences

Clear current narration grammar and test detection; diagnostics permit separating an empty/truncated output from schema rejection. Model obedience and battle completion are still unproven until measured. Old deliberately pinned prompts can retain their historical defects; no migration is authorized. Forward DB migrations needed by the wider already-authorized awareness feature remain subject to official release checks.

## Compatibility and migration

Extend accepted prompt revision enum with v3 and pass manifest revision into frozen-material construction. Default direct legacy helpers keep their old rules and bytes. Saved materials/old outputs are not normalized or rewritten. New optional diagnostics parse old snapshot JSON with unknown values. No body-action output, models, timeout/output caps, retries, prices, canonical rules or public API request change. Keep the separately held old V3 cutover trial contract unchanged.

## Verification

Legacy prompt hash/behavior continuity, new manifest/runtime v3 binding, all4phases plus combat-batch constructed prompt consistency, strict valid examples, rejection of focus and altered source speech, old/new snapshot readback and empty content diagnostics, focused tests plus scoped ordinary checks, official release preview/public readback, postdeploy new battle completion/narration/usage. Completion cannot be declared from local tests alone.

## Implementation references

A-PC-01 implements C-PC-01/02 from E-PC-01/03: phase/output contract module, narration freeze and wrapper revision handling, shared manifest revision and new-creation default. A-PC-02 implements C-PC-03 from E-PC-02/03: usage observation/repository and actual SDK extraction. A-PC-03 implements C-PC-04 from E-PC-03: scoped release artifacts and public new-battle observation. Detailed design: [repair/release design](../battle-awareness-prompt-repair-release-2026-10-05.md).
