# ADR-0028: 世代固定された顕在意識の目標・行動・発話契約

- Status: Accepted
- Revision: 2
- Date: 2026-09-09
- Supersedes: なし
- 正本: [同名.think](0028-versioned-conscious-agency-contract.think)
- 現行の訂正出典: 2026-09-09のowner指示「作者確認ではなく性格・関係に照らした目標の妥当性」
- 要件: [revision 2案](../character-agency-requirements-v2.md)、[訂正記録](../evidence/agency-goal-criterion-correction-2026-09-09.md)
- 旧要件: revision 1は正確な承認履歴として保持するが、R1の作者明示目標の拘束条件化は今回訂正する。
- 関連: ADR-0027（責務）、0025（状態／発話実績）、0026（旧V2心理修復）、0011（構造化作者入力）、0018（activation）
- 計画: [実装計画](../character-agency-implementation-plan-v1.md)、PERT t027〜t032

本ADR revision 2と要件revision 2は[ownerの直接承認](../character-agency-requirements-v2-acceptance.md)を得た。
新版の独立レビューは未実施。旧版レビューを継承せず、今回の承認によりローカル実装を進める。
設定変更の実行・有料試験・展開は別承認。訂正時点ではProposedだったため同番号で改訂し、Accepted ADRのSupersedeは行わない。

## 背景・選択肢

revision 1では「作者が明示した目標を優先する」という前提から、
作者確認済み出典・新キャラenvelope・出典不明時の開始拒否を設計した。
これは意味的な妥当性を出典の証明へ置き換えた誤りであり、今回撤回する。
後から説明した「設定値と補完値の区別」は、元の設計意図ではなかったことも訂正記録へ残す。

選択する案は、既存の同じ顕在callで性格・価値・既知関係・状況から目標を導くもの。
作者の確認を求める案、出典だけで候補を優先／排除する案は採らない。
別plannerやcriticは追加しない。旧独立要件レビューは旧版だけを対象とし、今回の妥当性の証拠には転用しない。

## D1. 目標の意味的妥当性

目標の正当性は、束縛済みのキャラ性格・価値観・認知済みの相手との関係・状況に照らして判断する。
作者確認の有無、人間／LLMのどちらが書いたかを優先順位・有効性の基準にしない。
既存defaultObjectiveがあれば目標候補として扱うが、明示されているだけで拘束条件にはしない。

通常の目標は「勝つ」。ただし「勝敗より戦闘を楽しむ」「この相手を傷つけたくない」等から
別の目標が妥当なら、その目標を導出できる。勝利fallbackも性格・関係より優先する指示にはしない。
行動禁止規範は目標文とは別の既存engine制約として維持し、相手の未知属性を推測で補わない。

既存キャラenvelope／definitionと不変snapshot・digestを再利用する。
**CharacterGenerationEnvelopeV3、agencyObjectiveV1、objectiveAuthority、作者再確認UI、
AGENCY_OBJECTIVE_PROVENANCE_REQUIREDによる開始拒否を撤回する。**
出典metadataがないことは、性格情報の欠落でも戦闘開始エラーでもない。
battle/dialogueのV3契約は状態・入出力の変更のため引き続き必要であり、キャラenvelope版とは区別する。

同じ顕在意識が理由・basisRefsを伴う目標を生成する。
参照IDの存在やschema適合だけでは意味的妥当性は証明できない。
妥当性はF01/F02等の性格・関係別の許容目標／行動集合で評価し、
完全一致の文面、出典identity、勝率だけで合否を決めない。機械的な意味判定器や追加LLM審査は作らない。

## D2. 新世代の選択・固定

BattleAssetManifest=3、dialogue schemaVersion=3／compact、compilerInputsV3、
キャラ世代digest、psyche-reaction-policy-v1を作成時に固定する。
V1/V2のdecoderは維持。混在・欠落したV3 tupleは `BATTLE_CONTRACT_MISMATCH` とし、
暗黙の旧経路fallbackや実行中の現行設定再読込みをしない。

設定更新requestにoptional schemaVersion=2|3を追加する。
省略時は保存済み3を保持し、それ以外は既存のwrite-2動作。
明示3はcompact必須、明示2は既存modeを許容。expectedRevision CASと同一transactionの
設定世代作成を維持する。V3にlegacy modeを組み合わせて黙って降格しない。
既定設定は変更せず、V3とlegacy deployment overrideの組合せは戦闘作成前に拒否する。
ADR-0018の保存設定の権限・isolated override identityは維持する。

## D3. 心理反応の有界投影

心理は既存ReactionStateV1と固定特性による決定論的更新だけを担う。
prologueは既存のゼロ初期状態、turn／aftermathは既存phase確定境界で各1回更新。
入力欠落は前状態保持、実際の空入力は通常の減衰を許す。欠落をLLMへ回さない。

状態を再更新しない純粋な投影helperを抽出し、既存の投影式を維持する。
顕在入力reactionにはactionとexpressionのPsycheReactionProjectionV1を渡す。

