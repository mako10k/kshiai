# Foundation revision 3 — snapshot and self-review

- Date: 2026-09-11
- Stage: Step 1 completed; Step 2 owner route pending. No independent review or acceptance.
- English: docs/structured-semantic-authoring-foundation-requirements-v3.md
- English SHA-256: b5693f6d47e975ea1cb78adaa686185630db5ffc6d52c74f3481ac77511c99da
- Complete Japanese review translation: docs/evidence/structured-semantic-authoring-foundation-requirements-v3-owner-review-ja.md
- Japanese SHA-256: 8a26cb27584283dc6c829a837076459679a7e3988e1d383bdd3b0a0bfe4ad7ee
- Reasoning: docs/evidence/structured-semantic-authoring-foundation-requirements-v3.think
- CLI LLMThink audit: fatal 0, error 0, warning 0. Advisory shared-evidence hints checked: D1 sets the safeguard contract, D2 bounds its operation, D3 limits delivery authority; they do not conflict. Formatting hints are nonblocking.
- Baseline: accepted foundation v2 acceptance record; v2 English remains unchanged.
- Pending character v4 remains unchanged and references v2, not this candidate.
- Changes: F2 domain progress contract, F9 hard-stop precedence, F15 mechanical safeguards, conformance 10-15, AC20-23, alternatives/risks and dependency disposition.
- Unchanged F1/F3-F8/F10-F14 compared byte-for-byte against v2; EN/JA each contain F1-F15.
- Translation correction: Japanese F11 now states the English prohibition on sending the whole candidate/schema, instead of the former weaker wording that it is unnecessary. English F11 is unchanged.
- Unknowns: numeric budgets, windows, phase rules, detector algorithms, detailed usage/cancellation policy. These require successor design, not unlimited runtime.
- Self-review: protected-meaning policy, source-based retry without mandatory checkpoints, migration-only preservation access, exceptional semantic Q&A, existing ceilings, and external compatibility are retained.
- Scope: requirements, translation, reasoning and DRAFT Seal evidence only; no application code changes, provider calls, tests of runtime safeguards, or acceptance.
- Proposed review questions are in the English candidate and fully translated in the Japanese projection. Owner route pending; REVIEW would request independent review followed by Step 4.

## 日本語の検証概要

要件候補revision 3のセルフレビューとCLI監査を完了した。独立レビューと受理は未実施。
変更対象はF2・F9・新設F15と、その適合ケース・受入基準・代案・リスク・依存先説明である。
それ以外の12個のF節は正本v2と同一である。英語・日本語ともF1〜F15を備える。
日本語F11は、正本で変わっていない「全体candidate・schemaをLLMに送らない」という禁止に
訳を合わせた。受理済み基盤v2と未受理のキャラクタv4は変更していない。
具体上限値などは後継設計で決定する。今回は要件資料の作成であり、実装や実LLM検証の完了ではない。
