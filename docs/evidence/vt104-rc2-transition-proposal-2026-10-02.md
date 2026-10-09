# RC2 停止・処分・配備の実行候補（2026-10-02）

状態：Proposed。外部実行は未承認。本日までの承認はCI・RC・prepare、管理jobのREAD ONLY確認と1Gi変更・追加確認まで。今回の準備では外部変更0。旧RC1の候補から独立した新候補。

現在の対象phaseは受入済み詳細設計から実運用への実行準備。要件revision3 R3–R5、ADR0042、詳細設計v1とローカルAccepted処分設計v2を入力とする。後続は所有者によるexact外部作用承認、実停止、処分、migration、preview配備、Google所有者の実ゲーム試行。新しい認証仕様やsnapshot開始条件を追加しない。

## 固定入力と現証拠

候補JSON：`vt104-rc2-transition-candidate-2026-10-02.json`。現bytes SHA256 `91eac07f5e161fbad4c611b05b07c65b7024307f71ad1d40f25593991bc79789`。ソース4ab19719ef7fa61cdfb8571c4579c3c64cc96dfb、RC2、prepare36857282507、image2e7051ec6395d36a27124ace0cad8d032bbb6b47878509339b05ce27c679c056。証拠HEAD7a4d417はruntimeソースと別。

GCP kshiai/asia-northeast1、service kshiai-api、job kshiai-v3-trial-preflight、queue kshiai-narration、Worker kshiai-web、DB cvrbhpkfqkpqdegxfrlq/public。成功実行4nsmcの全stdoutを再構成し、18 unfinished/168 finished/14 finished outboxとplanDigestを確認した。plan bytesを独立保存しSHA固定。

本日の独立baseline：public revision00141-vis100%、旧tag78、queue RUNNING/task0、5jobの実行中execution0。pooler READ ONLYでprovider active/reserved、narration生成、authoring未完了、非期限切れleaseの10条件はすべて0。pendingは0026〜0030の5ファイル。runtime8secretとDIRECT_URLは各version1のみENABLED。これは停止後のquiescenceではなく、停止後に再観測する。

## 作用順と最大範囲

1. 停止前にCloudflare shared preview設定をGETしenabled=false/previews_enabled=trueを確認。違えばexact差分を別提示。ownerの外部作用承認、budget範囲、job entry bytesを照合する。
2. queue pause1、旧tag78閉鎖1、manual scaling0更新1。候補JSONの構造化argvを使用する。公開serviceは停止し、旧tag URLも閉じる。停止開始の実時刻から最大1800秒。旧writer未閉鎖、実行中job、queue backlog、DB lease/生成処理残存ならDB作用に進まない。手元/別チャットの更新は所有者が「していない」と報告済みだが、cloudの独立確認と分ける。
3. 同じRC2 digestで管理jobを1回更新し1回実行。1Gi/cpu1/retry0/task1/120秒、既存DIRECT_URL:1と管理専用development環境。新entryはreviewed plan bytesと実停止policyを/tmpへ書き、既存compiled CLI apply1回→別connection readbackを行う。policyの停止時刻・期限・承認identity・writer閉鎖receiptは実証拠から生成し、架空値を渡さない。
4. 1transaction内で0029 receipt DDL最大1、exact18 receipt insert、exact18battle削除、関連table削除、finished outbox14 completed更新。related削除候補上限はbattle_leases1、presentations28、entries28、narration_leases2、retention0、events84、outbox28、matching idempotency173。finished168 state、所有者・Google identityは維持。生成/active処理は事前0を要求。集合/hash/count不一致はrollbackして範囲を拡張しない。
5. 実処分receipt・停止receipt・承認済budget証拠が揃えば、RC2登録済workflow phase=deployを1dispatch。migration job更新1/実行1、pending5 forward apply、backend no-traffic deploy1、immutable Worker preview upload1、queue resume1。管理処分jobとmigration jobは同名なので更新/実行は合計各2が上限。公開traffic mappingと公開Worker versionは変えない。secret8identityは同じversion1に固定。通常runtimeのNODE_ENV等は既存のまま。
6. image/revision/Worker binding/health/direct protection/queueを読み戻す。Google callbackは実preview URL取得後に必要なexact追加だけ別候補にする。現認証方式・subject mapping・CORSを変更する根拠は現時点にない。

