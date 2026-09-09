# 初回キャラ主体性改修 — 要件候補 revision 2

状態: Proposed / requirement-authority-review step 1（作成・セルフレビュー）。2026-09-09。
CA-01＋最小CA-02。この改訂版は未承認であり、旧版のレビュー・承認を継承しない。実装許可ではない。
文書revision 2、候補の状態contract V1、提案するdialogue schemaVersion 3は別の識別子。
正確なSHA-256と独立レビュー入力は同名の `-review-input.md` に記録する。

## 1. authorityと範囲

出典はユーザーの「性格・関係から初期目標」「能力・戦況に基づく行動と対応する発話」
の要望、Accepted ADR-0027 revision 2、ADR-0025/0026、immutable assetの既存規約。
既存実装と[CA-00](evidence/character-agency-ca00-inventory-2026-09-09.md)は非規範の比較証拠。

| 既存authority | この候補での処置 |
|---|---|
| ADR-0027 | 心理反応／同じ顕在意識の判断／エンジン確定を維持。再承認対象ではない |
| ADR-0025 | V2の閉じた入出力・同文受理・state/history分離・行動拒否と発話の部分受入を保持 |
| ADR-0026 | V2心理の意味的closure修復だけに維持。新顕在契約へ無断流用しない |
| ADR-0008/0011 | no-effect focusと作者定義/規範を維持。focusを行動決定器へ転用しない |
| dialogue V1/V2 | 解釈変更・既存戦闘移行なし。新しい内部V3を別判別枝として提案する |

V3は今回確認したdialogue schema/ADR群に既存所有が見つからない内部候補名。
外部APIのV3公開、製品version変更、default切替は含まない。受入後の追加契約ADRで
新schema/state/writer/phaseを正式化してから実装する。旧ADR群を一括Supersedeしない。

初回外: 上位目標の途中変更、長期学習、NN採用、「ここぞ」の新起動条件、
新たな発話の機械効果、私的判断を表示するUI、旧戦闘一括移行、有料比較、展開。
短期の狙いは各判断で変えられるが、長期の履歴分析器は追加しない。

## 2. 成果の要求

R1: 初期目標は同じ顕在意識が、キャラの性格・価値観・認知済みの相手との関係や
状況に照らして妥当なものを導く。作者が確認したか、人間とLLMのどちらが生成したかは
妥当性の判定基準にしない。既存defaultObjectiveは判断材料であり、明示されているだけで
性格・関係より優先する拘束条件にはしない。通常は勝利を目指すが、戦闘を楽しむ、
相手を傷つけたくない等に照らして別の目標が妥当な場合はそれを許す。
既存の行動禁止規範は引き続きengineが守る。関係や性格から未知の相手属性を捏造しない。
作者確認の要求、出典証明専用のキャラ世代、出典不明による戦闘開始拒否は要求しない。

R2: 目標、能力・余力・候補・戦況から短期の狙いを定め、行動と発話を同じ意図で選ぶ。
目標文だけが変わる実装、性格名による固定分岐、Mockの台詞改善はこの成果の代用にならない。
判断要約は短い宣言的な選択理由と参照事実であり、思考全文の採取は要求しない。

R3: エンジンの合法候補・規範判定・revision commitを再利用する。狙った効果を
実効果として保存しない。自分の発話が相手に聞かれたことも、相手が動揺したことも
話者だけでは確定しない。成立発話と自己/相手が知覚した発話を既存境界で区別する。

## 3. 状態と具体writerの候補

`CharacterAgentState` 内に新世代専用 `consciousAgencyV1` を追加する候補。
別DB/ストアは作らない。旧currentGoalやinteriorから値をcastして補完しない。

