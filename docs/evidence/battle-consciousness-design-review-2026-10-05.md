# 戦闘意識パイプライン基本設計v1：レビュー・検証記録

この記録はv1時点の履歴。経済性改訂v2の結果は[別記録](battle-consciousness-economy-review-2026-10-05.md)を参照。

2026-10-05。対象は議論要件投影v1、基本設計v1、ADR0050 Proposed revision1。所有者の設計作成指示に基づくローカル資料。Accepted化・実装・provider実行・配備・pushは実施していない。

## レビュー境界

現在の義務は、所有者発言U01–U12の忠実な投影、六状態とwriter、自然文コンテキスト、潜在状態の簡潔さ、顕在度による情報境界、非同期合流と意欲／実結果の区別、未決定の基本契約の露出。後続詳細設計は具体型・SQL・workerコード・数値policy校正を担う。基本設計の候補を受入済み規則として扱わない。

同一rootのread-only reviewerが、既存ADRの境界確認と本Draftのレビューを実施した。投票や第三者のowner受入ではない。

## 指摘と反映

| 区分 | 指摘 | 処置 |
|---|---|---|
| INSIDE | 行動後の知覚と行動前の潜在投影を顕在入力で混ぜる時点が不明 | Aの知覚と既存の感覚投影を固定。投影のsource時点を表示し、今の外界観測にしない |
| BOUNDARY_DISPUTE | 潜在応答と世界更新の後に顕在を起動する順序が所有者の並行開始意図に対応するか | 今回潜在応答を待たず、既存投影から並行開始する案を§8/D05へ。最新投影を待つ代案との判断をQ01へ |
| INSIDE | 現在顕在度を保持・意味更新するownerが不明 | 潜在stateのメタデータとし潜在LLMが更新する候補を§5/D06へ。顕在は働きかけを提案し、Q03でowner配分を確認 |
| OUTSIDE | TypeScript/SQL、具体的な強度尺度・期限・減衰、model/reasoning・費用の数値 | 未決定一覧と後続詳細設計へ。今回のDraft提示に追加実装を要求しない |

変更部分の再確認では重大なINSIDE指摘は残らず、Draftとしてレビュー可能との結果。受入、実モデル品質、実装適合、配備可否を証明する結果ではない。

## 検証

- ADR0050のinstalled command-line `llmthink dsl audit`：fatal0/error0/warning0。pending owner decisionと未測定品質をinfoとして保持。sourceの参照・可読性に関するhintは受入証明ではない。
- `git diff --check`：成功。新規資料の内容も個別readbackして確認。
- `npm run adr:check`：新0050を含むcurrent sourceの監査は進んだが、既存ADR0039のAccepted markers不足で全体失敗。具体的にはOWNER_ACCEPTANCE evidenceとACCEPTANCE decisionが必要であるという既存整合性問題。今回の案を通すために0039のAccepted rationaleやmarkerを改変しない。
- runtime sourceを変更していないため、build/typecheck/unit/provider/ブラウザー検証をこの資料変更のために追加実行していない。

0039問題の推奨対応は、別の限定資料整合確認で元のowner受入証跡と.think/projectionを照合し、根拠があれば正本から記録を整えること。受入事実を捏造しない。暫定内部工数10〜20分、確度低。Draft0050の議論・レビューを止める理由にはしない。

## PERTと計測

既存 `docs/dialogue-expression-realization.pert` のdocument check、schedule both、next、observe-velocityを実行。古いt029がactiveであり、現在の設計作成へ読み替えない。観測できたsampleはt013の2026-09-09T16:44:25〜16:44:48、1p/23秒のelapsed throughput。provider replayの23秒であり、今回の設計作業のactive effort予測には不適合。declared effortは欠けている。旧宣言velocityを実測設計速度として採用しない。

t034/m034を単純追加する最初のpreviewは「finishへ到達しないmilestone」を検出した。既存production finishへ意味のないgateを足して回避しなかった。

代案として、完了済みの `docs/speech-continuity-and-fade-recovery.pert` に今回の**資料作成だけ**を追加する[atomic batch候補](battle-consciousness-design-plan-candidate-2026-10-05.json)を作成。既存repair/verify/releaseとLIVE証拠は保持し、finishをDESIGN_DRAFT_READYへ拡張、LIVE→DESIGN_DRAFT_READYのdesign-draft（暫定0.75h）を追加する。architecture受入・実装・公開のtaskは追加しない。

CLI batch preview成功、candidate document check成功、precedence/resourceいずれも0.75h、nextはdesign-draft。これは資料作成前の計画候補としての数値であり、完成済み資料の残工数ではない。hour単位deprecatedと既存完了milestoneのclosure warningは残る。正本へは未適用。どのaccepted parent scopeを今回の新案へ更新するかというowner判断をcandidateだけで決めないためである。新しい実行台帳は作成していない。

今回の観測開始は11:18:03 JST（開始時worktimectlのstart08:53:56＋presence8647秒から算出）。標準task startをtemporary candidateに記録できた。正本へのwork-event記録・velocity反映はscope整合待ち。active time/agent effortはelapsedから推定して記録しない。標準task finishもtemporary candidateで成功。終了11:54:04、経過2161秒（36分1秒）を[計測JSON](battle-consciousness-design-measurement-2026-10-05.json)へ保存した。再observeはtemporary candidateのGit履歴が利用できず失敗し、velocity未取得。temporary candidateの完了・再観測は正本反映とは区別する。

次checkpointは所有者によるQ01/Q02と正本scopeの判断時。この時点で候補・実績を正本の標準mutation経路へ対応させ、再度observe-velocity/check/schedule both/nextを行う。履歴記録と予測更新は未完了であり、読み取りをしただけでvelocity適用済みとしない。

## 成果と残工数

今回の依頼「レビュー可能な設計案を作る」は完了、残作業0。受益者は所有者で、議論が責務・相互作用・未決定契約に整理され、候補を比較できる状態になった。プレイヤーが使える新runtimeの実現価値は0であり、Draftから品質改善を主張しない。

次の対象は設計判断Q01〜Q08の合意と基本設計の確定。Q01/Q02の比較・修正30〜60分、残契約の整理30〜60分というagent暫定見積もりで内部工数1〜2時間、確度低。owner応答待ちの期間は未算出。詳細設計・実装・実モデル比較・配備の工数は、この設計作成依頼の残工数には含めず、採用scopeが決まった時点で計画化する。
