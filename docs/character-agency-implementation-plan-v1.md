# ADR-0027 実装影響と修正計画 — revision 5

2026-09-09。状態: ADR-0028 revision 2承認後のローカル実装・検証中。
revision 1を0754ca7へcommit後、CA-00の型付きfixture/testを追加して実測した。
今回V3 runtime・prompt・schemaを追加した。既定設定・実データ・有料API・展開は変更していない。
CA-00とt027は完了。t028はowner直接承認で通過（新版独立レビュー未実施）。
t029は変更済みADR-0027/0028に対する正式adr:checkと最終ローカル検証を通過したが、
未変更の旧ADR DSLとformat 5 SealGraph実行環境の限界を残してactiveである。
[今回の実装・検証](evidence/agency-v3-local-verification-2026-09-09.md)と
[再開後の検証](evidence/agency-v3-resume-verification-2026-09-09.md)に結果と残事項を分離する。

現在の基準（2026-09-09訂正）: 作者確認ではなく性格・価値観・認知済み関係に照らした目標の妥当性。
旧要件revision 1のR1はこの指示と衝突するため、その優先規則を現行実装の根拠にしない。
[要件revision 2](character-agency-requirements-v2.md)と[ADR-0028 revision 2](adr/0028-versioned-conscious-agency-contract.md)はowner直接承認済み。
[正確な承認記録](character-agency-requirements-v2-acceptance.md)を参照。新版の独立レビューは未実施。
旧レビュー・承認は履歴として保存し、新版へ継承しない。作者再確認・専用キャラenvelope・出典不明時の開始拒否は撤回。


## 1. 初回の成果と範囲

CA-01＋最小CA-02: キャラの性格・価値観・認知済み関係から初期の目標を導出し、
自己能力・余力・戦況を使って次の行動とセリフを同じ顕在意識が判断する。
長い思考全文ではなく、目標・選択・狙い・参照した事実の短い宣言的な要約を扱う。
目標の文面だけを追加して観測の言い換えが続く状態は完成としない。

この順序で実装を進める。機能の代替として性格ラベルから固定分岐を作らない。
通常ゴール「勝利」も含め、性格・価値・認知済み関係に照らした妥当性をADR-0028 revision 2で明文化する。
既存の作者指定action normsを、モデルの気分や新しい目標で無断に無効化しない。

初回外: 長期の時系列適応、発話による新しい機械的効果、上位目標の随時変更、
NN学習、「ここぞ」の新LLM起動条件、全旧戦闘の移行、UIで私的思考を表示する機能。
短期目的は現在の選択に必要な範囲を含むが、CA-03以降の学習・適応を先取りしない。

## 2. 調査の根拠と限界

revision 1静的調査の基準checkout: c63c526a9c4ca91016495b933915112e19236ea8に、承認済みADRと資料・コメントWIPを加えた状態。
リモート基準: 1cdf21009dbb8f4099dbb9ca70760320c50be6aa（今回fetchで確認）、ahead 20 / behind 0。
既存[実装影響調査](evidence/adr-0027-implementation-impact-2026-09-09.md)を、
以下のproducer→projection→acceptance→persistence→次判断の経路で拡張した。

確認した事実:
- advanceCharacterAgentは既にnextUtteranceとproposedActionを同時に返す。
- Compact V2の目標は心理入力型にあるが、顕在入力expressionStateにはない。
- 返却stateのcurrentGoalは空文字、受入側はpreviousを保持する。
- decisionには合法候補、規範、コスト等の情報がある。全知識が欠落しているわけではない。
- 後攻の再判断入力はcharacter/structuredSelf/perception/decisionで、目標・専用発話履歴を含まない。
  ただし成立した自己発話はperceptionの音声知覚として届く（CA-00で実測）。
- 保存直前にBattleStateSchemaを通す。型だけ／provider出力だけの追加では保存を保証できない。
- generation設定は現在1/2の判別。新しい契約を既存2の再解釈で導入できない。

上記は静的調査の起点。追加の[CA-00実測](evidence/character-agency-ca00-inventory-2026-09-09.md)で
9 phase/世代経路と未束縛turn、保存/CAS、入力差分、許容集合、採点軸を固定した。
未測定経路と既存試験で確認した範囲は同記録に分けている。実モデル品質評価は未実施。
単調化の唯一の根本原因や実モデルの改善は、この調査からは断定しない。

## 3. 影響マップ

区分: A=初回の修正設計対象、B=原則再利用・回帰確認、C=選ぶ契約により修正。
以下のパスはrepository rootからの相対パス。symbolを検索キーとし、行番号変動に依存しない。

