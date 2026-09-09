# CA-00 型付き入力・保存境界の実測 — revision 1

履歴の適用範囲: 以下は旧契約の基線観測で、旧runの件数・結果を変更しない。
V3追加後も同じlegacy/Compact1/Compact2 fixtureの回帰を通した。resealは旧契約への適用範囲の再確認であり、
旧runがV3を実行したという主張ではない。新V3の検証は[別記録](agency-v3-local-verification-2026-09-09.md)へ分離する。

基準commit: `0754ca7d796b481a51f39723d1e331c46ce470ff`。2026-09-09。
追加fixture/testのみ。runtime・provider prompt・schemaは変更していない。
LLM応答は固定fixtureであり、実モデルの品質・勝率・単調化改善の証拠ではない。

## 再現と観測範囲

`backend/src/services/character-agency-inventory.fixtures.ts` が型付きの入力・adapter返却値・
採用後state・後攻入力を返す。生成点は `runInventory`、外部境界は
`InventoryProvider.chatJson`。本来の入力投影・シリアライズ・decoder・受入を通し、
通信だけを固定応答に置換する。片側aを直列に実行する専用fixtureであり、
二者並列の共有providerとしては使用しない。実戦のprivate payloadは含まない。

テスト: `node --import tsx --test backend/src/services/character-agency-inventory.test.ts`。
9経路のfetchを禁止し、呼出し0を確認。ここで数えるadapter要求と課金callは別。
DB検証は試験専用一時SQLiteを作成し、終了時にcloseして削除する。

| 世代／条件 | prologue 心理/顕在 | turn 心理/顕在 | aftermath 心理/顕在 |
|---|---|---|---|
| legacy、心理V1束縛 | 1/1 | 0/1 | 1/1 |
| Compact V1、心理V1束縛 | 1/1 | 0/1 | 1/1 |
| Compact V2、心理V1束縛 | 1/1 | 0/1 | 1/1 |
| Compact V2、心理V1未束縛 | 未測定 | 1/1 | 未測定 |

aftermathにはdecisionを渡さない。通常turnのno-call条件は世代/phaseの既存分岐。
この表は「ここぞ」を検出する新triggerの証拠ではない。

## 観測された経路

| 値 | 実測結果 |
|---|---|
| 旧currentGoal | fixtureのprivate markerがSQLite保存・再読込・次turn後も保持される |
| V2 adapter返却state.currentGoal | 空文字。受入は以前のgoalを保持する |
| V2顕在入力 | expressionStateにcurrentGoalがない。実シリアライズ済みuserにもmarkerがない |
| 性格 | structuredSelf.tendenciesとdecisionProfile.principlesへ届く |
| 認知済み関係 | structuredSelf.relationshipへ届く。未知属性はfixtureで与えない |
| 自己能力 | character.basicAction.descriptionへ届く。余力と射程で候補が変わる |
| 既定目標 | enjoymentへ性格を変えてもdecisionProfile.defaultObjectiveはvictoryのまま |
| 後攻入力 | character / structuredSelf / perception / decision。goalや専用utteranceHistoryはない |
| 直前の自己発話 | 後攻perception.self.perceptsに音声知覚として届き、adapter要求にも含まれる |
| 公開DTO | private goal markerは含まれない。同文を2回発話しても実績2件を保持 |

訂正: 「後攻へ発話が一切届かない」は誤り。専用履歴の欠如と、知覚を通じた
成立発話の伝達を区別する。静的調査の「履歴なし」は専用履歴フィールドの意味に限定する。
初回testでこの不正な期待が失敗し、perceptsを直接確認して期待を訂正した。
目標非伝達は確認できたが、単調化の唯一の根本原因とは断定しない。

## 比較fixtureと採点基準の固定

固定値: アオ/クロ、日時2026-09-09T00:00:00Z、平地、near、初期目標private marker、
基本攻撃near、集中打MP cost20、自己MP30。目標markerは配線検査用で意味的目標ではない。
品質比較ではmarkerを新契約の未初期化状態に置換することをt030の版に記録する。
関係のnumeric dynamicsは全0。性格/関係差による心理数値の混入を避ける。

