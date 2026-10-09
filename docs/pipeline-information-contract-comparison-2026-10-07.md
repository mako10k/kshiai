# 意識パイプラインの情報伝達契約照合（2026-10-07）

## 対象と結論

対象は既存awareness-v5の情報伝達と検出条件。要求・基本設計・投影・接続先型・実送信・検証・受入を照合する。新しい動機ラベルの実装、公開配備、料金を伴う試験、全テストの再Sealは対象外。作業基点はd7fe6df、未コミットの前日変更を保持する。

適用中の顕在指針について、生成された情報を新しい接続が明示転送しない箇所がある。入力の型と試験資料はその受領を要求しない。この組合せが、欠落を構造検査と既存の局所テストが検出できない条件である。試合の単調化の根本原因を確定したものではない。

## 上流と下流の比較

| 情報 | 上流の義務・境界 | 現在の投影・接続・送信 | 検出条件と判定 |
| --- | --- | --- | --- |
| 現在条件に適用される顕在指針 | 要件U08の顕在度に応じた注入、基本設計§6の関連する価値観。V4 compilerは動的適用をruntime consumerへ委ねる | compilerはstatic actionPrinciplesを空にしconsciousGuidanceを別保持。decision生成はライブ条件で投影してWeakMap metadataへ保持。旧later-bucketは取り出すがawareness frameはavailableActions/facts/acceptsのみ。contextはstatic consciousSelfを読む | ConsciousInputのcharacteristicsは空配列も適法。contextテストのconsciousGuidanceも空。適用指針の元資料→実promptの非空通過を要求しておらず、明示転送欠落を検出できない |
| 自覚可能な動機 | 基本設計§6の関連する性格・価値観。低顕在度の隠れた原因を顕在へ直送しない | coreNeedsはpsycheTraitsに保持されるがconsciousSelf投影には独立項目がない。背景・傾向の文面に同じ意味が含まれる可能性はある | fixtureはunaware needだけ。aware/partialの動機がどの情報へ投影されるべきか詳細契約を照合する必要がある。全coreNeedsの無条件転送は不適切 |
| 受け取った会話と必要な継続情報 | 基本設計§6・発声節：実際の受信内容と必要な継続情報。U11の履歴なしは潜在に限定 | boundaryは新しいspeech perceptから起動flagを作る。conscious inputは現在perceptionと受理済みgoal/thought。独立した経験履歴・未解決事項の受領項目はない | 現在perceptionに言葉が残ることと、必要な継続情報が次入力へ保持されることは別。現在の型だけでは保持義務を検証できない。実知覚の更新・除去を含む複数tick追跡が必要 |
| 潜在向け傾向・反射 | 10/06所有者固定方針：思考材料を混ぜず、初回翻訳した傾向を再利用 | 現行contextは生の背景・coreNeeds・傾向、character anchor、availableActionsを渡す。rendererは受領したものを文章化 | 現行テストはhidden背景の全文包含を肯定する。これは旧投影の試験であり、新圧縮方針の適合証拠ではない。未実装の移行対象として分離する |
| 裁定材料 | 10/06方針：正確さ優先、判定材料を落とさず表記だけ圧縮 | 前日ローカル変更は専用rendererへ接続、値・型・順序保持を対象 | renderer局所の保持試験と、裁定に必要な元資料が入力まで届く試験は別。今回、上流の全材料網羅は未照合。文字数削減を実token削減と扱わない |
| 実況の発言原文・認知範囲・継続 | 既存発声契約と10/06圧縮方針：原文・結果・認知境界を保持 | 圧縮は保存方針のみで未実装 | 公開完走と実況25件完了は生成・完了の証拠。必要情報の保持、非開示情報の除外まで保証しない。圧縮実装前に元資料→prompt対照が必要 |

## 正確な参照位置

