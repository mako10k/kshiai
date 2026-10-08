# Architecture Decision Records

This directory contains durable records of architectural and product-rule decisions. ADRs explain why a direction was selected; plans and PERT documents explain how and when it will be delivered.

## Authority

- ADR-0001 through ADR-0014 retain their historical Markdown authority until an
  accepted migration ADR says otherwise.
- ADR-0015 and later use a same-basename pair. The `.think` file is the
  authoritative causal and decision record; `.md` is its human-readable
  projection. Correct disagreements in favor of `.think`.
- From the owner's 2026-09-09 instruction, retain Sealgraph history for mechanical
  impact and stale review; see [Seal operations](../sealgraph-operations.md).
  Original documents remain authoritative. A Seal is not owner acceptance.
  Do not discard the retained baseline as an advisory cache. Historical
  disposable projections are not evidence of an existing retained Seal history.

## Lifecycle

1. For ADR-0015 and later, create a same-basename `.think` and Markdown pair at
   the next zero-padded number and a short kebab-case title. Earlier ADRs use the
   historical Markdown-only form.
2. Keep the ADR `Proposed` while alternatives or authority are unresolved.
3. Change it to `Accepted` only after the named owner explicitly approves the
   exact ADR and revision. Record that instruction as `OWNER_ACCEPTANCE` evidence
   and derive an `ACCEPTANCE` decision in `.think`; mirror the status in Markdown.
4. Audit a LLMTHINK DSL source directly before acceptance. A missing or
   incompatible advisory sealgraph does not alter the canonical workflow.
5. Link implementation commits and verification evidence without rewriting the
   original rationale.
6. Replace an accepted decision with a new ADR, then mark the old ADR
   `Superseded` and link both records.

## Historical checker exceptions

`npm run adr:check` explicitly excludes the unchanged ADR-0015, ADR-0016,
ADR-0017, and ADR-0019 source/projection pairs from **current** LLMTHINK DSL
and acceptance-marker checks. ADR-0015 through ADR-0017 are Accepted records
written before the current DSL and formal marker convention. ADR-0019 is a
historical Proposed record with legacy premise syntax. Their recorded statuses
remain as shown in the index; an exception is not a new acceptance decision.

The exception registry in `scripts/adr-historical-exceptions.mjs` pins both
files of each pair by SHA-256 and prints the exclusion reason during checking.
Pair existence and Markdown status syntax are still checked. Any change to a
pinned file invalidates its exception until that snapshot is reviewed and the
exception is removed or deliberately updated. All other ADRs receive the full
current check.

