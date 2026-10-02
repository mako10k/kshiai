# 旧対戦キャラ表示の修正：同じプレビューへ反映する候補

対象ソースは960a9958a25f7770755fea9119627e18a461f851です。全257件の有効な検査、型検査、静的検査とCI run36989694540の4項目が成功しました。保存済み旧対戦btl_42085ad499be0cb5480a2d0fc4207a15の両キャラは、修正読取処理により当時のスナップショットと完全一致しています。これはローカル読取の証拠であり、修正後の実画面は未確認です。

変更は、履歴一覧のキャラ画像リンクにbattleIdを付け、キャラ詳細の読取で実行用対戦スキーマ全体を要求せず、固定キャラ・manifest識別子・権限を検証するものです。旧対戦全体の閲覧・再実行の制限は保持します。既存キャラの更新・移行・削除、保存済み対戦の書換えは行いません。

承認後、このチャットの主エージェントだけが次を各最大1回実行します。

1. GCP kshiai／asia-northeast1で固定SHAのクリーンexportからCloud Buildを1回実行します。e2-medium、最大1200秒、既存gs://kshiai_cloudbuild/source（US）にソースを保存し、Artifact Registry backend:960a9958a25f7770755fea9119627e18a461f851へイメージを保存します。現在の458af76イメージを保持します。ソース・完了build・registry digestを照合し、生成digestを以後固定します。失敗・不明時は再実行しません。
2. そのdigestをkshiai-apiへrevision=kshiai-api-v2-history-960a995、--no-traffic、tag=v2-retire-458af76で1回配備します。公開100%のkshiai-api-00141-visを保持します。現行のCPU1、512Mi、service account、version1の秘密参照、その他環境を維持します。ナレーションtask送信先・audienceは同じv2-retire-458af76タグURLのままです。
3. Cloudflare account aa22d9ebf49d126306d9aac2d842584dのkshiai-webへ、同じ固定SHAのフロントエンドを1回versions uploadします。既存preview alias=v2-retire-458af76を更新し、BACKEND_ORIGINは同じCloud RunタグURL、--strict、既存ORIGIN_SHARED_SECRETを保持します。公開Workerをdeployしません。プレビューのURLは同じなので、SupabaseへのPATCHは0です。
4. 新リビジョン・固定digest・環境維持・フロント資産・新プレビューhealthを照合した後、既存v3-trial-36954429062-1タグを同じ新リビジョンへ1回付け替えます。--update-tagsのみで配信割合を保持し、旧プレビューhealthも読み戻します。

直前に未処理DBジョブ・有効lease・Cloud Tasksがないこと、サービス公開割合と試行先が前回結果どおり、現行Worker version877c3a87-35ec-4d92-ba4c-f8b2d12e91acのbindingが維持されていることを確認します。違いがあれば停止します。処理結果が不明な書き込みを再送しません。既存revision・Worker versionは削除しません。

Cloud Build・Cloud Runの費用が発生し、請求額は未算出です。通常起動に伴うシステムpreset、監査・配送状態の更新は前回と同様に生じます。DB処分・migration・キャラ変更・新対戦・有料LLM試験・Git release tag・mergeは対象外です。

推奨はこの候補です。保留するとローカル修正は保存されますが、同じプレビューの旧対戦キャラ表示は未修正のままです。実画面では履歴のキャラ画像を開き、当時の名前・内容と「閲覧のみ」、編集・移行入口がないことを確認します。残り内部作業は暫定30〜60分（確信度低）、承認や利用者の確認待ちは別です。
