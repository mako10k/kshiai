# cs316 実装・テストの由来照合 — 2026-09-18

状態: 局所照合済み。cs316 全体、cc304、V2→V3 移行は未完了。

## 対象と判断

現行の設計 `design/structured-semantic-authoring-kernel-v1-current` と Accepted ADR-0032／0035、キャラ要件 v5 に対し、前回の timeout・deferral 修正に接する実装と4つのテストファイルを照合した。実装・テスト本文、DB、provider、実行経路は変更していない。SealGraph は本文の同一性と申告した由来を記録するもので、意味的な適合や製品受入そのものを証明しない。

個別の読み取り専用 Luna レビューを受け、現在の source に新しい目的の Seal を付けた。旧 REF は当時の目的の履歴として保持し、inventory の現行参照だけを切り替えた。

| 現行対象 | 新 REF と状態 | 根拠・限界 |
| --- | --- | --- |
| SQLite schema (`backend/src/db.ts`) | `implementation/authoring-timeout-sqlite-schema-20260917`、非draft | 現行設計、ADR-0032 の timeout、ADR-0035 の `resolved_source_json`。DB適用の記録ではない |
| PostgreSQL migration 0028 | `implementation/authoring-timeout-postgres-migration-20260918`、非draft | 現行設計と ADR-0032。migration は未適用 |
| scripted provider ports | `implementation/authoring-timeout-scripted-ports-20260918`、非draft | 現行設計と ADR-0032。テスト用 port であり実 provider の証拠ではない |
| character adapter | `implementation/character-unregistered-deferral-rejection-20260918`、draft | 現行設計とキャラ要件 v5。未登録 deferral の拒否に限る。正当な typed deferral の登録・処理は未完了 |
| family / battlefield / narration conformance adapters | それぞれ `implementation/semantic-authoring-{family,battlefield,narration}-conformance-test-adapter-20260918`、draft | 現行設計 §10 のテスト専用実装。各 family の runtime activation や製品受入ではない |
| public mapping | `implementation/semantic-authoring-public-mapping-current-provisional-20260918`、draft | 現行設計 §8–9 の投影と owner command mapping。認証済み route 統合は未確認 |

新しい検証 REF は、`backend/src/repositories/semantic-authoring.test.ts` → `verification/semantic-authoring-durable-repository-20260918`、`backend/src/services/semantic-authoring/scripted-ports.test.ts` → `verification/semantic-authoring-scripted-port-boundary-20260918` が非draft。両者は現行の source-bound 実装 Cause を持つ。一方、`character-v3.test.ts` → `verification/character-v3-adapter-current-provisional-20260918`、`conformance.test.ts` → `verification/semantic-authoring-conformance-current-provisional-20260918` は、対応実装の draft を引き継いだ draft。後者の対象は F1–F15 と非同期 timeout の zero-recovery 一例で、設計 §10 の全 timeout matrix を満たしたとは主張しない。passing result で draft を昇格させていない。

## Readback と検証

- 4つの test source について、inventory の新 REF は `active` 2件、`provisional` 2件。どれも `stale`／`source_diverged` 判定ではない。repository-wide selector は discovered 156、active 7、provisional 3、disabled 146。これは全テストの有効化率や製品進捗ではない。
- 4ファイルの直接実行は43件成功。ただし draft 2ファイルの直接実行は暫定観測で、`npm test` の正式選別には加わらない。
- `npm test` と `npm run typecheck` は exit 0。SealGraph `fsck` は `ok`、unreferenced blob 1。`fsck` は保存整合性のみを示す。
- 新 REF はそれぞれ source/candidate compare 後に公開し、旧 REF を消去・再解釈していない。SQLite candidate には ADR-0035 の正確な Cause を追加してから公開した。

## テスト選別器の目的分離（追加）

旧 `verification/test-authority-selector-v2` は、現行 inventory の対応関係まで検証したように読める Cause を持つが、実際の `scripts/test-authority.test.mjs` は合成データで選別ロジックを検証し、実 inventory を読み込まない。旧 REF は元の根拠での履歴として保持した。個別 Luna レビュー後、同じ source に対して新目的の `verification/test-authority-selector-synthetic-20260918`（非draft、Seal `50cbccd5…`）を公開し、主張を合成データ上の分類・集計に限定した。Cause は現行選別器実装と Accepted ADR-0036 であり、inventory は Cause に含めていない。

inventory の対応先は、この新 REF と上記4つの新検証 REF、計5件を変更した。`implementation/test-authority-inventory-v2` は個別 Luna レビュー後に現行本文を `a0d8743a…` として再 Seal し、source 一致を確認した。inventory 自体の直接 Cause は Accepted ADR-0034。選別器9テストは成功し、選別readbackは156件中 active 7、provisional 3、disabled 146。これは実 inventory の全対応関係をテストで検証した結果ではなく、現行対応表の直接readbackと合成テストの証拠を分けて扱う。

## 残るゲート

cs316 の全 REF 分類と意味照合は未完了。キャラの正当な typed deferral と conformance timeout matrix、他の未照合実装・テスト、ADR-0007 root の本人レビューは別に残る。cc304 は suspended のまま。利用者が V2 キャラを V3 で試せる状態になったという証拠はない。今回の増分は、移行に向かう検証のうち4ファイルの現行根拠状態を正直に選別できることに限る。
