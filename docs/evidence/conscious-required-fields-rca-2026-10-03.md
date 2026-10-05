# 必須フィールド欠落の詳細解析

2026-10-03。ユーザー指定の LLMTHINK による分析。実装・本番設定・保存試合は変更せず、追加のモデル呼び出しも行っていない。

推論正本: [LLMTHINK RCA](../conscious-required-fields-rca-2026-10-03.think)。検証結果: [オフライン再検証](conscious-required-fields-replay-2026-10-03.json)。対象試合と全体の状況は [最新試合調査](latest-match-monotony-analysis-2026-10-03.md)。

## 結論

直接の原因は、モデルの応答に通常ターン必須のフィールドがなく、既存目標があっても必須の `initialGoal: null` を確認できず、意図と行動の受理が止まること。構造上の原因は、呼び出し境界が JSON としての成立しか強制せず、欠落後のアプリケーション修復も行わないこと。

モデルが欠落させた理由の有力な仮説は、共通プロンプトに混在するフェーズ規則の取り違え。ただし、生のHTTP応答と厳密な当時の送信本文はこの調査資料にはなく、モデル内部の原因を断定しない。

## 欠落は単独フィールドではない

ネヴァの通常ターン2・4・6・7・8・9・11・13・14・15・16で、毎回同じ3項目がまとめて欠落する。

| フィールド | 保存されたデコード結果 | 通常ターンでの契約 |
| --- | --- | --- |
| initialGoal | missing | 既存目標がある場合も明示的な null が必要 |
| intent | 有効 | 根拠参照付きの意図 |
| nextAction | 有効 | 行動提案。利用可能性は別途検証 |
| nextUtterance | missing | 発言しない場合も明示的な null |
| realizedManifestation | missing | 発現しない場合も明示的な null |

保存入力の phase は全11件で turn。既存の upperGoal も全件にある。初期化に失敗して目標自体がないという問題ではない。マコト側の17件に同じ欠落パターンはない。

共通プロンプトには通常・後日談・後続判断の規則が併記されている。

| フェーズ | 要求する出力 |
| --- | --- |
| prologue / turn | initialGoal, intent, nextAction, nextUtterance, realizedManifestation |
| later | intent, nextAction |
| aftermath | nextUtterance, realizedManifestation |

欠落応答は later の形と一致する。ただし、既存目標や無発言に対応する null の項目をモデルがまとめて省略した可能性もあり、フェーズ混同と区別するには比較検証が必要。

## 入力から棄却までの経路

1. `consciousRequest` は phase と agencyState を保持してモデル入力を構成する。現行ソース上、turn を later に書き換える処理はない。
2. `advanceCharacterAgent` は共通 `CONSCIOUS_V3_PROMPT` を使用し、通常ターンでも later / aftermath の出力規則を含める。
3. `chatJson` のオプションに responseFormat が指定されておらず、外部APIには `response_format: {type: "json_object"}` を渡す。この形式は必要なキーの存在を強制するスキーマではない。
4. JSONパースが成立すればプロバイダー呼び出しは成功扱いとなる。`consciousResult` はフィールド欠落を例外ではなく、型付きの missing として返す。
5. `acceptConsciousDecisionV3` は、通常ターンで initialGoal が有効かを先に検証する。キー欠落は null と区別され、goal_invalid で意図・行動を棄却する。既存目標を置換しない契約は維持される。
6. 通常V3の呼び出しには、この欠落をモデルに通知して再生成する処理がない。HTTPリトライの対象にもならない。
7. battle-service はこの失敗を schema_invalid に上書きするため、具体的な欠落理由が進行側の診断に残りにくい。

関連箇所: `backend/src/llm/conscious-agency.ts` の consciousRequest / CONSCIOUS_V3_PROMPT、`backend/src/llm/openai-compatible.ts` の advanceCharacterAgent / chatJson、`packages/shared/src/conscious-agency.ts` の field / decodeConsciousOutputV3 / acceptConsciousDecisionV3、`backend/src/services/battle-service.ts` の agencyAcceptance 処理。

## 欠落が行動を止めていることの切り分け

保存入力とデコード出力を純粋な受理関数に渡し、11件すべてで goal_invalid を再現した。次に検証用コピーだけで initialGoal を明示的な null に変更した。

- 10件: 意図・行動が採用される。すべて wait。
- ターン2: goal_invalid は解消するが、利用不能な instrumentRef により action_invalid が残る。

行動の利用可能性は前段の保存入力再検証で得た結果を用いた固定入力であり、変更後に進んだ仮想試合をシミュレーションしたものではない。発言と発現の欠落は補っていない。業務実装として欠落を null に変換する改修案ではなく、どの受理条件が判断を止めたかを分離するための反実仮想検証である。

この結果から、必須フィールド欠落は行動棄却の直接原因だが、それだけを解消しても待機選択の反復は残ることが分かる。発言の欠落を無発言というモデルの意思に読み替えることもできない。

## 改修候補と検証条件

まず、現在のフェーズだけを指示するプロンプトと、必須キーを強制するプロバイダー出力スキーマを組み合わせる。既存の型を強化するだけでは、外部のJSONに必須キーを生成させることはできない。APIへ実際に送る出力契約と、生成後の業務検証の両方が必要。

構造が整っても、根拠参照・利用可能行動・目標の不変性は別途検証する。モデルが返した値を連携し、目標・意図・発言を固定文字列で作らない。欠落理由を保持する。

再生成を導入する場合は、回数上限、同じ凍結入力の使用、呼び出し記録、失敗時の扱い、すでに採用した発言との関係を決める必要がある。これは今回実装しておらず、設計変更は対応するADRを先に整える。

検証ではフェーズ別の送信スキーマ、欠落と明示的nullの区別、目標置換の拒否、独立した発言受理を確認する。実モデルで比較する場合は欠落率に加え、判断採用率・待機の割合・台詞反復・費用と時間も測る。フィールドが揃うことと、試合の質が改善することは別の完了条件である。
