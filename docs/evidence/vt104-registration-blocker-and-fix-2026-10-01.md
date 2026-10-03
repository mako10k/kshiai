# workflow登録の進捗と二ファイルの修正候補

2026-10-01。所有者はworkflow一ファイルのmain登録と、そのためのbranch/PR/mergeを許可。GCP再認証済との報告後、APIとqueueの読み取り成功を独立確認した。

## 登録の実績

main e31c487からcodex/v3-trial-workflow-registrationを作成。既存の未同期・固有branchは保持し、隔離理由付きpreflightを確認した。一ファイル438行のみをcommit8afaea1124874efc8018007567085d791eca7e6bとして一回pushし、remote SHA一致を確認。[PR151](https://github.com/mako10k/kshiai/pull/151)を作成して当chatへattachした。v3-trial.yml SHA256は911ccaa02daf6457ea735c712da3f2c40a9e0c7a3a8a3e18808946124fd0df98で承認候補と一致。

CI run36805863734はvalidate/backend-image/worker成功、security失敗。main protectionは四checkを要求し、enforce_admins=true/strict=true。mainは依然e31c487で、mergeやdispatchは未実行。

## review boundaryと対処候補

現在の対象は承認された一ファイルの登録とmerge条件。INSIDE: security失敗はmerge条件を満たさない。OUTSIDE: source本体の配備、release tag、exact cloud/DB packetは登録後の実行段階。BOUNDARY_DISPUTE:なし。依存更新は一ファイル登録の作用範囲へ自動追加せず、具体差分で別の所有者判断を求める。

securityの実ログは既存override undici7.29.0についてadvisory1239933(moderate)、1240041(high)、1240050(high)を未受入として検出した。これはworkflow追加による新しいdependencyではない。[undici maintainerの修正情報](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3)と[WebSocket修正情報](https://github.com/nodejs/undici/security/advisories/GHSA-rfgv-xxqx-mfg5)は7.29.1をpatched versionとしている。

具体候補はpackage.jsonのoverrideを7.29.0から7.29.1に変更し、package-lock.jsonのundici version/resolved/integrityだけを更新する二ファイル。完全な差分は[patch](vt104-registration-undici-7.29.1-candidate.patch)。他packageの更新、例外追加、検査省略は含まない。

既存PR151へこの二ファイルの一commitを一回pushし、最終差分をworkflow+二manifestの三ファイルとしてtitle/bodyを更新する候補。四CI成功とhead固定を確認後、既に許可された一回のmergeを実施してmainファイルとworkflow登録を独立readbackする。二ファイルの外部追加は未実行。

隔離した候補/tmp/kshiai-undici-registration-candidateでnpm install --package-lock-only --ignore-scripts、npm ci、check-npm-audit成功・advisory0、npm run build:worker成功（wrangler dry-run、実uploadなし）、npm run typecheck成功、npm run build成功、npm test112件成功（90+13+9、fail0）。この112件はmain0.22基底の依存修正候補の検証であり、cc304 V3 source226件と同じ集合ではない。Node25.1.0でのローカル確認であり、hosted Node22のCI成功とは別。初回scratch testはdisposable SealGraph runtime未準備で起動失敗したため、CIと同じprepare-test-authority-runtimeと全buildを先に実行して再検証した。既存chunk size警告とnpm install-scripts警告を保持する。

## cloud/DB観測

serviceのpublic trafficはkshiai-api-00141-visに100%、tag78件、manual0の指定なし。queue RUNNING、bounded task list1件の読取は空。最新job一覧は四jobのlatest execution完了を示すが、全writerが停止した証拠ではない。Cloud Scheduler APIはdisabledと応答し、APIをenableしていない。

DIRECT_URL secret version1への端末直接接続はENETUNREACH。既存DATABASE_URL secret version1のpooler経由でBEGIN READ ONLY/ROLLBACKによりinventory成功。秘密値はfile/chatに保存していない。CA検証を有効にしたpooler接続の実観測は[DB inventory](vt104-prelogin-db-inventory-2026-10-01.json)。

未完了battles18件、pending/dispatched narration outbox22件（完了済対戦14件/その他8件）。他のprovider/narration/authoringの対象backlog countsは0。SQL適用済checksumの不一致0、pendingは0026_character_focused_authoring_payloads.sql、0027_character_revision_scope_resolution.sql、0028_semantic_authoring_provider_timeout.sql、0029_battle_discard_receipts.sql、0030_cutover_control.sqlの五本。これは稼働中の一時点inventoryであり、停止後のquiescence証明へ流用しない。

完了済対戦に属する14outboxは未完了対戦処分と同じ対象とは扱わない。旧writer/tag閉鎖、18対戦と関連rowsのexact処分、完了済対戦の残outboxをどう閉じるか、pending migration、secret numeric versions、source/tag/prepare identityと費用範囲を固定してから実配備へ進む。今回cloud/DBへのwrite、paid call、Googleログイン、owner登録、試用は0。

今回のログイン直前準備は残1–2.5 agent h、初回試行1.75–4.75 agent h、親csm0014.75–11.75 agent h（低確度）。前回範囲へ依存修正/再CIの暫定0.25–0.5hを加えた内部工数見積で、外部承認待ちを含まない。vt104は未完了。次checkpointは二manifest差分のowner判断、四CIとworkflow登録readback。実試用価値はまだ0。
