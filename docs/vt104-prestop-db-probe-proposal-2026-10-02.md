# 停止前のGCP DB接続確認：実行候補

状態はProposed。対象は修正ソース4ab1971／RC2／prepare36857282507のイメージdigest2e7051ec6395d36a27124ace0cad8d032bbb6b47878509339b05ce27c679c056。既存認証を維持してV3体験を実現する前に、GCPから対象DBへ接続できるかを確認する。現在のGCP読み取りは再認証で失敗したため、今日のjob不存在とイメージ存在は未確認。再認証後の読み戻しを実行条件にする。

## 実行する内容と最大作用

GCP kshiai／asia-northeast1にjob `kshiai-v3-trial-preflight`を最大1回作成し、最大1回実行する。事前読み取りで既存jobが見つかれば上書きしないで対象を確認する。service accountは既存kshiai-cloud-run@kshiai.iam.gserviceaccount.com、DIRECT_URLは既存Secret Manager `kshiai-direct-url:1`を参照し、秘密値を資料や操作引数に含めない。

nodeでビルド済み`backend/dist/scripts/prepare-unreleased-v3-trial.js preview`を実行し、project ref cvrbhpkfqkpqdegxfrlq／database postgres／schema publicを検証する。cutoverIdはv3-trial-rc2-20261001、cutoverAtは2026-10-01T11:52:57.316Z。作成されたplanを読み戻し、昨日の18未完了・168完了・14finished outboxと比較する。差分があれば以後の処分候補を更新する。

taskは1、並列1、retry0、timeout120秒、CPU1／memory512Mi。この範囲のGCP実行費用が発生する。DB処理はREAD ONLY transactionであり、DDL・処分・migration・provider呼出しは行わない。実行内容の全argvは`docs/evidence/vt104-prestop-probe-candidate-2026-10-02.json`で固定する。

管理CLIだけの接続確認なのでjob内NODE_ENV=developmentを指定する。AUTH_PROVIDER=supabaseとSUPABASE_URL=https://cvrbhpkfqkpqdegxfrlq.supabase.coを保ち、HTTPサーバーは起動しない。これは通常production起動・ゲーム側Googleログインの証明ではない。既存ゲームの認証設定、Cloud Runサービス、queue、公開traffic、Workerを変更しない。

## 成功・失敗・未知への対応

作成前に同じGCPアカウントmako10k@mk10.orgの再認証を済ませ、job不存在とイメージdigestを読む。作成後にimage、command、args、secret version、env、task数、retry、timeoutを照合してから1回実行する。execution ID、終了状態、planを独立に読む。結果不明時に再実行しない。

成功すれば、新イメージから同DBを読むことが確認でき、停止・処分・migration・試験用配備の具体的な候補へ進める。失敗すれば既存環境を動かしたまま、実エラーと接続経路を調べる。手元の直接接続は昨日ENETUNREACHだったが、GCPの結果は未確認である。既存session poolerでは昨日read-only previewが成功した。同接続への変更は必要性を確認してから所有者へ提示する。

代替は、この確認を省略して停止後に接続を試す方法だが、接続失敗中に共有環境を止めたままになるため推奨しない。確認に失敗した場合でも稼働環境の回復操作は不要であり、jobの結果を保全して停止を見送る。

## 残作業と必要な許可

前回の所有者承認はCI・新RC・prepareまでで、job作成・実行は含まれない。AGENTS.mdの「承認は開示された範囲に従う」に基づき、上記2操作の許可とGCPの再認証が必要。処分・停止・実配備・認証allowlist追加・有料LLM呼出しはこの許可に含めない。

内部見積りはこの確認0.1～0.25h、vt104残0.25～1h、V3初回体験まで1.75～5.25h、親csm0014.75～12.25h（agent暫定、すべて低確度）。前提は同アカウントの再認証と接続確認が成功すること。外部承認・ログイン待ちは別。canonical PERTのcheck／両schedule／next／observe-velocityを再読済みで、vt104はまだ未完了・完了標本なし。次の計測checkpointはこの接続確認の結果取得時。

## 実施後の更新（2026-10-02）

所有者の「承認します。GCPは再ログイン済です。」に基づき、同アカウント／job不存在／新イメージdigestを読み直した後、上記job作成1回とexecute1回を実施した。execution kshiai-v3-trial-preflight-b6wkrはメモリ512Miの上限に達して失敗した。再実行はしていない。接続結果を陰性・成功のいずれとも扱わない。詳細はdocs/evidence/vt104-prestop-probe-result-2026-10-02.json、次の所有者判断はdocs/vt104-prestop-db-memory-proposal-2026-10-02.md。上段の再認証待ち・job未観測は実施前の状態である。
