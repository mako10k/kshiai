# vt104 snapshot保存先候補

状態: 保存方針はowner選択済み（[ADR0041](../adr/0041-cutover-snapshot-protection.md)）。実鍵・資源・保存/回復の対象と実行承認をpacketへ固定する。所有者の「保存先候補を作成」に基づく選定案。資源作成・鍵生成・snapshot取得/外部保存・本番復元の実行packetへ渡す入力候補である。

推奨: **専用の東京region GCS bucketへ、owner公開鍵で事前暗号化したsnapshotを保存する。最低30日保持し、削除後のsoft deleteを7日とする。**

## 現在の観測

2026-09-30、認証済owner mako10k@mk10.orgでproject kshiaiのbucket一覧とproject IAMを読み取った。見えたbucketは `kshiai_cloudbuild`（US、uniform access false、public access prevention inherited）。project ownerは指定owner、default Compute service account `639316264814-compute@developer.gserviceaccount.com` はeditorとstorage.objectViewerを持つ。新bucketでもproject権限が継承されるため、bucket IAMだけをowner限定に設定しても既存service accountの平文読取を遮断した証拠にはならない。既存project IAM変更をこの候補へ含めず、事前のowner鍵暗号化で平文を保護する。

## exact候補

| 項目 | 提案値・確認条件 |
| --- | --- |
| Project / region / class | kshiai / asia-northeast1 / Standard |
| Bucket候補名 | kshiai-cutover-snapshots-639316264814。世界での名前利用可否は未確認。実作成結果で確定 |
| Object prefix | vt104/<frozen-cutover-id>/pretrial/。run固有名、作成時generation-match=0で既存object上書きを拒否 |
| 保存物 | application整合snapshot custom archiveのage暗号文1、対象/hash/時刻/receipt manifest1。公開repoにはarchive/private data/鍵を入れず、最小digest・generationだけ記録 |
| 暗号化 | upload前にownerのage公開recipientで暗号化。GCSはGoogle managed at-rest、転送はTLS。private identityはownerの保護保管先で管理し、restore時だけ承認済executorへ利用可能にする |
| アクセス | bucket uniform access、public access prevention enforced。ownerはbucket管理・暗号文read/write。snapshot executorはexact service accountを固定し、期間・prefix付き最小create/read。現在のproject editor/objectViewerは暗号文への潜在アクセスとして明示する |
| 保持 | unlocked bucket retention 30日。lifecycle Delete age30日、soft delete7日、versioning disabled。30日未満の通常削除を防ぎ、削除後7日の復旧余地を持つ。自動削除実行は非同期で、37日を厳密な全コピー消去期限とは扱わない |
| 完了readback | bucket region/access/public/retention/lifecycle/soft-delete/IAM、object generation・bytes・SHA256/transport checksum、owner recipient照合、download→復号→隔離restore→独立DB比較が一致 |

鍵の公開recipient・private identity保護先とバックアップ方法は未指定。ローカルage実行ファイルも現時点で未導入。ownerの鍵で復号できることを停止前に実証する。鍵消失は暗号文を復旧不能にするので、鍵の別保護コピーとowner-assisted restore rehearsalを完了条件へ含める。鍵の秘密値をchat/repo/logへ記録しない。

Archive coverageはapplication public tables、finished/generation/current pointer/accounting/関連schema dependencies/ACL/RLS/sequencesを独立inventoryで確定する。Supabase管理schema/認証serviceの全体復旧とは別に、切替対象applicationの回復に必要な依存がarchiveとrestore環境で揃うことを実証する。先の合成PG17 rehearsalはpublic tablesの比較例であり、実DBのcoverageやpermissionを代替しない。

## 代案とリスク

1. 専用GCS bucket＋Google managed暗号化だけを使用: ownerが既存projectのCompute/Cloud Build等の継承principalによる平文読取を許容する場合、鍵導入と復号依存を減らせる。これはowner管理を満たし得る別候補であり、owner公開鍵暗号化を上位の既存必須条件として追加するものではない。アクセス集合の具体的な許容判断をpacketへ記録する。
2. 既存Cloud Build bucketを使用: 新資源は減るが、build artifactとprivate snapshotのregion/access/retentionが混在する。今回の固定private snapshot用には専用bucketを推奨する。
3. owner端末の暗号化archiveだけを使用: GCS資源は減る。端末の可用性、鍵・容量、復旧実行場所への転送時間が未測定なので、30分回復条件の実測を追加する。
4. 別GCP projectでsnapshot IAMを隔離: 暗号文の読取面も限定できる。project/billing/IAM/provider資源が増えるため、必要な保護条件としてownerが選ぶ場合に別案を具体化する。

推奨案のリスクはowner鍵の可用性、実dump/暗号化/転送/復号/restore時間、実DB依存とrestore role、retentionによる削除制限、soft-delete課金、継承principalの暗号文読取。アプリの起動・runtime配備権限にsnapshot復号鍵を渡さず、restoreのexact actor/runへ渡す候補とする。

資源準備の最大write候補: bucket作成1、metadata設定1（retention/lifecycle/soft-delete/accessを同じ設定payloadへ固定可能なら集約）、bucket IAM設定1、snapshot object作成1、manifest object作成1。実コマンドが複数metadata operationを要求する場合はその正確な回数でpacketを更新する。既存project IAM write0、既存bucket write0、retention lock0。ambiguous write後は同名generation/metadataを読戻し、別名・別IDで再作成する前に実在結果を確定する。

次の作業: ownerが保存案と保持期間を選定した後、公開recipient・executor・object名・archive coverage・資源設定payloadを固定し、実capture/隔離restore/前進復旧の承認候補を提示する。準備残0.5–1.5 agent時間（低信頼度、vt104見積内）、実データ量・外部待ちによる回復経過時間は実測で更新する。

## 参照

- [Cloud Storage access control](https://docs.cloud.google.com/storage/docs/access-control) — IAM/ACL/公開防止
- [Bucket retention](https://docs.cloud.google.com/storage/docs/bucket-lock)、[lifecycle](https://docs.cloud.google.com/storage/docs/lifecycle)、[soft delete](https://docs.cloud.google.com/storage/docs/soft-delete) — 保持と削除の相互作用
- [Encryption controls](https://docs.cloud.google.com/storage/docs/encryption/enforce-encryption-types) — managed encryption
- [age公式](https://github.com/FiloSottile/age) — 公開recipient暗号化とprivate identity復号


owner更新: ①事前暗号化を選定済み、新規鍵作成の準備を依頼。[新規鍵の対象・手順・出口](vt104-owner-key-preparation-2026-09-30.md)と[合成暗号化確認](vt104-age-synthetic-verification-2026-09-30.json)を作成した。実owner鍵/資源/本番snapshotの作成はexact packetへ進める。

追加IAM読戻し: predefined roleを実際に照合し、legacy Cloud Build account、Cloud Build service agent、Container Registry service agent、Cloud Run service agentにもstorage.objects.get/listを確認した。公開鍵暗号化案ではこれらを暗号文への潜在readerとして扱う。bucket作成後に実IAM/conditional bindingをfresh readbackして固定する。
