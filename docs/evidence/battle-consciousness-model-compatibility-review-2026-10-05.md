# Luna/Grok互換性準備の検証記録

対象は所有者指定のモデル配分と、既存Chat Completions adapterの互換性準備。ADR0050全体の受入、新pipeline接続、実モデル品質と費用の評価は後続フェーズ。

## 完了した準備

潜在openai/gpt-6-luna/none、顕在・裁定・実況GrokをADR0050 revision4 D11と詳細設計へ記録。既存configured fast/engineを保持し、新Grok番号を選択しない。SDKを6.49.0へ固定し、native none型を使う。4送信経路で共通optionを使用し、任意の生成token上限を検証する。Lunaのtemperature省略、通常/streamの指定JSON schema保持、既存toolのJSON object形式保持を実SDK wireで検査した。2つのtool送信methodをprotectedにし、型付きsubclassで検証する。既存モデル選択・fallback・心理no-call・試合schemaを変更していない。

独立reviewerの2指摘（SDK最新版のNode22要件、tool経路未検査）を修正し、同じ2件に限定した再確認で残存指摘なし。SDK6.49.0の同梱READMEはNode20 LTS以降対応を記載。実行検証はNode22.22.3/25.1.0で行い、Node20実行そのものは未検証。

## 検証結果

- 全workspacesとdeploymentのtypecheck成功。
- 通常/stream/character-tools/history-toolsのSDK wireとmodel option検査：7件成功。
- 既存adapter群とschema alias修復を含む直接実行：59件成功、Node22.22.3。新規テストはまだunsealedであり、受入済み検証と偽装しない。
- npm test：現在のauthority選択に従う165件、別実行19件、29件、計213件成功。39 active / 2 provisional / 157 disabled filesという選択境界であり、全repositoryの全テストが実行されたという主張ではない。
- 最初のNode25全体実行は既存SQLite native moduleのロードで失敗。既存Node22でSQLiteロードを確認して再実行した。native binaryの再生成やDB変更はしない。
- SDK6では旧自己参照alias不具合が発生せず、既存テストの「SDK出力が例外になる」期待が失敗した。修復を検証する明示的な旧alias fixtureへ置換し、生成した現行schemaがvalidatorを通ることも検査。修復sourceは変更していない。
- 準備DSL監査：fatal0/error0/warning0/info1/hint13。ADR0050の個別pair checker成功、status Proposed。git diff --check成功。
- 有料providerへ通信していない。実モデル応答、アカウント利用可否、日本語品質、latency、請求額は未検証。

## 計画と次の境界

正準子PERT model-compatibilityを開始/完了イベントで記録しdone。document check、両scheduleのdag analyze、dag next成功。status-only finishの最初のpreviewはPTACT105で書込みなし、観測した完了時刻を指定したpreview/applyで解消。旧hours単位等の警告を保持。

observe-velocityを再実行したが、コミット済みtask baselineと独立active time/effortがなく利用不可。経過からeffortを推測せず、velocityを変更していない。次checkpointは2026-10-05の後続詳細設計開始時で、コミット済みbaselineの有無と計測手段を確認する。

この互換性準備の残りは0。プレイヤーが新pipelineを利用できる価値はまだ0で、今回の成果は型と送信形式を確認したadapter準備。次はADR0050の残る顕在度・競合・遅延・有限失敗契約を確定し、役割別接続の詳細設計へ進む。詳細設計の内部工数は暫定2–4時間、低信頼度（型/状態遷移1–2時間、契約/検証1–2時間）。新pipeline実装・有料試合・配備の工数や日付をこの範囲に含めない。
