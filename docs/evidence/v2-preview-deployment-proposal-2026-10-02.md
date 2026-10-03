# V2キャラ更新廃止：次のプレビュー配備候補（未実行）

## 目的と対象

V2の新規作成・通常更新をAPIと保存処理で拒否し、旧V2の表示・戦闘に固定されたキャラ表示・V3への明示的移行を残します。対象製品ソースは458af76a306b222133a383d5bbdc6eecb197b7a9です。追加の旧表示回帰検査は製品コードを変更していません。以前懸念した現在履歴情報の混入は実行検証で否定され、製品修正は行っていません。

CI4は成功し、Cloud Build82cbd5b2-3433-458d-86f2-02587d7f7f06は1回で成功しました。使用イメージは次の固定digestです。

`asia-northeast1-docker.pkg.dev/kshiai/kshiai/backend@sha256:e439d1ef3e2845ea203d171ede921e5a6da5be8c61f47f3ef3a13b285dbbc397`

ソース5,661ファイルの一致とレジストリのdigestを独立照合しました。フロントエンドは同じSHAからSupabase公開設定を含めてビルドし、設定検査とWorker dry-runに成功しました。製品コードへの変更がない追加テスト・証跡コミットも、別途CIを確認します。

## 凍結する操作と上限

実行者はこのチャットの主エージェント1名です。以下は承認後の候補であり、まだ実行していません。

1. GCP kshiai／asia-northeast1の既存サービスkshiai-apiへ、新リビジョンkshiai-api-v2-retire-458af76を1回作成します。固定digest、--no-traffic、tag=v2-retire-458af76を使います。既存CPU1・メモリ512Mi・サービスアカウント・秘密鍵参照version1・その他設定を保持し、NARRATION_TASK_TARGET_URLとNARRATION_TASK_AUDIENCEだけを新タグの `/api/internal/narration/task` URLへ合わせます。
2. Cloudflare account aa22d9ebf49d126306d9aac2d842584dのkshiai-webへ、固定フロントエンドの新Worker versionを最大1回uploadします。preview aliasはv2-retire-458af76、BACKEND_ORIGINは `https://v2-retire-458af76---kshiai-api-crpgn6evfa-an.a.run.app` です。--strictを使い、既存ORIGIN_SHARED_SECRETを保持します。公開サイトへdeployする操作は行いません。
3. Supabase project cvrbhpkfqkpqdegxfrlqのuri_allow_listへ、`https://v2-retire-458af76-kshiai-web.mako10k.workers.dev/auth/callback` だけを1件追加するPATCHを最大1回行います。現行4件、site_url、Google有効状態、鍵など他の返却設定を保持します。候補URLはinstalled Wranglerのalias生成規則でも確認しました。
4. 新プレビューのヘルス・digest・送信先・資産・公開割合維持の読み戻しに成功した後、既存タグv3-trial-36954429062-1の向き先だけを新リビジョンへ最大1回変更します。旧プレビューのAPI要求も新コードへ向け、旧V2更新コードへの経路を残さないためです。旧Workerの不変UIには古い編集ボタンが残る場合がありますが、V2更新は新APIで拒否されます。新UIの確認には新プレビューを使います。

Cloud Runの公開割合はkshiai-api-00141-vis100%のまま保持します。旧リビジョン・旧Worker versionは削除しません。新Gitタグ、Cloud Buildの追加実行、DB処分、migration、既存キャラの変換・上書き・削除、正常なキャラ作成／更新、有料LLMテストは対象外です。

## 起動に伴う効果と条件

Cloud Run実行・プレビュー利用に費用が発生します。請求額は未算出です。起動時には既存実装に基づくシステム戦場・ナレーションのプリセット更新、監査・配送状態の通常記録が生じます。DBへの全書き込みが0という提案ではありません。キャラ定義の移行・処分は0です。

2026-10-02T07:17:38ZのREAD ONLY取引では、各authoring jobはcompleted/cancelledのみ、両outboxはcompletedのみ、provider run/attemptは終端状態のみ、有効なナレーションleaseは0でした。V2現行世代11件、V3現行世代5件です。Cloud Tasks kshiai-narrationにも待機taskがないことを読み取り確認しました。直前にDBとCloud Tasksの同じ確認をやり直し、未処理／実行中の仕事があれば配備を停止します。サービス設定・Worker設定・auth baselineが変わった場合も停止し、変更された条件を説明します。

## 読み戻しと未確認

Cloud Runの固定revision/image、秘密参照・環境差分が指定範囲のみ、公開割合が元どおりであることを確認します。Workerのversionとalias、BACKEND_ORIGIN、ビルド済み資産を確認し、preview `/api/health` のrevision一致を確認します。Supabaseは5件の完全一致とその他設定維持をGETで照合します。結果不明の書き込みを再送しません。

実ログイン、新UIのV2表示／編集不可、旧戦闘の旧キャラ表示はまだ未検証です。配備後に既存mako10k@mk10.orgのGoogleログインが必要になる場合は、その操作を利用者に案内します。実ユーザーでの有料編集やDBを変更する試験はこの候補に含めず、必要が判明したときに具体的に分けて扱います。稼働確認が終わるまで目標は未完了です。

## 選択肢と判断

今回の候補を推奨します。新プレビューだけを追加して旧APIへ到達可能な経路を残す方法では、V2更新廃止を全経路で確認できません。公開サイト全体を新バージョンへ切り替える方法は、今回の試行より影響が広いため選びません。保留なら、ソースとイメージは保持されますが現在の試行APIは旧コードのままです。

残り内部作業は暫定1〜1.5時間、確信度低です。未承認PERT追記案には実測開始を登録しておらず、この値は実測速度ではありません。CI・利用者ログイン・承認待ちは別の経過時間として扱います。