| 項目 | 値／上限 |
|---|---|
| schemaVersion | 1 |
| arousal | low / medium / high |
| interpretation | adverse / uncertain / affiliative、最大3 |
| impulse | confront / withdraw / approach / seek_reassurance、最大4 |
| expression.expressionTendency | withhold / restrained / available、必須 |

これは傾向であり行動や沈黙を強制しない。生の特性値・スコア・遷移根拠は顕在へ渡さない。
後攻再判断は直前の投影を再利用し、心理を追加tickしない。
心理に能力metadata・作戦・発話案・エンジン知識を渡さない。
「ここぞ」の新LLM条件や顕在意識からの直接調整は今回定義しない。

## D4. 目標・意図の唯一のwriterと寿命

CharacterAgentStateへclosedなconsciousAgencyV1を追加する。

```typescript
type ConsciousAgencyV1 = {
  schemaVersion: 1;
  upperGoal: Goal | null;
  latestDecision: Decision | null;
};
// Goal: statement (1..240), basisRefs (重複なし1..6)
// Intent: aim (1..160), basisRefs (重複なし1..8), rationale (1..240)
// Decision: intent, 検証済みaction|null, serverのturn>=0,
//           phase=prologue|turn|later
```

文字数はtrim後のZod UTF-16長、refは最大96文字。
新V3戦闘では両fieldをnull初期化する。顕在出力が唯一の提案者、
受入関数が唯一のwriterであり、既存battle revision CASの成功時だけ保存する。
上位目標は初回受入後に固定。latestDecisionは直近の採用提案で、実行結果ではない。
次判断には前回の提案として渡し、fallbackの意図へ流用しない。新ledgerやIDを増やさない。
ナレーター・相手・provider都合の状態から書き込ませない。

## D5. 顕在入力・知識参照・履歴

通常入力をcontractVersion=3として閉じ、phase、character、structuredSelf、reaction、
agencyState、goalPolicy、facts、turnObservation、utteranceHistory、observableManifestations、
許可されたsocial/counterpartを持つ。decisionはprologue/turnのみ。
自己呼称・声は束縛済み自己profile、関係は認知済みのものに限る。旧心理自由文を流用しない。
goalPolicyは性格・価値・既知関係・状況からの導出と通常の勝利fallbackを指示する。
既存目標文は優先権のない判断材料とし、作者確認フラグを渡さない。

factsは最大128件のclosedな{ref, kind, sourcePath}。
kindはsuggested_objective、value、relationship、default_objective、
ability、reserve、observation、candidateの8種。
sourcePathはserverが許可済みの固定入力部分に作るJSON pointerであり、任意の私的objectを参照できない。
refは入力内で決定論的・一意・最大96文字。目標の不変出典refは戦闘内で安定、
観測等のrefは当該入力でのみ有効。必須規範を切り捨てず、上限超過はdispatch前に失敗させる。
目標のbasisRefsは先頭4種、意図は全種を許す。受入は所属・kindを検証し、
参照したというだけで意味的正しさまで証明したとはしない。
保存済みの古いrefsは過去の根拠であり、現在factsとして再利用・再検証しない。

発話履歴は確定済み・観測者に許された実績のみ。既存windowと同文受理を維持し、
新lastSpeech入力・書込みを追加しない。
後攻入力はphase=later、同じ自己／心理／目標／意図とfacts、現在知覚、decision、
当該phaseの成立済み自己発話を持つ。再発話や実行結果の宣言をさせない。

新しい身体表現generatorは作らない。既存の有効・観測安全な候補だけを
observableManifestationsに提示し、なければ空。実現は候補との完全一致のみ。

## D6. 応答・部分受入・失敗の優先順

| phase | 許可する応答keys |
|---|---|
| prologue / turn | initialGoal、intent、nextAction、nextUtterance、realizedManifestation |
| aftermath | nextUtterance、realizedManifestationのみ |
| later | intent、nextActionのみ |

初期化前initialGoalはGoal、初期化後はnull。intentはIntent、nextActionは既存行動案またはnull。
発話・表現の値域と発話の既存coercion/validationは維持し、null発話は合法。

外部JSONをnetwork境界で一度parseし、typedな部分受入結果へfieldごとにsafe-decodeする。
不必要なcast、内部stringify/reparse、最終契約を自由なrecord/unknownにする実装は禁止。
object形状不正・余分なkey・phase違反は全提案を拒否。
必須field欠落はfield単位で扱い、独立した有効発話を救済する。

| 不正／条件 | 受入 |
|---|---|
| 初期目標が欠落・不正 | 未初期化を保持、意図／行動拒否、発話は独立検証 |
| 初期化済みに非null目標を再提案 | 旧目標保持、依存する意図／行動拒否 |
| 新目標は有効、意図が不正 | 目標のみ初期化可能、発話は独立検証 |
| 意図は有効、行動が不正／利用不可 | 意図と行動の組を拒否。目標初期化と有効発話は可能 |
| 有効意図＋null行動 | 発話のみの判断として受入可能 |
| 後攻の行動欠落／拒否／意図不正 | 既存決定論的fallback。目標・直近採用提案は維持し、古い意図をfallbackへ付与しない |
| aftermath | 目標・意図・行動を書かず、表現のみ検証 |

