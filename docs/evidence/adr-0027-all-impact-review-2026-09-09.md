# ADR-0027 revision 1 — 登録済み影響先の全件確認

2026-09-09。確認完了／訂正・有効なresealは承認待ち。
対象は[変更前基点](sealgraph-psyche-baseline-2026-09-09.json)の15下流REFと、
追加した提案正本・投影2 REF。登録外を含むrepository全体の完全監査ではない。
元資料16件＋提案2件は全18件が現在のSealと一致した。

## 評価基準

基準はProposed ADR-0027 revision 1のD1–D8。正本SHA-256:
`74606d5bb31688b42c2ed228268e1f8d7976caac59fd328443f04949f054f055`。
「維持可」はこの責務訂正に対する判断であり、未実装部分の完成や全面的な品質保証ではない。
旧世代契約の記録と新しい設計の制約を分け、Accepted ADRの理由を後から書き換えない。

## 初期15件の個別判定

パスとSeal IDは基点JSONと[登録表](../sealgraph-registration-v1.json)で固定している。

| REF | 判定 | 確認根拠・必要な扱い |
|---|---|---|
| adr/character-focus | 維持可・旧scope限定 | ADR-0008 Decision/Compatibility/Verification。focusによる行動変更禁止、no-call、shadow限定は維持。表現の生成担当を独立した意思と解釈しない。新しい顕在判断へfocusを接続する承認ではない |
| adr/structured-character | 維持可 | ADR-0011 Psyche and conscious access/Public profile and consumers。既にconscious action/expressionへ限定したeffectを渡す。raw interior排除と認知済み属性・公開範囲は統一意識でも維持 |
| adr/expression-state | 維持可・既存契約限定 | ADR-0025正本d001–d005。意味状態／発話履歴分離、同文受理、閉じたschema、revision commitは新しい責務とも両立。具体的旧入力型の存在を新ownerの規定にしない |
| projection/adr-0025 | 維持可 | Markdown Decision/Compatibilityは上記正本と整合。私的状態と成立発話が別出力であることは、意識が別々であることを意味しない |
| adr/psyche-repair | 維持可・既存契約限定 | ADR-0026 D1–D6。限定修復は現行Compact契約の保護。新ownerにclosure・回数を自動移植せず、変更時は別途設計 |
| projection/adr-0026 | 維持可 | 正本と同じbounded repair、旧戦闘互換、one-attemptを記述。consumer schemaは検証契約を指し、独立した意識という意味ではない |
| design/psyche-reaction | 訂正必要 | §1.3、§3.1/3.2、§5.3、§16。独立consumer・action proposal非共有の一般制約と図を、心理投影→一つの顕在意識→候補の検証へ整理。数値モデル・privacy・世代は維持 |
| design/psyche-slice | 訂正必要 | §1、§6、§7.1、§10。旧V1の別projection・呼出し契約は互換scopeへ限定。新設計での顕在意識内共有まで禁止しない。no-callと心理専用入力は維持 |
| design/agency-responsibility | 訂正必要 | §1/2/3/5。戦術判断と発話意図を別ownerの候補として対置した部分、相互raw context非共有の設計前提を訂正。具体module/call構成は引き続き未決 |
| backlog/character-agency | 訂正必要 | 優先順位前の責務整理段落。生context共有禁止を、心理／顕在／公開先の境界に言い換える。CA-00以降の機能希望と優先順位自体は維持 |
| plan/dialogue-expression | 訂正必要 | t027、t028、t029。独立action/expressionの制約から統一意識の設計・受入へ変更。ADR-0027の発行と承認待ちを反映。既存完了タスクは巻き戻さない |
| implementation/psyche-schema | コメント訂正必要・動作維持 | CharacterDeepPsycheSchemaのPSYCHE-RESPONSIBILITYコメント。別consumerの曖昧さを取り除き、心理反応と顕在判断を区別する。型・runtime変更の実施ではない |
| implementation/llm-types | 維持可・互換記述 | CharacterDeepPsycheExpressionStateV2前のコメント。currentGoal等をV1 reactionに含めない判断は維持。具体writer/lifetime未決はADR-0027 D6でも残る。実装配置の変更完了とは扱わない |
| implementation/battle-service | コメント訂正必要・動作維持 | toExpressionInput前の「行動・発話は独立consumer」を訂正。残り2タグのno-call／心理へ知識を追加しない制約は維持。現行ルーティングとpayloadは互換として残す |
| implementation/llm-adapter | 維持可・互換記述 | Compact/full phaseRule前の2タグ。既存goal生成指示は暫定配置、心理は反応更新という説明は両立。実際のprompt移管は具体設計後であり、今回resealで完了を主張しない |

集計: 訂正必要7 REF（設計・計画5、実装コメント2）、維持可8 REF。

## 追加された提案2件

- `proposal/adr-0027`: D1–D8とpendingを確認。統一意識と心理／エンジン境界、
  継承制約、旧世代互換、未定義triggerを区別。独立した本版レビューではなく今回のセルフ確認。
- `projection/adr-0027`: 正本と内容・Proposed statusが一致。supersedeは承認後と明記。

## resealをまだ行わない理由

上流はProposedで、正本D8とADR手順は正確な版のowner承認を前提にしている。
最新指示は影響確認・resealの実行指示だが、設計レビュー・続行指示をADRの正式受入へ
自動変換しない。既存HEADへ確認文だけを追加しても有効な後継への移行確認にはならない。
全件を新根拠で成立済みと扱う前に、ADR-0027 revision 1の承認を確認する。

承認後の対象: 上流supersede・論理REF継承、7資料の訂正、8資料の互換維持判断を
個別Causeに記録、revision assertionを指定したreseal、実際のstale/impact/fsckの再確認。
旧Accepted ADRの本文理由は書き換えない。必要な根拠更新と歴史保存を区別する。

CLI LLMThink: `adr0027-all-impact-review-2026-09-09`、fatal/error/warning=0。
今回、元資料・source binding・既存Seal/REFは変更していない。初期stale=0は
訂正後の完了証拠ではない。新しいレビュー記録だけを追加した。
