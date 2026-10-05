# Luna/Grok互換性準備：要件と詳細設計 v1

> 後継の所有者指示：[ADR0051](adr/0051-observed-llm-usage-accounting.md)が意識パイプライン awareness-v5を継承し、新規試合の会計を実利用計測へ変更。事前料金証明は必須ではなく、未知のusage・料金は不明として記録する。[詳細設計](battle-consciousness-usage-measurement-2026-10-05.md)。下記の料金証明必須記述は旧方針の履歴。旧切替試行の契約改訂は保留。

2026-10-05。所有者指示：「互換性の準備を進めましょう。GPT-6 Luna noneを潜在側、顕在・裁定・実況をGrokに」。このモデル配分は所有者決定。ADR0050の時間・状態・失敗等を含む全revision受入には拡張しない。

## 準備の完了条件

既存OpenAI-compatible transportでLunaのreasoning noneを型の逃げなしに設定でき、通常/stream/tool経路でwire JSONが一致する。既存Grokのnoneと他modelの指定省略を維持する。出力token上限を明示できる。現在の戦闘のモデル選択・role dispatch・fallback・状態schema・終了規則を変更しない。後続パイプラインへ渡す役割配分を具体的に記録する。

| 将来の役割 | provider/model契約 | reasoning |
|---|---|---|
| 潜在（反射・感情・投影を含む） | openai / gpt-6-luna | noneを毎physical requestへ明示 |
| 顕在 | xai / 試合開始時に選定済みのGrok fast/engine revision | そのGrokで受入済みの設定 |
| 意味的裁定 | xai / 現在のconfigured engine Grok（コードdefault grok-4.5） | 現行設定を維持 |
| 実況 | xai / 現在のconfigured fast Grok（コードdefault grok-4.3） | grok-4.3の場合noneを維持 |

所有者はGrokの新しい番号を指定していないため、grok-4.7等へ無断更新しない。defaultと実配備の有効modelは区別する。顕在にどのGrok tierを割り当てるかは実行時の既存設定との対応を確定する必要がある。上表を単一global fallback順として実装しない。

## 基本責務と詳細契約

`model-request-options.ts`はprovider/modelに合うChat Completionsの機械的request optionだけを選ぶ。役割の意味、感情、prompt、モデルの品質判定、retry、routingは担当しない。

既存`openai-compatible.ts`は4つの送信経路（通常JSON、stream JSON、tool JSON、履歴tool JSON）で共通optionを使う。openai/gpt-6-lunaとxai/grok-4.3のみreasoning noneを明示し、その他は既存どおり省略する。Lunaへtemperatureは送らない準備とし、provider固有の可否未確認値を送信しない。Grokその他のtemperatureは従来のsupportsTemperature設定を維持する。

ChatOptsに任意の`maxCompletionTokens`を追加する。指定された場合のみ正の整数を検証して`max_completion_tokens`へ渡す。既存呼出しへ未受入の600等の上限を自動追加しない。将来の潜在callerは受入済み上限を必ず渡す。上限の指定なしを互換性テストで予算制御済みとは評価しない。

SDK v5はReasoningEffort型にnoneを含まないため、SDK6.49.0へ更新する。この版はnoneの型を備え、同梱READMEでNode.js 20 LTS以降のサポートを示している。最新版7.28.0はNode.js 22以降を要求し、既存ZodEffectsのschema変換にも変更があるため、今回の準備では採用しない。noneをSDK型へ偽装する既存adapterのcastを取り除く。SDK6が解消した旧自己参照aliasについては、SDKが不具合を出すことを期待するテストを、明示的な旧alias fixtureでの修復検証に改める。SDK既定retryは0、既存provider会計・deadline・application retryを維持する。SDK更新で型/API差が判明すれば、現在の呼出し契約を保った狭い修正とテストを行う。

## 検証と情報境界

テストはglobal fetchをtest-only transportへ置き換え、SDKが作るJSON bodyを観測する。架空keyを使い、外部providerへ通信しない。通常/stream/2種toolでLuna none、token上限、temperature省略、通常/streamのJSON schema指定、toolの既存JSON object指定とcontent維持を検査し、Grok none、他modelへの非適用も検査する。型検査と全体testを実施する。これらはreal-modelの応答、Japanese品質、遅延、料金やaccount accessを証明しない。

## 後続の接続

新pipelineの役割routerはsubconscious/conscious/adjudication/narrationの閉じたroleを使う。provider未設定時に別role/modelへ黙ってfallbackしない。試合のsemantic pipeline/assetと、実attemptのmodel/transport configをADR0033に従い分ける。roleごとのoutput schema、自然文projector、物理attempt予約、deadline、fail outcomeを受入済み契約から渡す。旧advanceCharacterPsycheを新潜在出力の代用にせず、現在の心理no-callを無断変更しない。

今回の準備で新潜在worker、role router activation、DB/API schema変更、paid試合、配備は行わない。実接続はADR0050の残るQ契約を確定した後に行う。

参照：[GPT-6 Luna公式](https://developers.openai.com/api/docs/models/gpt-6-luna)、[SDK公式](https://developers.openai.com/api/docs/libraries)、[ADR0050](adr/0050-asynchronous-awareness-projected-character-pipeline.md)、PERT `model-compatibility` → `COMPATIBILITY_READY`。

準備の検証結果：[互換性検証記録](evidence/battle-consciousness-model-compatibility-review-2026-10-05.md)。準備taskは完了、実接続は未実施。
