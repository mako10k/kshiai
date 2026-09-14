# Local Ollama 簡易チェック結果（2026-09-11）

## 結論

Local Ollama は、xAI用Providerを流用せずネイティブAdapterを介すことで、安価な事前の契約チェックに利用できる。
縮小した実通信ではHTTP 200、移行応答schema検証成功、要求した固定操作との完全一致を確認した。

ただし、これはAdapter・構造化出力・小入力の確認である。完全なV4移行、複数回修復の収束、
xAIとの品質同等性は確認していない。

## 確認した仕様差とAdapter

- xAI側は `response_format.json_schema`、Ollamaネイティブ側は `format` にJSON Schemaを置く。
- Ollamaは既定streamingなので `stream:false` を明示し、応答本文は `message.content` から読む。
- Ollamaのtoken計数は `prompt_eval_count` / `eval_count` から既存receiptへ変換する。
- xAIが循環参照を拒否するため使っていた任意JSON値の表現 `{additionalProperties:true}` は、
  Ollama 0.21.1のgrammar変換器では拒否された。Adapterで、その1定義だけを共有Zod契約由来の
  再帰JSON Schemaへ戻す。xAI用schemaや受信後の共有検証schemaは変更しない。
- endpoint・model・schemaが想定から変わった場合は送信前に停止し、1プロセス1要求、再試行なしとした。

## 3段階の実測

### v1: schema差の検出

- 結果: HTTP 500 `invalid JSON schema in format`
- モデル本文・token計数: なし
- 回収結果: Ollama 0.21.1タグの公式変換器で同じschemaを再現し、
  typelessな `{additionalProperties:true}` が拒否されることを特定した。
- 是正: Adapter境界でのみ再帰JSON Schemaへ復元。修正版は同じ変換器でgrammar化成功。

### v2: 完全V4初回入力は簡易チェックとして過大

- native要求: 143,952 bytes
- user入力: 123,062文字
- response schema: 5,915文字
- 結果: schema受理・CPUモデルload後、180秒でclient timeout。応答本文・token計数なし。
- 解釈上の限界: prompt token化、評価、grammar、出力生成の各時間は分離できないため、
  遅延の詳細原因は未確定。タイムアウト延長や同一要求の再送は行っていない。

### v3-contract: 縮小した実Adapter契約チェック

- native要求: 6,717 bytes
- model: `qwen2.5:3b`、CPU、temperature 0、context 4,096、最大出力512
- 結果: HTTP 200、`done_reason=stop`
- schema検証: 成功、検証issue 0
- 指示した固定操作との一致: 完全一致
- tokens: input 122、output 136、total 258
- elapsed: Adapter計測29,160 ms
- Ollama内訳: load約3.85秒、prompt evaluation約4.17秒、generation約15.92秒、total約29.09秒
- 費用推計: null（ローカル実行）

## 残る未知と利用境界

- 完全移行の意味品質、レビュー・限定修復の収束、xAI固有の応答傾向は未検証。
- 現在のLocal Ollamaは「Adapterの実通信」「完全な応答schemaの受理」「小さな固定例の構造化出力」
  までを簡易チェックとする。
- 完全V4入力をそのままLocal Ollamaへ渡す方式は、現在のCPU・3Bモデル・180秒枠では採用しない。
- xAIの有償検証を置き換えるものではなく、有償実行前に明白なtransport/schema破損を除く補助検査とする。

## 証拠

- `semantic-migration-ollama-2026-09-11-v1/`: 初回HTTP 500と送信schema
- `semantic-migration-ollama-2026-09-11-v2/`: 完全V4入力の送信前証拠とtimeout記録
- `semantic-migration-ollama-2026-09-11-v3-contract/`: HTTP応答、receipt、検証結果
- `semantic-migration-ollama-schema-rca-2026-09-11.think`: v1根本原因と是正判断
- `semantic-migration-ollama-contract-smoke-plan-2026-09-11.think`: 縮小判断と限界