## 回復・代替・未確認

18unfinishedと関連記録の削除は不可逆で、旧状態復元を保証しない。snapshotは受入済み方針どおり開始条件に戻さない。処分前の失敗ではqueue/tag/scaling baseline復旧のexact候補を提示する。現承認はその復旧を含まない。処分後の失敗ではfinishedと新V3記録を保持し、remote実結果を読み、最小forward修正を別提示する。曖昧結果を再dispatchしない。処分後に旧版を無条件で再起動しない。

Cloudflareは現在Wrangler loggedIn=false、secdat token注入もrequired-key不足。GitHubの既存秘密値を取り出す方法は採らず、所有者に既存Cloudflareアカウントのログインか読み取り専用workflow候補を選んでもらう。まだ停止していないので、この未確認に伴う停止復旧は不要。API/DBは本候補でまだ変更していない。

providerBudgetReceiptIdは未作成。今回のDB準備にprovider/task送信は0、agentからのpaid呼出し0。通常runtime startupと後続ownerゲームの費用範囲は独立に判断する。文字列だけの架空budget receiptでworkflowを通さない。実ゲームbudget上限・内容確認・generation確認・対戦証拠は後続owner段階で具体化する。

この候補全体はまだ実行可能packetではない。Cloudflare観測とbudget範囲を確定後、dynamic欄の生成規則とjob更新の全argvを含む最終候補を凍結して承認を求める。今すぐの停止・処分許可を求める資料ではない。

## 進捗・計測・次の確認

利用者の実V3体験は未実現で価値0。今回の将来寄与は、実GCP接続、実DB対象hash、旧writer状態、secret version、作用上限をRC2へ固定したこと。vt104未完了。vt104計測は本日09:56:36〜10:06:24、10:09頃resume以降をcanonical work_eventで保持し、完了taskのperson effortへ推定換算しない。

内部残工数はagent暫定・低確度：vt1040.25〜1h、ログイン前1〜3.25h、初回体験1.75〜5.25h、親csm0014.75〜12.25h。既存25p/17hはelapsed標本でperson effortへ適用しない。今回の最小チェックはCloudflareログイン後のshared-preview GET。ここで前提が成立すれば最終外部packetを承認へ進め、違えばexact設定差分だけを提示する。外部待ちは期限未確定。次の実績checkpointはこのreadinessが揃いvt104候補が凍結した時点。

plan payload44,680bytesは3環境変数（各最大16,384bytes）へ分割し、復元bytes SHAを照合する。Cloud Run EnvVarの32,768bytes上限に収める。公式定義：https://cloud.google.com/python/docs/reference/run/0.10.13/google.cloud.run_v2.types.EnvVar 。この包装のsyntax/bytes照合は成功し、実Cloud Run applyは未実行。

管理jobの全manifest候補とreplace/executeの構造化argvを追加した。唯一の動的envは実停止policyのTRIAL_POLICY_BASE64。null候補は送信不可。job更新後に全task spec一致を読み戻してから1executeする。

## Cloudflare確認完了（2026-10-02）

所有者の明示ログイン承認後、device flowがSuccessfully logged inで終了。whoamiでmako10k@mk10.org／単一account aa22d9ebf49d126306d9aac2d842584dを確認し、kshiai-web/subdomainのGETがenabled=false／previews_enabled=trueを返した。設定変更不要、設定write0。上の資格情報不足・live未確認は歴史記録となり、この節で解消した。停止・処分・配備の外部承認と起動費用範囲は引き続き未確定。
