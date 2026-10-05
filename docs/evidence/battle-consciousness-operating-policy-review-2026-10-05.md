# 運用契約候補v1のレビュー記録

対象：運用契約候補v1、ADR0050 Proposed revision3 D09/D10、および要件投影/基本設計の参照追加。現在の義務は所有者が進行を指示した起動・遅延・予算・有限失敗の具体化。数値受入、Q03–Q06の残る製品判断、型/SQL/worker実装、有料モデル比較は後続。

所有者の経済性方針への「OK」と、契約具体化を「進めてください」を作成根拠とする。新しい数値やADRの正確なrevisionの受入とは記録しない。

## レビューと訂正

同一rootのread-only reviewerが3件のINSIDEを報告。以下を修正し、同じ3件に限定した再確認で重大なINSIDEなしとの報告を受けた。レビューは所有者受入ではない。

1. 初回顕在のtimeout・終了不明slotは初回deadlineでincomplete。受理済み思考がある場合もunknown slotの継続を最大3tick/5秒の早い方へ制限。遅着判断は不適用、slotと会計はoutstandingを保持。
2. 実況の36秒算式は次の1batchへ収まる場合のみ。queue込みのreceipt公開deadlineを別に36秒とし、deadline超過時は実況不完了。call/drainは残る公開期限/試合期限も満たす。
3. ADR0006は既に正準先行commit・実況独立を持つと訂正。新変更は最大3receiptの生成batchとsource coverage、ADR0016 eligibility。既存public battleId/turnReceiptIdとreceipt別terminal snapshotを保持。

OUTSIDE：数値の品質校正、providerの強制token/最大課金契約、顕在度・意欲尺度・発声・移行の未決定事項はそれぞれ運用候補§8、Q03–Q06、後続詳細設計へ。BOUNDARY_DISPUTEの未解消指摘はないが、candidateの数値/終了動作は所有者未受入。

## 観測・検証

- 新鮮なworktree readback：cc304-focused-revise、HEAD3a32c2deb575600f81caa0b206f2e6a2ccd319d2。main worktree secdatのsecret GH_TOKENをdry-run確認後にfetch。trackingとの差は0/0、origin/main933e6aef。既存dirty trial資料は保持。
- authoring CLI DSL audit：fatal0/error0/warning0/info1/hint15。
- ADR0050 revision3 CLI DSL audit：fatal0/error0/warning0/info1/hint75。初回は表示上限によるoutput_limit errorがあり、limit1000で全件再監査して解消。hintは意味的受入を供給しない。
- 個別ADR pair checker：1 current file passed、Proposed。ローカルリンクとdiff whitespaceを確認。文書のみのためruntime test/有料モデル実行なし。
- 既存子PERTを標準batchでpreview/apply。旧repair/verify/release完了とLIVEを保持し、policy-draftのみ追加。owner proceedによる設計作業範囲の整合であり、上位pj001の製品受入や配備は変更しない。
- PERTの最初のapplyはowner assertion不足PTGOV101でwritten=false。scopeを確認済みのuser actor/owner assertionを指定した正規previewとdigest-guard applyで実施。検証回避やDSL手書きはしていない。
- 既存pj001 velocity観測：t013のみ1p/23秒のdeclared elapsed throughput。replay実行で設計作業のactive effortではないため、今回の設計見積もりへ採用しない。今回の開始/完了は標準taskイベントで記録。観測経過430.91346秒、active time/effortは独立計測がなく未知。完了後のvelocity観測は新taskのgit baselineがまだないためmissing_baselineで利用不可、正準velocityは変更していない。次checkpointは所有者が候補を判断した後の詳細設計開始時で、コミット済みbaselineを確認し、active timeを独立計測して観測を更新する。今回の工数を経過から推測しない。

## 次の判断と価値

この設計具体化taskの残りは0。プレイヤー向けruntimeの実現価値はまだ0で、今回の貢献は採否を判断できる契約候補。試行用数値の受入、Q03–Q06、詳細設計、実装、品質/費用比較が残る。次は運用候補の所有者レビューを行い、採用する起動/停止/予算値を固定する。そこから詳細設計へ進む内部工数は暫定2–4時間、低信頼度（型/状態遷移1–2時間、検証/契約対応1–2時間というエージェント概算）。有料比較の実施時期と予算は今回決めない。

完了後の正準PERT document check、precedence/resource両schedule、dag nextは成功。policy-draftはdone、子計画の残工数0、開始可能taskなし。既存hours単位の非推奨とreached closure警告は保持し、無関係な単位移行/advanceを行わない。