表現実現は候補所属を独立検証。発話不正だけで有効行動・意図を拒否しない。
身体的な発話不能時は、意図を発話成立と記録しない。
状態と実際の発話は既存atomic revision境界で確定し、CAS失敗時は一切採用成功と扱わない。
初期目標失敗の再試行は次の通常prologue/turn枠のみ。即時application retryは追加しない。
ADR-0026の修復は旧V2心理専用で、新契約へ拡張しない。

## D7. 旧field・実行結果・7タグ

V3のcurrentGoal、beliefs、interior appraisal、ExpressionBriefは旧互換field。
既存の中立形で初期化し、新戦略writerやV3意味入力として使わない。
新目標はupperGoal、現判断の評価・狙いはIntent。旧自由文・不明beliefsを一括移管しない。
V1/V2は既存writerとphase挙動を維持する。

実行されたreflectは既存engine writerでbattleVolatileMemoryへ記録できるが、
currentGoal/interior経由でV3目標・意図を上書きしない。
観測可能な結果を次判断へ渡す。戦後reflectionは新目標と確定行動・発話実績を読み、
古いcurrentGoalを参照しない。新しい長期記憶書込み・選択機構は作らない。
既存private/matchup memoryの保存寿命は維持するが、旧心理自由文をV3へ流さない。
会話履歴writerは発話確定、focus shadowはno-effectのまま。

| 7タグ | 新旧の処置 |
|---|---|
| battle.ts 心理schema | 旧世代専用と明記 |
| llm/types 心理input | 旧世代専用と明記 |
| deterministicPsyche | V3の全phase no-callを明示分岐 |
| storedMatchupMemory投影 | 旧経路専用 |
| expressionState投影 | V3 reaction／agency入力へ接続 |
| Compact心理goal指示 | 旧経路専用 |
| full心理指示 | 旧経路専用 |

残すタグには世代と残存理由を書く。コメントの削除だけを移行完了としない。

## D8. 呼出し・費用・privacy

advanceCharacterAgentとdecideCharacterActionを再利用。
operation名advanceCharacterAgentCompact／decideCharacterAction、
taxonomy v2のcharacterExpression分類を維持する。名称は互換ラベルで別人格ではない。

通常の各有効phaseはactive sideごとに顕在logical call 1回、後攻は最大1回。
disabled/ineligibleは0回、V3心理は全phase LLM 0回。
planner、critic、application repairを増やさない。
既存transport retryは合計最大2回（rate-limit最大2、service-unavailable最大1を合計内で）、
logical callあたりphysical attempt最大3。timeout等の新retry種別を増やさない。
全attemptをcall/token/costへ計上し、将来の有料replayでは契約・taxonomy・最大枠を固定して別承認する。
旧runを再解釈しない。

公開DTO・ナレーター・相手入力へagencyState、facts、私的目標文脈、根拠を渡さない。
実際に成立した許可済み表現のみ既存ルートへ。
内部観測も既定では新状態・既存の私的束縛情報・raw入出力をredactし、raw閲覧は既存の明示権限を維持する。

## D9. 実装順・検証・不利益

承認後にt029-A→B→C→Dの順で実施する。

1. A: 型・既存キャラsnapshotを使う戦闘世代・opt-in検証・初期化／保存／再読込／CAS。
2. B: 純粋心理投影・顕在知識・closed adapter／mock。
3. C: 後攻と部分失敗の全組合せ。
4. D: 旧世代、privacy、no-call、費用、7タグと総合回帰。

同じ性格・関係・目標候補なら作者確認の有無で許容目標集合が変わらないこと、
同じ目標候補でも性格・関係が変われば適切な集合が変わること、
明示された勝利でも戦闘享楽・相手保護との整合を判断すること、出典不明で開始拒否しないこと、

投影のno-tick、side別phase、欠落と空入力、2回以上の目標保持、古いrefsの区別、
失敗優先表、同文発話、設定省略／明示／混在／override／disabled／retry計上を検証する。
F01〜F08の許容集合・rubricを再利用する。mock成功は実モデル改善ではない。
t030で比較閾値・call/token/cost上限を固定し、t031で有料実行を別承認する。

負担は顕在入力tokenと戦闘世代・部分受入のコード分岐の増加。
作者確認や専用キャラenvelopeの工数は撤回する。
t029の従来3pは引き続き暫定値で、撤回分があることだけで妥当な見積りとは証明されない。

## 承認と検証の区別

ownerの意味的妥当性という訂正が今回の設計基準。
要件revision 2と本ADR revision 2全体をownerが直接承認した。新版の独立レビューは未実施。
正本のOWNER_ACCEPTANCEとACCEPTANCEに承認対象の正確なdigestを記録した。
旧要件の作者拘束条件を実装authorityへ転用しない。
CLI監査、文書投影確認、Sealの一致は実モデル品質や実装適合の検証ではない。
npm adr:check未導入は継続する検証制約である。
