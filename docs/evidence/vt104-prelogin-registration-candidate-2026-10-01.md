# ログイン直前の準備 — workflow登録候補

2026-10-01。所有者の「4の手前まで」により、既存branchへの同期と試用環境準備を開始した。Googleログイン・owner登録・候補確認・実対戦はまだ行わない。

## 観測

- local/originの開始SHAは03ef49c8073731b6b058a22637aefd6db0bdaeb5。mainはe31c487dadbe784022e5cfde80d3314ce45485b9。既定branchはmain。matching PRなし。
- 新しいworkflowはhosted workflow一覧に存在せず、origin/mainにも存在しない。GitHubの[手動workflow実行仕様](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)では既定branchへの登録が必要。
- ローカルgcloudのactive accountはmako10k@mk10.org。service/queue読み取りは再認証要求で失敗したため、稼働状態は未確認。別accountへの切替や認証設定変更はしていない。
- accepted source manifest563件を個別SHA256で再照合し、不一致0。aggregateは8b4b84783e617cac1fe1ec42ca1dfc1da937070c532e2904e0d02253417cfa00。コード変更なし。既存ローカルテスト226件・workflow診断28件の証拠を維持する。SealGraph fsck result=ok。

## 追加判断が必要な具体候補

推奨はmainへ **.github/workflows/v3-trial.ymlの一ファイルだけを追加する** 登録。現在の実装そのものを使い、別方式の配備や検証省略へ変更しない。

- 起点: fresh origin/main（開始観測e31c487）。作業branch候補codex/v3-trial-workflow-registration、既存branch有無・preflightを確認してから作成。
- 追加file SHA256: 911ccaa02daf6457ea735c712da3f2c40a9e0c7a3a8a3e18808946124fd0df98。
- 完全な一file差分: vt104-prelogin-workflow-registration-2026-10-01.patch。
- 外部作用上限: 新branch一つ、branch push一回、PR一件、同PRのmerge一回。mainの本体ソース・他workflowを変更しない。main CIはpush/PRにより起動するが、Cloud配備はworkflow_dispatchまで起動しない。
- 専用workflowはownerによる同じrelease tagからのdispatchのみを受け付け、prepareではimage作成、deployでは期限付きexact packetを要求する。
- branch作成・PR・main mergeは今回の手順説明に明示していなかったため、実行前にこの候補への所有者判断を求める。試用のために広いWIP branch全体をmainへmergeする代替案は推奨しない。
- 完了条件: merged mainの一file差分とSHA256を読戻し、GitHub workflow登録を再確認する。新tag番号・tag SHA・四CI・dispatchは別途実値を固定する。

## cloud確認の再開

ローカルの読み取り用認証を復旧するには、所有者が端末でgcloud auth loginを実行し、既存mako10k@mk10.orgを再認証する。秘密値をchatへ送らない。認証が復旧したらservice/queue/secret参照を再読する。GitHub workflowは既存のWIF経路を使うため、このローカル認証失敗だけでhosted認証失敗とは判断しない。

旧unfinished処分は対象IDと関連rows、writer停止、移行一覧と費用上限の観測が先。登録承認をDB全削除やpaid実行の許可へ流用しない。Google redirect等の設定変更が必要ならexact値を提示する。

残内部工数は今回のログイン直前準備0.75–2 agent h、初回試行1.5–4.25 agent h、親csm0014.5–11.25 agent h（低確度、外部承認・再認証待ち別）。次の計測checkpointはworkflow登録の独立readbackと実cloud packet確定。vt104は完了にしない。