## Index

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-turn-initiative-and-simultaneous-resolution.md) | Accepted | Ordinary turns are sequential; equal initiative reuses prior order or performs one persisted draw |
| [0002](0002-separate-advance-and-narration-apis.md) | Accepted | Advance commits gameplay and creates an independent asynchronous narration job |
| [0003](0003-revision-editable-assets-and-bind-battles.md) | Accepted | Battles bind immutable revisions of every editable source asset |
| [0004](0004-versioned-lightweight-psyche-dynamics.md) | Superseded by 0027 | Historical lightweight psyche decision; dynamics and version safeguards retained by 0027 |
| [0005](0005-battle-scoped-ordered-narration-stream.md) | Superseded | Battle-scoped ordered narration stream with reconnectable delivery |
| [0006](0006-terminal-snapshot-narration-delivery.md) | Accepted | Terminal-snapshot narration delivery with durable phase receipts and fenced workers |
| [0007](0007-provider-operation-ledger-and-observation-ceilings.md) | Accepted | Durable physical provider-attempt accounting and observation ceilings |
| [0008](0008-battle-private-character-focus-state.md) | Accepted | Battle-private character focus state selected from perceived deltas and modulated by existing focus bands |
| [0009](0009-separate-adjudication-from-judgment-presentation.md) | Accepted | Adjudication commits mechanically; judgment presentation is a derived read model |
| [0010](0010-structured-selectable-asset-envelope.md) | Accepted | Selectable assets share one immutable envelope and persisted authoring attempts; pre-cutover unfinished-battle preservation only is superseded by 0039 D4 |
| [0011](0011-structured-character-definition.md) | Accepted | Character truth is a structured definition with derived audience projections |
| [0012](0012-structured-battlefield-definition.md) | Accepted | Battlefield presets, compiled instances, and live world state stay separate |
| [0013](0013-structured-narration-definition.md) | Accepted | Narration styles compile into phase-specific policy |
| [0014](0014-queue-asset-authoring.md) | Accepted | Queue asset authoring; accept on dedicated review screens |
| [0015](0015-e2e-operator-session-reentry.md) | Accepted | Operator re-enters the real E2E identity for GUI verification |
| [0016](0016-scene-beats-batched-narration.md) | Accepted | Scene beats batch narration and reserved action sequences |
| [0017](0017-public-turn-intra-turn-beats.md) | Accepted | Public clock is twelve turns; three beats sit inside each turn |
| [0018](0018-dialogue-context-activation-authority.md) | Accepted | Use the persisted dialogue setting as normal authority and bind immutable activation-source receipts |
| [0019](0019-observation-token-and-cost-admission.md) | Proposed | Bound paid observations by exact routes and conservative token/cost reservations before provider dispatch |
| [0020](0020-reposition-and-appropriate-range.md) | Accepted | Dedicated reposition action, appropriate range bands, and engine-first spacing correction |
| [0021](0021-engine-live-continuation-and-type-escapes.md) | Accepted | Engine-owned live continuation, closed contract types, and semantic non-clobber of fighter world |
| [0022](0022-canonical-world-and-observer-cognition.md) | Accepted | Unique world is viewpoint-free; two-person cognition is two frames; physical engine effects read only canonical state |
| [0023](0023-pair-channels-are-not-unique-cognition.md) | Accepted | pair.sight/sound are not unique cognition; LOS and projection read organ, exposure, and placement |
| [0024](0024-detach-authoring-from-read-traffic.md) | Accepted | Environment-global authoring queue with owner-scoped execution; draft reads have no execution side effects |
| [0025](0025-expression-state-and-utterance-actuals.md) | Accepted | Separate Compact expression state from completed utterance history, name the current output explicitly, and preserve exact repetition without a reuse classifier |
| [0026](0026-compact-psyche-semantic-closure-repair.md) | Accepted | Align the Compact psyche prompt and repair one rejected semantic closure without regenerating unrelated state |
| [0027](0027-unified-conscious-agency-and-psyche-boundary.md) | Accepted | Supersedes ADR-0004: reaction-only psyche, unified conscious action/speech judgment and separate engine adjudication; preserves dynamics and revision safeguards |
| [0028](0028-versioned-conscious-agency-contract.md) | Accepted | Revision 2 corrects goal criterion to personality/relationship fit regardless of authorship; withdraws provenance gates; bounded reaction and typed partial acceptance; no supersession |
| [0029](0029-preserve-v2-soft-guidance-compatibility.md) | Rejected | Historical proposal for permanent V2 conscious-only compatibility; replaced as direction by proposed ADR-0030 |
| [0030](0030-llm-assisted-character-semantic-migration.md) | Accepted | Migrate frozen V2 characters to strict V3 through bounded LLM semantic change sets, deterministic validation, owner review, and append/CAS |
| [0031](0031-focused-structured-semantic-authoring-kernel.md) | Superseded by 0032 | Thin typed authoring kernel retained by 0032 except for its elapsed-time semantics |
| [0032](0032-separate-authoring-time-boundaries.md) | Accepted | Separate provider, worker, semantic-progress and cumulative-resource time boundaries; exact values remain undecided |
| [0033](0033-runtime-config-not-run-identity.md) | Accepted | Keep provider transport and worker execution Config generations out of durable run identity; retain correctness-bearing fences, requests, accounting and outcomes |
| [0034](0034-seal-based-test-authority.md) | Superseded by 0058 | Require source-matched verification Seals with explicit current Causes for authoritative test evidence while preserving historical validity |
| [0035](0035-resolve-revision-scope-from-request.md) | Accepted | Resolve request-specific character revision scope from natural language before focused work |
| [0036](0036-propagate-draft-test-evidence.md) | Accepted | Treat test results backed by draft verification or Causes as draft evidence, not authoritative current pass/fail |
| [0037](0037-append-only-narration-fragments.md) | Rejected | Historical unaccepted Fragment proposal replaced by the broader 0038 candidate |
| [0038](0038-narration-fragment-commit-and-result-reveal.md) | Proposed | Reveal results after Fragment commit or confirmed Narration error; timebox old-history migration to 30 minutes |
| [0039](0039-v3-battle-lifecycle-and-cutover.md) | Accepted | Bind new V3-only battles; centralize lifecycle, separate insert/update, physically discard old unfinished battles with minimal ID receipts |
| [0040](0040-shared-cutover-runtime-control.md) | Accepted | Keep exact release revision through durable cutover control; bounded owner trial and forward recovery after first V3 creation |
| [0041](0041-cutover-snapshot-protection.md) | Accepted | Protect shared-cutover snapshots with owner public-key encryption, dedicated Tokyo GCS, 30-day minimum retention and 7-day soft delete |

