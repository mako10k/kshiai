# 構造化意味オーサリング・カーネル設計 v1 — Revision 5受理記録（全文日本語訳）

- 日付: 2026-09-15
- 正本: `structured-semantic-authoring-kernel-design-v1-acceptance.think`
- 現在の受理対象: D11実装設計候補 v1 revision 5
- 対象Seal: `69c9c98937d7…`
- 訂正済みレビューSeal: `fc58bf3b2f9a…`
- 履歴対象: 2026-09-11に受理されたrevision 2と、その後の数値policy権限訂正

## 問題

訂正済みの独立PASSレビュー後に、オーナーがD11設計revision 5を受領し、継続を指示した後の
ライフサイクル状態と権限境界を確定する。

## 履歴として維持するRevision 2受理

- 設計Seal `c4f8cb366d78…`は、2026-09-11に受理されたD11実装設計revision 2である。
- 履歴レビューSeal `d7144b116dec…`は、正確なrevision 2をP0〜P3指摘なしのPASSとした。
- 2026-09-11、再レビュー結果の提示直後に、製品オーナーは`ACCEPT`と回答した。この受理は
  当時の`cb215`設計ゲートを完了したが、実装または外部effectを認可しなかった。

これらは新しい受理によって消去せず、Sealgraphの不変履歴として維持する。

## 数値policyに関する権限訂正の維持

当初の記録は、2026-09-11の一括`ACCEPT`が、1試行8 provider call、500,000 micro-USD、
1試行240秒、1 provider call 60秒、owner回答待ちの公開投影、入力元からの再構築、進捗閾値にも
個別の権限を与えたと解釈していた。

2026-09-15、数値上限と影響を改めて提示したところ、製品オーナーは上限が初耳であると指摘し、
特に時間条件による打ち切りを厳しいと評価して修正を指示した。受理済みADR-0032は、ADR-0031の
時間以外の実行制御を維持しつつ、根拠のないprovider callおよび試行全体の経過時間deadlineを
置き換えた。

Revision 5の受理はADR-0032を取り込み、拒否された60秒provider deadlineまたは240秒の
whole-attempt deadlineを復活させない。

## Revision 5の証拠

- 受領対象は、Seal `69c9c98937d7…`、workfile SHA256
  `426470047d0e380de90624192b9db71d3f30788fa44423ed0710f9cb1e6cdba4`の正確な実装設計
  revision 5である。
- 訂正済み独立レビューSeal `fc58bf3b2f9a…`は、P0、P1、P2、P3すべて0件でPASSとした。
- このレビューは、移行の意味的厳密一致または未受理の形式的materiality proof protocolを
  要求しない。
- 2026-09-15、訂正済みPASS結果と訂正範囲の提示直後に、製品オーナーは継続を指示し、設計を
  受領すると述べた。この受理は正確なrevision 5と訂正済みレビューに結び付く。

## 権限境界

今回の受理は、正確なD11実装設計revision 5を現在のreview済み設計として確定し、現在の設計
ゲートを完了する。設計受理だけでは、実装、provider call、評価、deployment、本番移行、候補
受理、pointerまたはpolicy activation、rollback、release、後続タスク開始を認可しない。

同じ2026-09-15の明示的な「進めてください」は、受理記録後に、すでに選択済みのローカル
`cc304`だけを再開する別の権限である。有償provider call、deployment、activation、`cc305`は
認可しない。

次の事項は後続ゲートに残る。

- runtimeのF9適合性
- 実create/revise/migrate経路と認証済みanswer/retryの接続
- 完全candidate reconciliationとcontrolled HTTP/UI証拠
- provider品質評価、Stage proof、deployment
- 本番migration、pointer変更、最終schema 3 cutover

設計受理は、これらが実装済みまたは完了した証拠ではない。

## 決定

1. Revision 2の設計、レビュー、受理を履歴として維持する。
2. 数値policyの権限訂正を維持し、拒否済みの経過時間deadlineを復活させない。
3. 正確なD11実装設計revision 5を、現在のreview済み設計snapshotとして受理する。
4. 既存の除外条件を保持したまま、選択済み`cc304`のローカル実装・検証だけを再開する。

## Revision 6受理追記

- 対象設計Markdown SHA-256:
  `a0f2ba909d3c71fb7de2235bd84125b420663f6f8b5400c4236eaf92e832ebff`
- 対象設計reasoning SHA-256:
  `69eb577b09356a3806fd08325a9c73b78e6c864aa78e2947c489dff706b69f6d`
- 対象ADR-0033 revision 1 SHA-256:
  `ae8b736857b59188880acbf397e2da941caf5c102539b2410ddd7011fd1f529a`
- Review reasoning SHA-256:
  `cdd328284fd76310ef28dfaff0f59c2e7cf559828c738a3a71c85839be1567d3`
- Review結果: PASS、P0〜P3 0件

2026-09-15、PASS結果、完全な日本語review範囲、および`ACCEPT`がADR-0033 revision 1と
設計revision 6の双方を受領するという明示の直後に、製品オーナーは`ACCEPT`と回答した。

これにより、正確な実装設計revision 6を、受理済みADR-0033 revision 1に適合する現在の
設計snapshotとして受理する。Revision 5は不変履歴として維持する。

具体的なprovider timeout、worker lease、有限transport-recovery値は未決のままである。
実装時には、Config identityまたはConfig snapshotを永続化せずに、再起動後のworker lease
失効を判定できるclaim時刻、期限時刻、または同等の永続事実を保持する。

この受理は、実装、commit、push、provider call、deployment、migration、activation、rollback、
releaseを認可しない。
