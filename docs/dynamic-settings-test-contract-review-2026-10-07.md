# 顕在の動的出力と対話設定のテスト因果レビュー

2026-10-07。対象は shared conscious-dynamic 5件、backend llm conscious-dynamic 12件、dialogue-pipeline-settings 3件の計20件。元のファイル・case・assertionを変更しない。独立レビューは読み取りのみで実施し、根拠と範囲を主担当が照合した。

## 受理済みの根拠

- ADR0047の正本 .think の ACCEPTANCE、GENERATION_PLAN、DEPENDENCY_CLOSURE、NULL_COMPATIBILITY、LOW_LOAD_REPAIR、RESTART_AND_PROVIDER_BOUNDARIES。MDはAcceptedであり、詳細設計を採用する。設計冒頭の「実装を含まない」は作成段階の記述であり、後続の受理が対象の具体的設計を実装根拠とする。旧ADR0028の新規dynamic-v4応答・修復規則だけを置き換え、旧契約は保持する。
- 採用された docs/conscious-dynamic-output-design-2026-10-03.md §§2–7、10：phase別対象、初期目標の保持、省略/null/不正の区別、exact choice復元、payload非創作、依存閉包、対象限定の1回修復、独立した有効表現の保持。§8のCAS・再開永続予算全体はこのcohortでは未証明。
- ADR0018正本 D1：保存設定が通常の唯一の有効化根拠、行なしの場合だけlegacy既定値。D3の試合への不変receipt束縛は別検証。
- superseded ADR0028 MD D2の保持された設定契約：省略時は保存済み3を維持、それ以外write-2、明示3はcompact必須、明示2は既存mode許容、expectedRevision CAS。同文書を新しいAccepted起点にしない。ADR0047の歴史的継続と現行ADR0051による旧世代保持からのみ参照する。
- ADR0025の分離された状態・履歴・今回発話と、requirements F-BTL13/15/23の私的状態・発話独立性。現行ADR0051は旧世代保持を継承するが、これらのテストをawareness-v5のモデル品質証明にはしない。

## caseと証明範囲

shared 5件は、省略から目標を創作しない、既存目標・旧判断の保持、目標の置換拒否、省略と明示nullの由来、非null不正拒否、現在refs、laterの具体的行動、V2状態と旧V1デコード分離を直接検証する。全phase/根拠種別/数値境界の網羅ではない。

backend 12件は、現在phaseだけのplan/schema、exact skill復元、発話または沈黙の独立受理、直近の自己/相手履歴の位置、反復を本文比較で除外しない指示、発話限定修復、選択変更のintent/action組、自由行動内容の非創作、構文エラーの1回修復、transport errorの伝播、予約拒否、laterの要求、HTTP adapterへのstrict schemaの受渡し、空対象の呼出しなし、部分対象の依存閉包、固定payload保護を検証する。chat注入またはfetch mockでありネットワーク・実provider呼出しではない。予約callbackは永続化されたCAS/再開を証明しない。プロンプト文の存在は実モデルが反復を避ける証拠ではない。

settings 3件は一時SQLiteで、行なし既定値とsource、保存revisionとsource、stale更新拒否、保存済み3の省略維持、3/legacy拒否後の不変、明示2への更新を検証する。既定の履歴上限などの数値は既存実装の回帰であり新しい運用政策の採用ではない。同transactionの世代writerは実行経路に含まれるが、テストは世代内容を直接照合していないため世代束縛の完全受入を主張しない。Postgres、管理者HTTP認可、設定変更後の既存試合receipt、Stage override、公開環境は対象外。

## 型と結果

3ファイルのstrict TypeScript検査はexit0、隔離DB・fake callback/fetchのNode診断は20pass/0fail/0skip。raw wireのunknown recordとschema組立は構造検証・最後の閉じたdecoderを通すため、最終契約をcastする逃げ道ではない。HTTPテストのJSON.parseは既存のfixture検査であり、最終Battle/DTOへのcastを行わない。新しいany/type escapeを追加しない。コード・テストの変更、外部API、デプロイ、旧試合移行は行わない。

SealはAccepted契約→採用された設計と検証範囲→実際の受渡し実装→全ファイルのテストへ接続する。全体テストの未封印停止条件を維持し、全251ファイルを保存する。