| ID / 変数 | 現契約で固定する期待 | 新契約／品質比較で見ること |
|---|---|---|
| F01 enjoy | traitsだけ戦闘享楽へ変更。顕在tendenciesが変わる。既定victoryは変わらない | 初期目標・短期の狙い・選択が作者の価値に整合する。単なる目標文の差を成功にしない |
| F02 care | relationshipだけrival→cherished、呼称を変更。顕在へ届く | 認知済み関係に沿う手加減・間合い・防御等の選択を説明できる。未知属性の決めつけは禁止 |
| F03 low_mp | MPだけ30→0。skillを候補から除外 | skill以外の許容候補から、目標に合う行動。架空の余力を使わない |
| F04 far | world pair distanceだけnear→far、初期知覚再生成。basic_attackを除外 | 接近・維持・離脱等と発話の狙いが整合。届かない攻撃を成功扱いしない |
| F05 ability_text | 基本攻撃descriptionだけ変更。心理traits・観測・反応state/receiptは同一、自己知識は変化 | 知識を心理へ移さず、顕在だけで利用する |
| F06 保存/CAS | 実repoのsave/get往復と古いrevision拒否。以前のgoal保持、次顕在入力には欠如 | 初期化・欠落応答・採用・再読込・次判断を通じて新goal ownerが一意 |
| F07 後攻/拒否 | 専用helper→adapterの入力を確認。既存scene-beat試験で不正skill拒否・defend fallback・1callを保存 | 意図、提案、採用行動、成立発話、確定効果を区別する |
| F08 互換/公開 | 9経路、未束縛turn、同文2件、private非公開 | 新旧routing・no-call・公開除去・課金分類を退行させない |

許容集合: control/enjoy/care/ability_textは
basic_attack/defend/rest/wait/reposition/reflect/free_action/skill(costly)。
low_mpは同集合からskillを除外、farはbasic_attackを除外する。
実際の合法集合を上限とし、その中で目標・関係・余力に矛盾しないものを許容する。
享楽なら常に攻撃、親愛なら常に防御、といった固定正解にはしない。

品質採点は各0/1/2: (a)性格・関係への忠実さ、(b)能力/戦況の事実利用、
(c)目標と選択、(d)選択と発話の整合、(e)狙った効果と実効果の区別。
0=矛盾または根拠なし、1=整合するが一般的、2=与えた差分を選択に具体的に利用。
根拠を出力が明示しない場合は推測で補わず「判定不能」。沈黙・同文自体を減点しない。
単一の合法行動の一致は失敗ではない。比較全体が目的文の差だけなら改善を確認できない。
重み・必要件数・成功閾値・token/cost上限は実装後t030で事前固定し、今は合格判定しない。

## 既存試験の再確認と限界

全 `npm test` 成功: shared308/backend334/frontend20/deployment3/release5、合計670。
追加16件を含む。`npm run typecheck` 全対象成功。
Lizard1.23.0: 185files/3207functions、CC超過117/121、長さ67/67、引数5/5で基準内。

- battle-speech-wiring: activationの設定由来/override来歴、不正心理拒否、
  有効発話と不正行動の部分受入、同文・公開前の成立発話、phase制約。
- battle-consumer-wiring: 自己/相手の知覚分離、認知水準、凍結自己profile。
- scene-beat-wiring: 実advanceTurnで後攻の不正候補と決定的fallbackを保存。
- character-expression-contract / openai-compatible-psyche-repair: 閉じたkeyと既存修復範囲。
- internal-observability / structured asset integration: 私的情報除去と既存generation束縛。

新fixture単独で全redaction/activation/課金分岐を実測したとは扱わない。
既存対象試験と静的な投影/設定bindingの確認を合わせたCA-00基線である。
新世代の課金receipt、失敗組合せ、隠れた相手属性の全組合せは実装時に追加検証する。
F07は「拒否」ケースを固定し、先行結果による特定の射程変化シナリオの実モデル比較は未実施。

判定: CA-00の限定した現契約棚卸し・fixture・採点軸固定は完了。
新契約適合、詳細要件承認、実モデル改善、展開は未完了。
判断: [CLI監査](agency-ca00-contract-candidate-2026-09-09.think)、fatal/error/warning=0。