| ID | 区分・実装箇所 | 現状と修正／確認内容 | 受入確認 |
|---|---|---|---|
| I01 | A: packages/shared/src/battle.ts、backend/src/llm/types.ts | CharacterAgentStateSchema、心理delta、顕在input/resultのownerを対応付ける。旧型は保持し、新世代で目標・短期意図・行動・発話の型を閉じる。field名・寿命・上限はt027で確定 | 新値のschema往復、旧V1/V2読込み、許可しないwriterの排除 |
| I02 | A: backend/src/services/battle-service.ts | initialAgentState / toPsycheInput / applyPsyche / toSpeechActionInput / acceptCharacterAgentResult / stateAfterUtterances。心理で目標を作り顕在に渡らない配置を新世代で修正。生成→受入→保存→次入力を一続きで扱う | 2回以上の更新と再読込で目標が届く。二重writer、空文字上書き、未採用出力の混入なし |
| I03 | A/B/C: 同service、backend/src/services/free-action-service.ts、packages/shared/src/structured-character.ts、packages/shared/src/action-feasibility.ts | buildCharacterDecisionContext、decisionProfileForSheet、projectCharacterConsciousSelfV2、buildObserverSafeAvailableActionsを再利用。目標候補を出典で優先せず、性格・価値・既知関係から妥当性を判断する。認知済み関係・自己知識だけを不足分投影。候補生成や規範評価の全面置換はしない | 性格／関係の差、余力／射程の差が意識入力に正しく反映。隠れた相手属性が流入しない |
| I04 | A/C: backend/src/llm/openai-compatible.ts、backend/src/llm/character-expression-prompt.ts、packages/shared/src/compact-psyche-decode.ts | phaseRuleの目標・意図生成、advanceCharacterAgent、decodeCharacterExpressionCompactResultV2の閉じたkeysを新契約に合わせる。心理は反応更新へ限定。旧decoderとADR-0026修復は互換保持し、新出力へ無条件流用しない | system promptとschema一致。欠落・余分なkey・意味不整合時の扱い。型検証を通った影響部分も必要なら修復対象とするが、新closureは別設計 |
| I05 | A: backend/src/services/battle-service.ts、backend/src/llm/types.ts、backend/src/llm/openai-compatible.ts | buildLaterBucketActionInput / decideCharacterAction / deterministicLaterBucketFallback。再判断でも同じ目標を参照する。plannedAction・成立発話・未実行候補を区別。行動拒否時の有効発話受理という旧契約を黙って変えない | 先行結果で候補が無効化された場合、次判断・採用行動・発話実績が矛盾した事実を作らない。fallbackを成功した目標達成と誤記しない |
| I06 | A/C: packages/shared/src/dialogue-pipeline.ts、backend/src/services/battle-service.ts、backend/src/services/dialogue-pipeline-activation.ts、backend/src/repositories/dialogue-pipeline-settings.ts | 新世代の判別と作成時snapshot。prologue/通常turn/aftermath・Compact/旧経路ごとにwriter/call表を定める。管理設定を実行中に再読込しない | 旧battleが新経路へ流れない。通常turnの心理no-callを維持。設定・activation側の変更範囲はt027で確認 |
| I07 | B/C: backend/src/repositories/battles.ts、packages/shared/src/battle.ts | writeBattleでschema検証→state_json保存→revision/fence比較、parseBattleStateで再構成する。既存保存境界を使えるか確認。新テーブルや列追加は現時点で必要と確認されていない | 再読込後も型と状態を保持、revision競合で未確定意図が保存されない。DBの実String境界以外にJSON往復を追加しない |
| I08 | A: backend/src/llm/mock.ts、既存wiring/contractテスト | 現Mockは観測言い換えとnull action。新契約の配線用応答をfixture化し、providerと同じ型を通す。Mockの発話改善を実LLM改善とは報告しない | 通常／不正／欠落応答、行動拒否、同文発話、private漏洩を局所テスト |
| I09 | B/C: backend/src/llm/provider-operation-taxonomy.ts、backend/src/services/internal-observability.ts、battle-service.tsのtrace/公開投影 | 既存operation名は互換ラベルであって心理責務の定義ではない。call/段階を変える場合だけ分類・費用集計を更新。新状態の配置によりredactionと公開投影を確認 | 各呼出しの計上漏れなし。相手・一般公開・ナレーターに私的目標や判断の全文が流れない |
| I10 | A/C: backend/src/scripts/replay-compact-v2-provider.ts、既存検証群 | 旧replayはV2・段階名・上限を固定している。消費済みrunは保存し、新版用のnetwork-zero準備を別runとして設計。既存harnessが新段階を正しく数えるか先に確認 | 同一fixture比較、最大修復時のcall/token/cost、失敗停止条件の事前固定。実行は別承認 |

