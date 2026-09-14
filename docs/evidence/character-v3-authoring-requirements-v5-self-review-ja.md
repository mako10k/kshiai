# キャラクタ要件revision 5 — セルフレビューと固定入力

- 日付: 2026-09-11
- 状態: Step 1完了。Step 2のオーナールート待ち。独立レビュー・受理は未実施。
- 正本: docs/character-v3-authoring-requirements-v5.md
- SHA-256: 17596f17d6514d5ada160b9d95453ab2bcb9cee9e4b2d2991acb8238b55ee27b
- 日本語全文訳: docs/evidence/character-v3-authoring-requirements-v5-owner-review-ja.md
- 日本語SHA-256: d89b730907b118012a6510f2ea700f6c44f5f10d0b7378b47b22cc358ceec544
- 比較元: 未受理キャラクタrevision 4（変更なし）
- 固定依存先: 受理済み共通基盤revision 3とそのacceptance記録

## 検証結果

R1–R9、R11–R14、R16–R18、R20の17条項と3mode完成条件は、正本v4との本文一致を確認。
英語・日本語ともR1–R21を含む。
変更は依存先、R10/R15の機械的停止との関係、R19の停止条件、新設R21、関連受入基準・
レビュー論点・過去候補対応である。V3項目の意味と潜在意識・顕在意識・エンジン責務は変えない。

CLI LLMThinkによる候補推論監査はfatal/error/warning 0。
実装・実LLM成功率・検出精度の検証は行っていない。

## オーナー確認の論点

キャラクタ固有の進捗意味だけをAdapterが提供し、資源上限・検出・停止は共通基盤が強制する。
正当な一時後退を許容し、通常の不足は生成する。固定の数値上限や検出方式は今回選ばない。
基盤参照だけの変更は小さいが、進捗契約と意味的block規則が暗黙になるため、
新設R21等で明示した。誤検出と見逃しは後継の代表テスト・評価で扱う。

候補全文と独立レビュー質問は英語正本および日本語全文訳に記載。
REVIEWは固定本文の独立レビュー後Step 4へ、REVISEは新revision作成へ進む。
基盤revision 3は受理済み依存先であり、今回再承認しない。
キャラクタ要件と必要な後継ADRの受理前に実装へ進まない。

## 作業位置と保持

既存linked worktree compact-psyche-repair-integration-kshiai、
branch codex/compact-psyche-repair-integration、HEAD 77e448cを継続。
既存WIPを保持し、新しいbranchは作成していない。
ローカル参照origin/mainは1cdf210でahead25。今回リモート更新・同期は実施しておらず、
これを最新リモート状態とは主張しない。
