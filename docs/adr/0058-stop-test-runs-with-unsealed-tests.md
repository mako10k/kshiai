# ADR-0058: 未Sealテストがあればテスト実行を停止する

- Status: Accepted
- Revision: 1
- Date: 2026-10-06
- Decision owner: Repository owner
- Authority: [同名.think](0058-stop-test-runs-with-unsealed-tests.think)、所有者指示「unsealed は、テストを通過させず止めること」
- Supersedes: [ADR0034](0034-seal-based-test-authority.md)の集約実行時の扱い。他のauthority条件は継承する。

## Context

E1: 所有者は未Sealテストによる成功扱いを停止するよう指示した。E2: 現行selectorは未登録のテストをunsealedとして除外し、activeだけの成功でexit0にできる。Seal参照の欠落はmissing_refとして同様に除外する。

## Decision drivers

C1: 未Sealテストを残した実行を成功扱いにしない。C2: Sealの根拠・履歴と既存の適格性条件を維持する。C3: 何が停止理由かを確認できる。

## Considered options

1. 除外して警告だけ出す: 所有者の指示を満たさない。
2. 未Sealをそのまま実行し権威ある合否へ混ぜる: 根拠の条件を失う。
3. 検出した時点でテスト実行前に失敗させる: 採用。

## Decision

未登録のunsealed、またはverification Sealが確認できないmissing_refが発見された場合、unit/e2eの公式selectorは終了コード1で停止する。activeテストが別に存在しても、一つもテストを実行しない。停止対象のパスと理由を出す。

`--list` は検査用なので一覧を返す。ゼロactiveの拒否と、既存のstale/source-diverged/missing-basis/provisionalの分類・扱いは維持する。この変更は全disabledを新たに失敗条件にする決定ではない。

## Consequences

### Positive

未Sealを除外した緑の実行結果を作れなくなる。

### Negative and risks

既存の未Sealテストが多いため、現在の公式テストは停止する。登録・根拠レビュー・Seal化は別の是正対象であり、機械的な一括Sealや例外除外で成功へ戻さない。

## Compatibility and migration

テスト、inventory、SealGraph履歴は削除・書換えしない。公式runnerの終了条件だけを変更する。直実行による診断結果は、従来どおり公式のSeal準拠検証合格とは区別する。

## Verification

activeとunsealedの混在、missing_ref、複数停止対象を拒否する回帰テスト。未Sealなしの通過、一覧生成、既存分類も確認する。実際の `npm test` と `npm run test:e2e-gui` のselectorが未Sealでexit1、テスト開始なしとなることを確認する。

## Implementation references

A1 implements C1/C3 from E1/E2: `scripts/test-authority.mjs` の実行前gate。`scripts/test-authority-empty.test.mjs` に回帰検証。再SealやCIの緑化は本変更の完了条件に含めない。

検証記録: unit selectorはactive36/provisional2/disabled208のうち未Seal191でexit1、TAP開始なし。e2e selector（`node scripts/test-authority.mjs --e2e`）はactive3/disabled1、未Seal1でexit1、Playwright開始なし。一覧モードはexit0。selector分類と実行gateの15件は直実行による診断として成功し、公式のSeal準拠テスト合格とは扱わない。

ADR0058のCLI auditはfatal/error/warning0。全体 `npm run adr:check` は既存ADR0039のAccepted acceptance marker不備でexit1。ADR0039は本変更では編集していないため、全ADR検査合格とは報告しない。
