# ADR-0027承認後の実装影響

2026-09-09。実装由来の影響調査であり、runtime改修・有料試験は未実施。
ADR-0004のみSuperseded。ADR-0008/0011/0025/0026は、既存scopeの維持が可能なため
自動的にSupersedeしない。新しい具体契約がそのscopeを変える場合に追加判断する。

## 結論

現在の`OpenAiCompatibleProvider.advanceCharacterAgent`は、同じ呼出しの結果から
`nextUtterance`と`proposedAction`を返す。実装は既に一部統合されている。
「独立した二つの意識を新規統合する」全面改修とは限らない。
主な未実装課題は、心理LLMに残る目標・発話意図のowner、顕在意識の入力知識、
状態の書込み先と寿命、処理途中で行動が変更された場合の一貫性である。

## 影響箇所

パスはbackend/src/以下（sharedはpackages/shared/src/）。

| 箇所 | 確認した現状 | 次の具体設計で必要な判断 |
|---|---|---|
| services/battle-service.ts: advanceCharacterAgents / toPsycheInput / toSpeechActionInput | 心理更新の後で意図briefを発話・行動処理へ渡す。Compact psycheにdecisionはなく、顕在入力にcurrentGoalの直接投影がない | 新世代の目標・戦術・発話意図を顕在意識の処理へ配置。心理には知識を追加しない。prologue/turn/aftermathのwriterと寿命を固定 |
| llm/types.ts / shared/battle.ts | 旧心理型がcurrentGoal等を含み、意識入力はexpressionState中心 | 旧型を保持したまま、新しい意識状態・出力型と世代境界を決める。単純renameや型キャストでは解決しない |
| llm/openai-compatible.ts: advanceCharacterPsyche | Compact/fullのprologue指示がgoal/strategyを生成。repair closureも旧appraisal/briefに依存 | 新世代で担当を移す。旧promptは保持。修復対象の意味依存が変わるなら新契約として扱う |
| llm/openai-compatible.ts: advanceCharacterAgent | 既にセリフと行動を一緒に返す。戻りstateのcurrentGoalは空文字で、service受入はpreviousを保持 | 既存経路の再利用を優先評価。goalの出力だけ追加しても保存されないため、受入・永続化も一緒に設計 |
| llm/character-expression-prompt.ts | private stageが選んだrelationshipMove/publicAimを表現する指示 | 同じ顕在意識による目的・戦術・発話判断へ変更する対象。現時点では文字列を変更していない |
| services/battle-service.ts: buildCharacterDecisionContext | 合法候補、cost/cooldown、decisionProfile、tacticalNeed、行動feedbackを構築 | 既存投影を再利用し、射程・回復・順序など必要な不足分だけ束縛済み定義から追加。性格の単純な勝利優先fallbackと作者指定の関係を確定 |
| services/battle-service.ts: decideCharacterAction呼出し（later bucket） | 逐次処理の途中で行動だけ再判断し、不正・失敗時には決定的fallback | 一つの意識の再判断として意図・先行発話との関係を設計。発話を無条件に追加・再生成せず、既存予約／実行済みの区別を維持 |
| services/battle-service.ts: validateCharacterActionProposal / acceptCharacterAgentResult | 行動を独立検証し、不正な行動でも有効な発話は受理できる | 「実行予定を語ったが行動が拒否された」場合を評価。実効果を語った扱いにしない。既存の同文受理・部分拒否契約を勝手に変更しない |
| llm/mock.ts | Compact V2は観測の言い換えとproposedAction:nullを返す | 新型の配線テストに合わせる必要。Mockの出力変化を実LLMの改善証拠にしない |
| provider-operation分類・trace・replay・世代束縛 | 既存段階名とcall上限、旧契約が保存される | call数・段階を変更する場合のみ追加調整。新旧証拠の混用や旧戦闘の自動移行をしない |

## 維持するもの

心理のdeterministic no-call条件、エンジンの可否・結果確定、相手の認知境界、
revision compare-and-save、旧Compact/full契約、同文発話受理、旧repair上限。
今回の変更は資料と2ファイルのコメントのみ。runtime修正完了とは報告しない。

## 検証対象

既存のbattle-speech-wiring、battle-consumer-wiring、character-expression-contract、
openai-compatible-psyche-repair、action-feasibilityのテストを起点に、目的の初期化・
伝達・保存、性格／関係／余力／射程の一変数比較、later-bucket再判断、候補拒否、
Mockとproviderのschema一致を追加する。具体fixture・閾値はCA-00/t027で固定する。

初期Seal範囲外から見つかった直接影響先はcharacter-expression-prompt.tsとmock.ts。
今回この2ファイルも追加登録する。その他の検証・trace領域は設計時の候補であり、
全ファイルを棚卸し・登録済みとは扱わない。