| フィールド | 内容・上限案 | writer / 寿命 |
|---|---|---|
| schemaVersion | literal 1 | server / 戦闘内 |
| upperGoal | null、またはstatement(1–240文字)とbasisRefs(1–6件) | 顕在初期出力をserver受入後に一度だけ設定 / 戦闘内固定 |
| latestDecision | null、または下記accepted decision receipt | serverのみ / 最新の採用判断、履歴を増設しない |
| latestDecision.intent | aim(1–160文字)、basisRefs(1–8件)、rationale(1–240文字) | 顕在出力を検証後に採用 / 次の採用判断まで |
| latestDecision.action | 既存の検証済みAction、またはnull | server / 提案と確定効果を区別 |
| latestDecision.turn/phase | serverが設定 | server / 同上 |

参照はserverが入力に列挙した事実IDに限定し、各IDは最大96文字。
初期目標の根拠は目標候補/性格・価値/既知関係/通常勝利のID、意図の根拠はこれに加えて
知覚・自己能力・余力・合法候補のID。相手の非公開定義IDを含めない。
IDの参照成立は意味的正しさを保証しないため、R2の品質評価は別途行う。
文字数の検査規則は既存Zod string min/maxに合わせ、trim後の空白だけの文字列を拒否する。

目標を論理的に所有するのは顕在意識。永続値を書き込むのは受入server一箇所。
心理delta、adapterの便宜state、未採用proposal、narrator、相手の出力には書込み権限を与えない。
競合保存は既存CASで拒否する。再読込後も同じ型で次判断に渡ることを要求する。

## 4. 入出力とphase

入力は既存の自己profile、structuredSelf、observer-safeなdecision、turnObservation、
成立utteranceHistoryに、目標状態と限定したdecision用事実表を加える。
心理入力は正規化経験・固定traits・prior reactionだけ。能力/装備/ルール表を渡さない。
新経路では旧psychologyGuidanceの作戦・publicAim指示を心理処理へ渡さない。
目標候補と性格・価値観・認知済み関係を顕在入力へ投影する。作者確認の有無を優先順位へ変換しない。

| phase / 状態 | 心理 | 顕在出力の閉じたkey候補 | 呼出し・書込み |
|---|---|---|---|
| 新V3 prologue | 初期の有界反応、0 LLM | initialGoal / intent / nextAction / nextUtterance / realizedManifestation | 既存顕在枠1回。goalと現在の選択を同時に提案 |
| 新V3 turn | 決定的反応、0 LLM | 同上 | 既存顕在枠1回。goal未初期化時だけinitialGoal必須、初期化済みならnull |
| 新V3 aftermath | 最終確定経験への有界反応、0 LLM | nextUtterance / realizedManifestation | 既存顕在枠1回。goal/action/intent更新なし |
| 新V3 後攻再判断 | 追加心理callなし | intent / nextAction | 既存action再判断枠1回。goal変更・再発話なし |
| 旧V1/V2 | 既存phase分岐 | 既存schema | 既存writer/call/ADR-0026修復を維持 |

最初の反応には既存policyの初期値を使い、捏造した観測イベントは作らない。
afterthoughtや重要局面のLLM triggerは導入しない。新phaseへの決定的policy適用は
凍結された正規化経験だけを使い、旧心理自由文を読み戻さない。

nextUtterance/nextAction/realizedManifestationの値域は既存契約を再利用する。
新intentはactionとその発話が狙う意味を一つにまとめる。発話nullは合法。
現在のgoalとintentは公開DTO、narrator、相手入力から除外する。
後攻入力には採用goal、前のintentを「以前の提案」として、現在の知覚・候補と
既に成立した自己発話を渡す。知覚内に発話があることを「履歴がない」と取り落とさない。
再判断で以前のactionを成立済みと誤認せず、無効な候補は現時点の候補から除く。

## 5. 失敗と部分受入

新顕在出力への自動再提出callは初回では増設しない。ADR-0026は旧心理経路だけに維持。
通常call上限は既存顕在枠と後攻枠から増やさず、timeout/fallback/修復は計上から隠さない。

