# ADR-0041: 共有切替snapshotのowner公開鍵暗号化と保持

- Status: Accepted
- Date: 2026-09-30
- Decision owner: user
- Related: ADR-0039、ADR-0040、PERT vt104/vt105/vt108、[保存先の完全日本語候補](../evidence/vt104-snapshot-storage-candidate-2026-09-30.md)、[監査DSL](../evidence/vt104-snapshot-storage-candidate-2026-09-30.think)

## Context

ADR-0040の共有停止切替packetはsnapshot保護先・暗号化・アクセス・保持・実回復時間を確定する必要がある。ownerは保存先候補の作成を依頼し、全文候補と①/②の違いを提示した質問に「① owner公開鍵で事前暗号化（推奨）」と回答した。共通条件は東京専用GCS bucket、最低30日保持、削除後7日soft delete。資源作成・snapshot取得・本番操作は後のexact packetに分離すると質問で明示した。

E1: 認証済project readbackでは既存bucket kshiai_cloudbuildはUS、uniform access false、public prevention inherited。E2: project IAMとpredefined roleの読戻しではownerに加えCompute/Cloud Build/Cloud Run等のservice accountがstorage object readを持つ。bucket IAMだけで平文をownerだけに限定したとは言えない。E3: age公式は公開recipient暗号化とprivate identity復号を提供する。E4: ownerの上記選択が本決定の受入れであり、実鍵や資源が作成済みという証拠ではない。

## Decision drivers

- C1: private application snapshotを、既存project継承principalが暗号文を読めてもowner管理鍵なしに復号できない形で保護する（E2/E3/E4）。
- C2: 整合snapshotを回復に使える期間を最低30日確保し、削除後7日の復旧余地を定義する（E4）。
- C3: snapshot回復は停止前にowner鍵と実restoreで検証し、30分停止条件を実測に結び付ける（ADR-0040）。

## Considered options

1. 専用東京GCS＋owner公開鍵でupload前暗号化。鍵可用性・復号依存が増えるが、継承project readerから平文を保護できる。選択。
2. 専用GCS＋Google managed暗号化のみ。ownerが継承principalの平文readを許容する場合は導入依存が少ない。今回のowner選択は1。
3. 既存Cloud Build bucket流用。新資源は減るがbuild/private snapshotのregion/access/retentionが混在する。
4. owner端末のみ、または別GCP projectでIAM隔離。端末可用性・転送または追加project/billing/IAMの準備が必要。

## Decision

D1→C1: application整合snapshotはowner管理のage公開recipientで事前暗号化し、project kshiaiの専用asia-northeast1 Standard GCS bucketへ保存する。uniform accessとpublic access prevention enforced、GCS managed at-rest/TLSを組み合わせる。既存project IAMの継承readは暗号文への潜在アクセスとして明示し、project IAM変更はこの決定へ含めない。

D2→C2: retention30日（unlocked）、lifecycle Delete age30日、soft delete7日を採用する。削除は非同期で、37日を厳密な全コピー消去期限とは扱わない。retention lockを実行する判断は含めない。

D3→C3: owner公開recipient、private identity保護先・予備コピー、exact executor/run、実dump/archive scope/依存、download/復号/隔離restoreの独立readback、pretrial restore/posttrial forward recovery上限Rをexecution packetで固定する。private keyはchat/repo/logへ保存せず、復旧時の許可済actorへ保護された入力で利用する。

受入範囲は保存方針である。新bucket、IAM設定、鍵生成、実snapshotの取得・外部保存、実restore、cloud停止・削除・配備・promotionは、それぞれexact対象/最大作用/readbackを持つ実行packetのowner承認へ進める。

## Consequences

### Positive

- 既存runtimeの権限を変更せず、snapshot平文の読取にowner鍵を必要とする。
- 保存/復旧期間、アクセスと復号の境界を候補packetへ具体化できる。

### Negative and risks

- 鍵喪失またはowner不在は回復を阻害する。予備キーの保護と実復号試験を完了条件にする。
- dump/暗号化/転送/復号/restoreの実時間、Supabase依存/role/ACL等は未測定。合成試験を本番回復上限に代用しない。
- retention/soft-deleteの削除制限と保管費用を発生させる。費用とデータ量は実資源準備時に固定する。

## Compatibility and migration

一般API、Supabase認証、V3 generation/既存対戦の契約は変更しない。trial開始前の承認済snapshot復旧候補と、開始後のV3データ保持forward recoveryの区別をADR-0040から保持する。owner鍵で復号できるsnapshotが実際に取得されたことは、保存方針の受入れから推測せずreadbackで確認する。

## Verification

- 公式age binaryのversion/hashと合成公開鍵によるroundtrip、wrong-key/tamper拒否。
- 実資源設定と継承principal、exact generation/checksum、owner鍵でdownload→復号→隔離restore→application/schema/ACL比較。
- 対象coverageと実回復Rの30分予算への適合。失敗時はtrial後のforward-only条件を守る。

## Implementation references

A1→ADR0041→C1/E2/E4: [保存候補と最大作用](../evidence/vt104-snapshot-storage-candidate-2026-09-30.md)。local手順準備/合成検証を行い、実鍵/資源/保存/回復の結果は後続receiptへ記録する。
A2→ADR0041→C2/E4: [execution packet](../evidence/vt104-execution-packet-2026-09-30.json)。protectedStore実IDは未取得のためnull、selected policyだけを記録する。
