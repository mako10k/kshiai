# ADR-0027: 顕在意識による一貫した行動・発話と心理反応の責務境界

- Status: Accepted
- Revision: 1
- Date: 2026-09-09
- Decision owner: Product owner
- Supersedes: ADR-0004（2026-09-09の本版承認により発効）
- 正本: [同名.think](0027-unified-conscious-agency-and-psyche-boundary.think)
- 関連: Issue #98、CA-00/01/02、[実行計画](../dialogue-expression-realization.pert)、
  [影響基点](../evidence/sealgraph-psyche-baseline-2026-09-09.json)、ADR-0003/0025/0026

## Context

ADR-0004は行動選択と発話・表現を独立consumerとし、相互の生の入力・出力共有を
禁止している。しかしユーザーの意図は、同じキャラの顕在意識が目的に沿って
行動とセリフを一貫して判断することである。文面を別の意味に読み替えず訂正する。
元の文書化が誤りだったかは未確認で、過去の意図を捏造しない。

## Decision drivers

- 心理の反応更新、顕在意識の判断、エンジンの結果確定を混同しない。
- 行動とセリフを同じキャラの意図に対応させる。
- 観測範囲・非公開情報・世代束縛・旧戦闘互換を守る。
- 処理段階やAPIの数から、別々の意思決定主体が存在すると推定しない。

## Considered options

1. 行動と発話の独立判断を維持し、調整処理を追加する。
   実現可能だが、今回の要望には不要な分離制約が残る。
2. **一つの顕在意識が行動と発話を判断する。** 心理更新とエンジン裁定は分離する。提案。
3. 心理・意識・裁定・ナレーションまで一つの無制限contextへ統合する。
   権限と可視性を混在させるため不採用。

## Decision（承認済み、D1–D3）

| 責務 | 入力・判断 | 出力と権限 |
|---|---|---|
| 潜在心理の反応更新 | 正規化経験、固定心理特性、前状態から非熟考的に更新 | 有界な感情・解釈傾向・衝動と遷移根拠。戦術や発話を決めない |
| キャラの顕在意識 | 性格・価値観・認知済み関係から目標を形成。能力・余力・知識・観測を評価 | 短期目的、行動、セリフを一貫して判断。発話も同じ意識による行為 |
| エンジンの受け取り・裁定 | 行動候補・発話候補をそれぞれ検証 | 合法性・可視性等を確認し、既存規則で実際の結果を確定 |

顕在意識の内部で必要な目標・意図・知識を共有してよい。LLM呼出し数やmodule数は
固定しない。「別々の受け取り処理」は「別々のキャラの意思」を意味しない。
本ADRではconsumerという語だけでこの区別を表現しない。

潜在心理から顕在意識へは明示的な心理投影を渡す。成立した行為の結果は観測を通じて
次の心理更新へ戻る。完全遮断ではない。顕在意識から心理への直接的な調整入力は未定義。
能力仕様や作戦知識を心理モデルへ持ち込まない。

私的な目標・判断根拠をエンジンの公開結果、相手、ナレーターへ丸ごと流さない。
狙った発話効果は実効果ではなく、受け手の反応とエンジンの結果確定は各ownerが担う。

## 維持する決定と訂正範囲（D4–D5）

訂正するのは、ADR-0004の行動／発話間の独立性・相互入力出力共有禁止の制約。
ADR全体をsupersedeする際、次の節は変更前Sealを指定して継承する。

- Initial explicit model: 初期値、感度、gain/inhibition、減衰、回復、説明可能な遷移。
- Learned target model: 有界なNN変調、shadow、安定性・校正・対称性・再現・privacy等の受入、決定的fallback。
- Psyche-only character embedding: 正規化・unknown区別・canonical serialization、
  心理外情報の除外、検証済み抽出、作者が確認できる特性と有界なembeddingの役割。
- Version and battle binding: schema、policy、profile、normalizer、embedding、weights、
  quantization、fallbackの不変世代。旧戦闘は束縛済み世代を維持。

行動向け／表現向けの異なる傾向値を残しても、顕在意識のowner分割は要求しない。
研究資料は依然として未採用候補。NN学習・採用は本ADRの承認範囲ではない。

変更前Seal: `5a65ee9aeb1c0b082985e0e320521d014a7211ff0f4d8e50da4ebc8e10e56957`。

V1通常turnの心理no-callを維持し、feature不足で自動LLM昇格しない。
既存prologue/aftermath・旧世代経路は互換保持。「ここぞでLLM」の新条件は、
起動条件・責務・入力・回数・費用・失敗時挙動・世代束縛を別途設計して承認する。
本ADRだけで通常turnへの新しいLLM呼出しを追加しない。

## Consequences

期待する効果: 行動とセリフの一貫性を顕在意識の責任として扱え、心理を戦術思考へ
拡張せずに済む。これは設計上の期待であり、実LLMでの改善は未検証。

費用とリスク: currentGoal、beliefs、appraisal、ExpressionBriefのwriter・寿命・
出力schema・受け取り口を具体化する必要がある。意識内部の共有範囲を広げても、
公開先への情報漏洩や心理モデルへの知識混入を許可したことにはならない。

## Compatibility and migration（D6、D8）

初回はCA-01＋最小CA-02と7タグの移行方針を対象とする。非Compact／旧戦闘は
互換として残せるが、残存理由・対象世代を記録する。7タグを消すだけでは完了でない。
具体schema・世代・call構成は未決で、計画上の設計・受入を経る。
ADR-0025/0026の履歴、同文受理、commit、限定修復の既存契約は維持し、
修復closureを暗黙に広げない。本ADRの発行だけでruntime変更・展開は行わない。

提案時は独立したREFに旧SealをCauseとして記録した。本版の承認により旧ADRをSupersededとし、
論理REF `adr/psyche-boundary` を後継へ継続する。元Sealを保持し、確認した新旧revision
assertionとscopeを記録してstaleを確認する。変更前impactは下流15 REF。
各資料を確認してからrelink/resealし、Accepted文書の訂正はそれぞれの手順で行う。
未登録依存関係は未確認であり、グラフが全件を保証するわけではない。

## Verification（D7）

- 性格・既知関係に応じた目標と、行動・セリフの整合。
- 能力・余力・距離に応じた妥当な判断と、エンジンの独立した可否検証。
- 心理特性・前状態・正規化経験が同じなら、能力metadata変更だけでは心理更新が不変。
- 非公開情報、心理有界性、世代/replay互換、通常turn no-callの回帰確認。
- 契約テストと実LLM評価を区別。有料実行は別承認。

## Review / Implementation references

発行時セルフレビュー: 元ADRと訂正箇所を区別し、無関係な保護制約は継承した。
顕在意識の統一は「1回のLLM呼出し」や「潜在心理との完全遮断」を意味しない。
独立した本版レビューは未実施。ownerは0004との比較後に本版を明示承認した。実装は未着手。
承認対象は正本.thinkのADR-0027 revision 1、承認前SHA-256:
`74606d5bb31688b42c2ed228268e1f8d7976caac59fd328443f04949f054f055`。
正本のD1–D8は書き換えず、OWNER_ACCEPTANCEとACCEPTANCEを追加した。
