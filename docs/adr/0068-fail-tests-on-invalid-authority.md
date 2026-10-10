# ADR-0068: 根拠不備のテストを除外した成功を禁止する

- Status: Accepted
- Revision: 1
- Date: 2026-10-10
- Decision owner: Repository owner
- Authority: [同名.think](0068-fail-tests-on-invalid-authority.think)、所有者指示「根拠が古いのは『失敗』になるように指示したはず」「修正をお願いします」
- Supersedes: [ADR-0058](0058-stop-test-runs-with-unsealed-tests.md)の集約実行時の停止範囲
- Related: [修正PERT](../test-authority-fail-closed.pert)、[統合意識 v1 検証記録](../unified-consciousness-implementation-v1.md)

## Context

所有者は根拠が古いテストを失敗として扱うよう明示した。現行selectorは未Seal・Seal欠落だけを停止条件とし、stale等を除外した残りの成功で終了コード0を返す。統合意識 v1 の検証では28ファイルを除外し、1,338件成功を全体検証完了として扱った。これは現在の所有者指示を満たさない。

## Decision drivers

- 根拠不備のテストを残した全体検証を成功にしない。
- テストの根拠と履歴を保持し、原因を明示する。
- 実行資格を回復する作業と、runnerの停止契約を修正する作業を分ける。

## Considered options

1. 警告付き除外を継続する。所有者指示に反する。
2. 根拠不備のテストを強制実行する。合否の根拠条件を失う。
3. 根拠不備を検出した時点で実行前に失敗する。採用。

## Decision

公式unit/e2e selectorは、発見したテストにdisabledが1件でもあれば、activeが存在していても一つも実行せず終了コード1で停止する。stale、source_diverged、missing_or_wrong_source_binding、missing_basis、unsealed、missing_refを含む。停止対象のパス・REF・理由をすべて表示する。未知のdisabled理由も成功へ通さない。未登録ファイルの早期拒否とゼロactive拒否は保持する。

分類自体は保持する。`--list` は診断一覧を終了コード0で返す（外部ツール不備等の検査失敗は従来どおり失敗）。provisionalは非公式証跡として除外する従来方針を保持し、今回の停止範囲はdisabledである。全体runnerとは別に、現在の根拠を個別確認した限定テストの診断結果は記録できるが、全体合格へ読み替えない。

既存28件を削除、除外設定、一括再Sealで緑にしない。統合意識 v1 の1,338件成功という過去の観測は残すが、全体検証完了の判断を撤回し、全体検証を未完了として計画へ戻す。

## Consequences

### Positive

根拠の古いテストを除外した緑の全体結果を防止できる。

### Negative and risks

既存のstaleが残る間は公式全体テストが失敗する。これは期待する停止であり、対象の個別レビュー・修正は別の未完了作業となる。

## Compatibility and migration

ゲームの保存契約・公開API・試合束縛形式 v5/v6には変更しない。変更するのはテスト実行可否と検証完了記録。旧ADRの判断理由とSeal履歴を保持する。

## Verification

activeとstaleの混在、他の根拠不備、複数不備、activeだけの通過を検証する。合成SealGraphを使った実selectorのunit/e2e試験で終了コード1・実行markerなし・TAP/Playwright開始なしを確認し、一覧は終了コード0を確認する。実リポジトリの `npm test` が既存staleで終了コード1となることを確認する。

## Implementation references

`scripts/test-authority.mjs`、`scripts/test-authority-empty.test.mjs`、[修正PERT](../test-authority-fail-closed.pert)。所有者の今回の明示指示により本revisionをAcceptedとして実装する。