- 要件：`docs/battle-consciousness-requirements-2026-10-05.md` U08/U11/U12。
- 基本設計：`docs/battle-consciousness-basic-design-2026-10-05.md` §6（84行）、発声（148行）、role必須情報と超過時停止（216行）。料金証明部分はADR0051の後継指示を適用する。
- compiler：`packages/shared/src/character-definition-v3.ts` compileCharacterBattleCompilerInputsV4（881行以降）。
- 静的投影：`packages/shared/src/structured-character.ts` projectCharacterConsciousSelfV2（781行以降）。
- 動的指針：`backend/src/services/battle-service.ts` metadata生成（1560行以降）、旧consumer（1603/1862行付近）、awareness frame（4814行以降）。
- 接続：`backend/src/services/awareness-battle-boundary.ts` 81行、`awareness-context.ts` consciousCharacteristics。
- 型：`packages/shared/src/awareness-pipeline.ts` characterFields / AwarenessConsciousInputSchema。
- 実送信：`backend/src/llm/awareness-request.ts` prepareAwarenessRequest。
- 局所検証：`backend/src/services/awareness-context.test.ts` empty consciousGuidance / hidden-need fixture。
- 公開観測：`backend/src/scripts/awareness-public-observation.ts` terminal・policy・SDK利用記録。

## Cause Linkと検証の境界

旧compiler検証のCauseが旧immutable binding実装へ接続していても、新awareness consumerの受領を証明しない。SealGraphの同一性・履歴・stalenessと、対象経路の意味的な適合は区別する。前日読取ではawareness-context/request/public-observationのテストが登録表に存在せずunsealedで除外されていた。旧集約テストの成功を新経路の合格へ拡張できない。

ADR0058による未Seal停止は、この誤った集約成功を防ぐ。停止解除のために一括登録・再Sealすることは情報欠落の修復ではない。検証内容、上流義務、実装対象、出典の一致を先に確認する。

## 具体的な修正候補

1. 詳細設計の各role入力表で、情報源、適用/開示条件、投影先、受領先、許された空状態を対応させる。顕在指針は「該当なし」と「投影済み情報を未接続」を区別する。既存の指針投影結果を受領する責務を明記する。
2. ライブ指針投影を、WeakMapの暗黙consumer依存から明示した型付き受け渡しにする。顕在へだけ渡し、潜在の圧縮入力へ思考材料として混入させない。既存の適用判定を再発明しない。
3. 条件に該当する非空指針、該当しない指針、自覚不可の動機を持つ資料で、元資料→実送信promptまでの統合試験を置く。指針の受け渡しを意図的に除去すると同じ試験が失敗することを確認する。型必須化だけでは空配列・誤ったprojectionを防げない。
4. 会話継続は受信→知覚更新→次の思考入力まで追跡し、現行保証の不足を確定する。履歴の範囲・保持期限は基本設計から詳細設計へ戻して決める。新しいラベルや履歴を先に永続化しない。
5. 以上の試験のCauseを、現行の上流契約と対象実装へ照合してから登録する。集約テストが拒否される状態は明示し、局所診断成功を正式合格と呼ばない。

単なるrequired string[]追加、プロンプトへの「指針を守れ」追記、動機ラベル追加だけでは元情報の欠落を検出できない。全部の資料を送る案は、非開示境界と潜在圧縮に反するため選ばない。

## 状態と次の確認

本資料は照合と修正候補。ソース・Seal・公開状態は本作業で更新していない。CLI llmthink auditはfatal/error/warning 0（7 hints）。正式PERTの新タスクは未追加、既存公開完走タスクの完了は再利用しない。observe-velocityはPTHIS-103履歴競合のため取得できない。

次の確認は、既存詳細設計の指針受領義務と会話継続範囲を特定し、この表の対象を受入条件へ接続すること。限定した契約是正・統合試験・検証登録の内部工数は暫定4〜8時間（agent見積、確信度低）。会話保持の新仕様決定、未Seal全件の復旧、公開品質の再試験はこの見積に含めない。

## 独立レビューと今回の再確認

独立reviewer conscious_effectiveness_reviewは現在コードを読取照合し、指針欠落の記述とコードの一致、明示した型付き受領、非空の通過試験と非該当・非開示の対照を支持した。より短い次の手として、全roleの同時改修より顕在指針一経路を先に閉じることを推奨した。

完了条件を補足する：局所試験の成功やSeal登録だけで「CIで発見できる」としない。同じ接続を意図的に欠落させた時に、正式CIの通常経路が失敗することを確認する。会話保持範囲などの後続設計はこの具体的な断絶修復の前提へ拡張しない。

2026-10-07再確認：`npm test`はexit1、active36/provisional2/disabled208、未Seal191件で実行前に停止、TAP開始なし。gate/分類15件の直接実行は成功したが診断として扱う。`git diff --check`成功。今回の新規文書・証跡はローカル未コミット・未同期。