| [0042](0042-unreleased-v3-trial-scope.md) | Accepted | Use an ordinary authenticated preview for the unreleased first V3 trial; defer legacy compatibility, email, snapshot and public promotion |

- [0043: V3 character updates with historical V2 display](0043-v3-character-updates-with-historical-v2-display.md) — Accepted; ordinary V3 writes, retained V2 read and migration source.
- [0044: Discriminated action intent contracts](0044-discriminated-action-intent-contracts.md) — Superseded by 0045; retain the withdrawn fallback sketch as history.
- [0045: Preserve action intent producer values](0045-preserve-action-intent-producer-values.md) — Accepted; structural action contracts and value-preserving projections, without synthetic fallback judgment.

- [ADR-0046: 既存の条件付き契約を型と実行時で一致させる](0046-align-conditional-contracts.md) — Accepted

- [ADR-0050: 顕在度に応じた自然文コンテキストと非同期キャラ意識パイプライン](0050-asynchronous-awareness-projected-character-pipeline.md) — Superseded by ADR0051; 意識パイプライン awareness-v5の状態・合流契約を後継ADRが継承。

- [ADR0051: Observed LLM usage accounting and explicit version labels](0051-observed-llm-usage-accounting.md) — Accepted; inherits ADR0050 pipeline and replaces mandatory pricing proof for new usage-measured policy.

- [ADR0052: Isolated long-timeout awareness measurement](0052-isolated-long-timeout-measurement.md) — Accepted; explicit internal measurement policy with longer coherent deadlines, ordinary policies unchanged.
- [ADR-0053: Explicit action output guidance and physical response evidence](0053-awareness-response-completion-repair.md) — Superseded by ADR0056
- [ADR-0054: Adequate waiting deadlines for new awareness battles](0054-normal-awareness-waiting-deadlines.md) — Accepted

- [0055: Consistent awareness narration contracts and diagnostics](0055-consistent-awareness-narration-contract.md) — Superseded by ADR0056.

- [ADR-0056: 正常完走の確認まで出力契約を最新版で実行する](0056-latest-prompt-contract-until-completion.md) — Accepted

- [ADR-0057: Awarenessの公開完走を実利用量で検証する](0057-awareness-public-observation-accounting.md) — Accepted

- [ADR-0058: 未Sealテストがあればテスト実行を停止する](0058-stop-test-runs-with-unsealed-tests.md) — Accepted

- [ADR-0059: キャラ作成・修正の最終候補を完全に接続する](0059-complete-focused-character-review-payload.md) — Accepted; revision1、公開プロフィールの同一run内完結、create/revise最大10回、採用前の修正は不変な新attempt。

- [ADR-0060: 所有者判断によるテスト契約回復](0060-owner-test-contract-recovery.md) — Accepted; 未決STA量/penalty種類は別検討。

- [ADR-0061: 改善分析の利用条件](0061-manual-improvement-analysis-eligibility.md) — Accepted; 初回5終了試合、以後成功分析snapshot+10。
