# vt104 owner鍵 — secdat登録・読戻し

ownerの「secdat に登録してください」に基づき、新規age鍵を生成し、既存kshiai domain内の専用storeへ登録した。[登録receipt](vt104-owner-key-secdat-registration-2026-09-30.json)。

| 項目 | 確定値 |
| --- | --- |
| domain | /home/katsumata-m/kshiai |
| store | snapshot-recovery（v2） |
| private identity | VT104_SNAPSHOT_AGE_IDENTITY、secret value/access unlocked、bulk exclude |
| public recipient | VT104_SNAPSHOT_AGE_RECIPIENT、public value、bulk exclude |
| 公開鍵 | age13fe88lnaq2mrhhcg7vhl4cdkkkemrnpkqhn8zzvqm5p5jfk0zursnvr6j8 |
| secret object ID | 076baf57-9965-4d7f-9a2b-547aa8a83e37 |

秘密鍵はプロセス内で生成してstdinでsecdatへ渡し、平文鍵ファイル・argv・chat/repo/logへ出力しない方法で登録した。独立get readbackから公開recipientを導出し、登録済公開鍵と一致した。登録済identityをpipe経由でageへ渡し、合成データのencrypt→decrypt→hash一致を確認した。default storeにはこの二項目が存在せず、通常app/GitHubの環境と区別される。

新namespaceは作成時v1で、set mutation dry-runがv2を要求した。0entry/0secret/0issueのmigration preview後に、この空namespaceだけをv2へ変換して二項目を登録した。実mutationはnamespace作成1＋空store migration1＋private/public set各1＝4。曖昧な秘密鍵writeの再送は発生していない。

## 使用と回復手順

公開recipientを取得するコマンドは次のとおり。

```bash
secdat --domain /home/katsumata-m/kshiai --store snapshot-recovery get VT104_SNAPSHOT_AGE_RECIPIENT
```

暗号化はこのrecipientを明示してageを呼ぶ。復号executorはexact domain/store/private keyをstdin/pipeで取得し、process内でage identityへ渡す。secret valueをshell変数やargvへ展開したり、stdoutへ表示してログへ残す手順は用いず、登録検証と同じpipe方式を実snapshot adapterへ接続する。

owner新規鍵の作成準備時に提案したWSL平文keyfileは採用せず、選定されたsecdatをprimaryとする。新しい鍵を再生成する前に、上記実在object IDとrecipientを読戻し、使用中snapshotのgeneration/digestを確認する。今回の固定recipientで保存する予定のsnapshotには、このidentityを使用する。

## ツール確認と残るpacket入力

公式signed Ubuntu age1.1.1-1ubuntu0.24.04.3を一時展開し、signature→Packages hash→deb hashを検証した。package SHA256は22ed034e16d8a7662d94dbb8d9f644f01284c6d87bc6b619903e38ba91125337。[合成確認](vt104-age-synthetic-verification-2026-09-30.json)でwrong key/tamper拒否も確認している。

secdat登録はprimary persistenceと復号可能性の証拠で、別host/媒体のencrypted store/master-key recovery backupが成立した証拠とは区別する。実回復packetではownerのsecdat backup/再unlock方法、exact executorと利用環境を固定する。実snapshot取得/暗号化/保存・download/復号/隔離restoreのreal Rは、別途承認する実行packetで測定する。

次の作業は固定公開recipientを使用するsnapshot暗号化/保存/復元adapterの候補と、GCS資源・回復R・workflow接続を一つのpacketへまとめること。vt104全体の内部残1.75–4.5 agent時間（低信頼度、owner/外部待ち別）で管理する。