I06のactivation/設定とI09の公開投影はCA-00で直接参照先・既存試験を再確認した。
新fixture単独で全分岐を実測したとは扱わず、新世代差分はt029-Dで追加確認する。
ADR-0028 revision 2では出典確認経路とCharacterGenerationEnvelopeV3の追加を撤回。
既存のキャラenvelope／definition／snapshotを再利用し、目標候補・性格・関係を顕在判断へ渡す。
作者再確認API・画面は不要。新しい私的思考公開UIも対象外。

## 4. 7タグの処置

7箇所は独立した7不具合ではなく、I01〜I06にまたがる同じ移行の目印。
- CharacterDeepPsycheSchema、CharacterDeepPsycheExpressionStateV2: I01/I02でownerと世代を定義。
- deterministicPsyche: I06で旧no-callと新契約のphase表を確認。
- storedMatchupMemory付近: I02/I03で私的記憶の用途と認知済み関係の投影を分ける。
- expressionState投影付近: I02で目標を生成する処理から受入・次入力まで接続。
- Compact phaseRule: I04で新経路の指示を移管。
- full phaseRule: 初回は旧世代互換として維持。恒久責務ではないことを示す。

新経路の実装・回帰確認後にだけタグを解消する。残すタグには対象世代・残存理由を記す。
コメントを消しただけ、型キャストで新旧を接続しただけでは完了としない。

## 5. 修正順序とPERT対応

現在のPERTを維持し、t029の内部を小さな縦断パッケージに分ける。
並行して別の状態ストアや新しい判断段階を作り始めない。

| 順序 | PERT / パッケージ | 成果物と終了条件 | 依存 |
|---|---|---|---|
| 1 | t026 / CA-00残作業 | phase/世代別の実入力・返却・採用・保存の型付きfixture、F01〜F08の許容集合と採点表。I06/I09の未確認分岐を補う | 今回の静的棚卸し |
| 2 | t027 / 詳細契約 | fieldごとのowner、writer、寿命、初期値、phase、可視性、失敗時処理、世代、上限を一表にする。既存call再利用案を優先比較 | 1 |
| 3 | t028 / 正確な版の受入 | 実装要件のowner経由レビューと版の承認。追加の重要契約決定があれば新ADR。ADR-0027は再承認しない | 2 |
| 4 | t029-A / 型・世代・一本の状態経路 | I01/I02/I03/I06/I07。既存キャラsnapshotと戦闘V3設定opt-inを含む。新旧を明示判別し、目標が初期化→受入→保存→次入力を通る。初期化失敗時の扱いも固定 | 3 |
| 5 | t029-B / 顕在判断と知識 | I03/I04/I08。目標・能力・合法候補から行動と発話を同じ意図で生成。新経路で心理が意図を上書きしない | 4 |
| 6 | t029-C / 再判断と拒否 | I05。後攻・行動却下・timeout/fallback時の採用状態を一貫させる。旧契約を変える必要が出たら実装を広げず設計へ戻す | 5 |
| 7 | t029-D / 互換・観測・総合回帰 | I07/I09、旧世代、privacy、no-call、費用計上、7タグ処置。focused/full test、typecheck、build、lizard | 6 |
| 8 | t030→t031→t032 / 比較準備→別承認→実験 | I10。control/treatmentと上限を凍結、実行後に品質・失敗・費用を分離評価 | 7 |
| 9 | t006 / 改善・Stage判断 | キャラ固有の目的と妥当な行動・発話への寄与を評価。未達なら次の仮説と範囲を見直す | 8 |

t029-A〜Dは親タスクの内部順序であり、新たなPERT IDや完了実績ではない。
親t029は全パッケージを満たすまで未完了。3pは元の暫定総量で、実績でも残工数でもない。
今回のローカル実装後、残りは正式ADRチェックの復旧・最終差分レビュー・検証記録の確定。
残り0.5〜1pを暫定予測とするが、実装前再見積りは未実施だったため完了したと遡及記録しない。納期は確約しない。
旧11pはt033完了を含む当初追加総量。残りと実測工数を混同しない。

## 6. 検証計画

F01〜F08の具体値・許容集合・採点軸と現契約での実測範囲はCA-00記録へ凍結した。
下表の新契約／実モデルに関する確認は将来の受入条件で、実行済み結果ではない。

