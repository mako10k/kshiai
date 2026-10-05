# ADR-0057: Awarenessの公開完走を実利用量で検証する

- Status: Accepted
- Date: 2026-10-05
- Decision owner: Repository owner
- Authority: 採用済み通常ポリシー、実利用トークンの記録、公開配備・新規試合完走の指示
- Related: ADR0051, ADR0054, ADR0056, PERT awareness-public-deploy / awareness-public-completion

## Context

E-PO-01: 所有者がawareness通常運用と公開完走・実token検証を指定した。E-PO-02: 既存E2Eの旧provider operation分類にawarenessの実呼出し名がなく、旧回数投影だけでは新パイプラインの実利用量を証明しない。

## Decision drivers

C-PO-01: 実際のSDK試行とtokenを確認する。C-PO-02: 既存の公開API/SSE、試行予算、stage/promotion、実況収束の検査を維持する。

## Considered options

旧予算の入力変更だけでは証拠不足。分類拒否や会計を無効にすると制御を弱める。新しい役割名を分類し、実利用台帳検証を追加する方法を採用する。

## Decision

provider operation taxonomyを改版し、awarenessの潜在・顕在・実況の実呼出し名を既存の対応する層へ追加する。未知の呼出し名は引き続き拒否する。既存層と保存された旧版履歴を維持する。

通常公開E2Eは、V5 manifestの束縛、通常policy、終端runtime、未解決物理試行なし、成功した実況公開、SDK実利用token台帳を追加検証する。既存の公開API/SSE、永続試験アカウント、previewとproduction identity、compact/persisted_settingの確認、promotionとrollbackの制御は維持する。

実行時の既存provider observation ceiling入力は200を指定する。これはnormal policyのphysical attempts上限200とは独立して検証する。旧169の既定値自体を正常物理試行数の意味へ読み替えない。36tickと24public advanceは異なる単位であり、今回の完走を36tick境界試験とは呼ばない。通常の束縛済み終端ルールで終了した試合を検証する。

## Consequences

新パイプラインの実呼出しを観測下で実行し利用量を確認できる。モデル出力・本番key束縛・旧E2E fixtureの整合は実測まで未確認。公開jobはAPIを呼ぶため、直接modelを呼ばない限りprovider keyをjobへ追加しない。

## Compatibility and migration

未知operation拒否を維持。旧ledger履歴は保持し現行runは現行taxonomyへ束縛する。モデル、retry、通常policy、正準ルール、公開DTOは変更しない。保留中stage-v3試行には適用しない。

## Verification

実builderのrole labelと分類の一致、未知名拒否、物理予算超過拒否、旧ledgerと新ledgerのidentity、token nullと失敗の区別、公開終了/narration/usage readbackを確認する。ローカルテストだけで公開完走を宣言しない。

## Implementation references

A-PO-01 → C-PO-01/02 → E-PO-01/02: provider-operation-taxonomyとpersistent E2E補足検証。判断監査: 同名.think。
