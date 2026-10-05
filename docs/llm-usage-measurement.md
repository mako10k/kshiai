# LLM実利用トークンと推定費用の確認

新規の試合束縛形式 v5は、意識パイプライン awareness-v5と実利用計測ポリシー awareness-v5-usage-v1を使います。事前料金証明は不要です。物理呼び出しごとのprovider/model、試合・役割・side・tick・receipt、開始/終了、request ID、入力/出力/合計/cache/reasoning token、usage原本をSQLiteまたはPostgreSQLのllm_usage_attemptsへ保存します。prompt本文・応答本文・APIキーは保存しません。

## 集計

リポジトリの通常のDB設定を使います。token計測だけなら価格表は不要です。

```sh
node --import tsx backend/src/scripts/llm-usage-cost-report.ts --battle btl_example
```

価格表を指定すると、同じ観測値から推定費用を算出します。

```sh
node --import tsx backend/src/scripts/llm-usage-cost-report.ts --battle btl_example --prices /absolute/path/prices.json
```

価格表の形式はrevisionとentriesです。各entryにはprovider、model、inputUsdPerMillion、cachedInputUsdPerMillion、outputUsdPerMillionを指定します。単位は100万tokenあたりUSDです。modelはreportに出る応答model名を使用し、応答model未取得の場合は要求model名になります。価格の出典・適用日をrevisionと一緒に管理してください。実単価はこの資料では設定していません。

## 読み方

- tokens：各分類のknownSubtotalとunknownCount。nullや未取得usageを0利用扱いにしません。
- groups：provider・model・role別の試行数、token、既知費用小計、未知費用件数。
- knownSubtotalUsd：計算できた費用部分のみ。complete=falseなら試合全体の総額ではありません。
- missingUsageCount / missingPriceCount / calculationImpossibleCount：実測不足、単価不足、矛盾したtoken分類の件数。

reasoning tokenはcompletion内の内訳として保持し、出力料金へ二重加算しません。cache内訳未取得でcache単価が異なる場合は入力料金が不明です。料金表がなければtoken計測は使えますが、費用は不明です。タイムアウト・失敗・repairも試行として残ります。観測原本を変更せず、価格表を変えて再計算できます。

0.50USDは現在、計測上の目安です。事前の最大課金証明なしに絶対上限とは保証しません。時間・出力token・物理attempt・同時数の上限は維持しています。実モデルの有料試行と配備は別途実施する作業です。