| 状態 | 処理候補 |
|---|---|
| 初期goal不正/欠落/無効参照 | goal未初期化を維持。intent/actionは採用しない。単独でschema有効な発話は既存規則で受入可能 |
| goalは有効、intent不正 | goalだけ初期化可能。intent/actionは採用しない。発話は独立検証 |
| intentは有効、action不正 | goal保持、actionとそのintentをlatestDecisionへ保存しない。有効発話は既存部分受入 |
| actionがnull、intentが有効 | 発話だけの狙いとして採用可能。actual effectとは扱わない |
| JSON/envelope不正・余分なkey・通信失敗 | 当該提案を採用しない。確定済み状態を保持し、既存engineの継続/fallback境界に渡す |
| 後攻action拒否/失敗 | 既存fallback。goal保持、以前の意図をfallbackの意図に流用しない。既存拒否receiptに記録 |
| CAS競合 | そのsaveの新goal/intentを確定しない。自動で新しいLLM呼出しを増設しない |

goal未初期化なら次の既存prologue/turn判断枠で初期化を再提案できる。即時retryとは分ける。
上位目標の再形成は初回外なので、初期化済みgoalへの別値は受理しない。
限定パッチの新契約が必要になった場合は、意味的影響部分も含めて別途設計し、
今回の候補承認を根拠に修復呼出しを増やさない。

## 6. 完了条件と実装順序

AC1: 性格・既知関係から目標の妥当性を評価できる入力と比較fixtureを用意する。
同じ内容なら作者確認の有無で許容目標集合を変えず、性格・関係の変更では集合が適切に変わる。
参照IDが存在するだけで意味的妥当性が証明されたとは扱わない。
AC2: 初期化→採用→保存→再読込→2回目の判断→後攻再判断で同じgoalが届く。
AC3: R2/R3をF01–F08の許容集合・採点軸で比較可能にする。入力配線成功を品質成功にしない。
AC4: 上記失敗表、同文受理、private非公開、規範、CAS、旧V1/V2/no-callの回帰を通す。
AC5: 新generationを作成時に束縛。既存snapshotを設定変更やdeployment overrideで新解釈しない。
AC6: provider operationの既存ラベルは責務名と区別し、呼出しの計上漏れがない。
AC7: 型のまま受渡し、外部JSON/DB文字列以外のJSON往復・根拠のないcastを追加しない。
AC8: 修正計画I01–I10と7タグを対応付け、旧経路に残すタグに世代と互換理由を記す。

順序は既存t029-A（型・世代・状態往復）→B（知識・顕在判断）→C（後攻・拒否）→D（総合回帰）。
新契約を既存V2へ直接足すショートカットは使わない。
default切替・provider比較は別承認。t030で品質閾値・件数・予算を固定するまで、
実LLM改善やリリース可能とは判定しない。

## 7. セルフレビュー・未知

責務のauthorityは既にAccepted。上限値・phase no-call拡張・部分受入の組合せ・
途中goal固定は今回の未承認候補で、過去承認の既定事項ではない。
独立レビューではこの4点とR1の意味的妥当性、schema世代の既存所有、再判断整合を優先確認する。
実モデルが最小入力で目的に沿う選択を出すか、上限240文字で十分かは未検証。
新V3設定選択の管理APIは受入後ADRで既存expectedRevision互換を保って定義する。
UI変更、新機械効果、長期目標変更は任意の将来候補で、初回の受入阻害条件に追加しない。
この候補とレビュー入力をownerが確認し、レビュー経路を選ぶまで独立レビューへ進めない。

## 8. revision 2の訂正出典

2026-09-09 owner指示:

> 作者が確認した目標かどうかは問題ない。
> 単に、キャラ性格と相手などの関係性から、正当な目標かどうかがポイントです。

旧revision 1 R1の作者明示目標の拘束条件化を訂正する。旧版・旧承認は履歴として保存し、
この点の現行authorityには上記指示を優先する。これは過去解釈の言い換えではなく変更である。
変更した要件bytesはstep 1へ戻し、独立レビュー済み／Acceptedとは記録しない。
それ以外のR2/R3、状態・phase・互換・無追加callの範囲は維持する。