| ID | 変えるもの／固定するもの | 確認 |
|---|---|---|
| F01 | 同戦況・能力・関係で性格/価値のみ変更 | 勝利志向と戦闘享楽等で妥当な目的・選択が分かれる。目的文だけの差は不十分 |
| F02 | 同キャラで認知済み関係のみ変更 | 傷つけたくない相手等への目標・選択が変わる。未知属性を既知扱いしない |
| F03 | 同目標・能力で余力のみ変更 | 不可能なcostの選択を除外し、狙いに合う許容行動から選ぶ |
| F04 | 同目標・能力で射程/知覚可能距離のみ変更 | 接近/離脱/攻撃等の妥当性とセリフが一致。架空能力を使わない |
| F05 | 心理特性・前状態・正規化経験固定、能力metadataのみ変更 | 心理反応が不変。顕在知識は適切に変わる。能力使用の観測結果まで変える試験とは別 |
| F06 | 初期化→更新→保存再読込、競合・欠落応答 | 目標が保持され、他owner/旧delta/不採用候補で上書きされない |
| F07 | 先行結果で後攻候補を無効化、または生成行動を拒否 | 再判断の意図・実行候補・先の成立発話を混同しない。実効果を捏造しない |
| F08 | 新旧世代、phase、private marker、同文発話 | 旧挙動、心理no-call、privacy、同文受理、費用計上が保たれる |

開始点となる既存テスト:
- backend/src/services/battle-speech-wiring.test.ts、battle-consumer-wiring.test.ts
- backend/src/llm/character-expression-contract.test.ts、openai-compatible-psyche-repair.test.ts
- packages/shared/src/action-feasibility.test.ts、psyche-reaction-policy.test.ts、battle-contract-types.test.ts、
  battle-asset-manifest.test.ts、structured-character.test.ts、compact-psyche-decode.test.ts
- backend/src/services/internal-observability.test.ts、backend/src/routes-structured-asset-integration.test.ts

ローカルでは契約・配線・不変条件を検証。実LLMでは性格への忠実さ、知識の利用、
目標・行動・発話の整合を別々に採点する。語彙多様性・勝率だけで合否を決めない。
通常経路の追加callはまず0を目標とするが、実現性と上限はt027/t030で固定し、
責務を混ぜて削減しない。失敗回復の追加呼出しを通常callの数字から除外しない。
全fixtureに一意の最適行動を強制せず、目標ごとの許容集合と判断要約で比較する。

## 7. 具体案と停止境界

1. 性格・価値・既知関係に照らした目標の妥当性。禁止規範はengine制約として分離。
2. 目標／短期意図／appraisal／briefの具体フィールドとwriter・寿命。全旧自由文を一括移管しない。
3. 新契約の世代判別とphaseごとの呼出し・失敗時処理。
4. 目標不正・行動不正・発話のみ有効の組合せと、必要な意味的修復範囲・上限。
5. 新状態配置に対する公開投影/redaction、後攻再判断で共有する最小文脈。
6. 実LLM比較の件数・閾値・予算。ローカル準備結果を見て実行前に固定。

上記1〜5は[ADR-0028 revision 2](adr/0028-versioned-conscious-agency-contract.md)のD1〜D8へ具体化した。
正確な版は今回ownerが直接承認した。独立レビューの実施とは区別する。6の有料比較上限はt030で固定する。
新旧の並存として設計し、Accepted ADR-0025/0026を改変しない。
関連ADRを一括Supersedeしてから考える進め方はしない。
revision 1ではt026を完了扱いにしなかった。revision 2で追加実測に基づき完了。
[要件revision 1](character-agency-requirements-v1.md)は[別記録](character-agency-requirements-v1-acceptance.md)で承認済み。
[独立レビュー](evidence/character-agency-requirements-v1-independent-review-2026-09-09.md)の出典・投影・費用等の論点をADR-0028へ対応付けた。
t027/t028を通過しt029を実施中。旧レビューは新版の独立レビューとして継承していない。

## 8. Sealと証跡

実装Sealは現状と依存の記録で、移行済みの証明ではない。
今回の追加静的調査対象を同じローカルgraphへ登録し、本計画を根拠資料へ接続する。
既存設計→backlog→PERTの変更前impactを確認し、レビューした文書だけをresealする。
実装を変える際も変更前impact、source/candidate比較、必要な検証、個別reseal、
下流の確認を行う。0 Staleは未登録影響や意味的正しさの保証ではない。

[CLI LLMThink判断](evidence/agency-impact-repair-plan-2026-09-09.think):
agency-impact-repair-plan-2026-09-09、fatal/error/warning=0。
revision 1の検証はPERT整合・Seal readback・文書対応だった。
revision 2は追加16試験を含む全670試験、全typecheck、Lizardを再実行して成功。
これは現契約の基線と回帰結果で、新機能の合格ではない。
追加判断: agency-ca00-contract-candidate-2026-09-09、fatal/error/warning=0。
CA-00後も残作業見積りは暫定。契約ADR/失敗表の確認前にt029の3pを短縮しない。

revision 3: ADR-0028 D1〜D9を具体案の正本とし、t029-Aへの出典確認経路追加はrevision 4で撤回。
要件承認・Proposed ADR・計画を別Sealで接続。検証はdocs/evidence/agency-contract-detail-verification-2026-09-09.md参照。
