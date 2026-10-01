# vt104 複雑度適正化の設計・検証境界

権限: 所有者の2026-10-01「複雑度を適正化」。現行静的検査基準を維持し、既存の外部動作を保持する内部整理。基準変更候補v1は未採用。

要件: config/lizard-baseline.jsonのCC121/92/1369、関数長67/733/7390、引数5/11/10を維持する。認証、immutable generation/battle binding、公開DTOの非公開情報除去、lease/transaction、provider会計、既存エラー・処理順序のAccepted契約を変えない。

基本設計: 公開戦闘データ生成を専用projectionへ分離する。切替HTTP受付は認証/要求識別/許可取得/完了記録を区分する。ナレーションは取得/claim/生成と会計/結果公開を区分する。既存repositoriesは同じtransaction内で状態別責任をローカルhelperへ分ける。fixtureは同一シリアライズ方式を共通化する。

詳細設計: callerのawait順、DB connection、SQLの順、fence、provider呼出し数、readback、例外の伝播を保持する。型のついた狭い入力を用い、6を超える位置引数を増やさない。新規公開API、保存形式、機能フラグは追加しない。

レビュー対象: 現行基準への適合と整理前後の動作同一性（INSIDE）。実環境のデプロイ/Google認証/対戦証拠は既存の後続vt105以降（OUTSIDE）。本整理の成功を試用環境準備完了と扱わない。

検証: pinned Lizard1.23.0、重複検査、全workspace型検査、既存のauthority選択テスト、変更処理に関する直接テスト。fixtureの生成JSONは変更前後のバイト一致を照合する。追加テストはprovider会計境界など、意味のある失敗シナリオに限る。authorityで選択されないテストの直接実行結果は別記し、既存失敗と変更起因を比較する。
