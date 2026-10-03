# vt104 — 共有本番切替execution packetの準備

> 2026-09-30方針更新: 以下は旧保全・八smoke前提の歴史的資料。現行の初回試行条件は[計画再修正](vt104-unreleased-trial-rescope-2026-09-30.md)と要件v3を参照する。ここに記載したemail/snapshot/restoreの不足を現行vt104のblockerとして扱わない。

状態: **local smoke adapter検証済み / 実Stage未実行 / 実行入力を準備中**。

最新追記: [Stage smoke実装と検証](vt104-stage-smoke-detail-2026-09-30.md)、[workflow接続候補](vt104-workflow-integration-candidate-2026-09-30.md)、[snapshot保存先候補](vt104-snapshot-storage-candidate-2026-09-30.md)を参照する。以下の「permit未実装」は18:32時点の観測で、現行adapterの状態は最新追記に従う。2026-09-30の「推奨の次作業」を、前回推奨した実回復・release・content packet準備として実施した。本書と[機械可読packet](vt104-execution-packet-2026-09-30.json)は、exact payloadの未確定欄を明示する候補であり、停止・snapshot export・restore・本番DB操作・配備・GitHub writeの承認ではない。

ゴールまでの見込時間: vt104残2.25–5.5 agent時間、Stage試行cc314残4.25–10時間、親csm001残7.25–17時間、いずれも低信頼度。packet入力/回復/候補review残0.75–2.5 + 今回判明したStage smoke adapter閉包1.5–3 = vt104、さらに後続2–4.5 = Stage、さらに3–7 = 親。外部承認待ちは未知。前回の1.25–3.5時間はsmoke接続の未実装を十分反映しておらず、今回は補正した。vt103のdeclared elapsed velocity 25p/17hは一標本で、異種の運用準備に直接適用しない。

## 今回固定できたこと

- Owner報告は「mako10k@mk10.orgのGoogle連携ユーザのはず」。同emailのSELECTをTLS検証付きREPEATABLE READ READ ONLYで実行し、唯一の既存user `usr_568b632d7ad86cfe3e356171` とGoogle providerを確認した。[owner読戻し](vt104-owner-readback-2026-09-30.json)。他ユーザのprofile/token/passwordは取得していない。owner identity確認は二体内容の受入れや本番authoring許可ではない。
- 18:22 JSTのselected cloud readbackで100% traffic `kshiai-api-00141-vis`、latest ready `00144-hir`、old tags78、queue RUNNING、既存jobs4を確認した。[metadata](vt104-packet-cloud-readback-2026-09-30.json)。latest execution completionのみで全caller/job収束を証明しない。queue tasks、全instances/provider会計、Worker live version/routeは別の読戻しが必要。
- fresh secdat-authenticated fetch後もlocalHEAD `f58ac2f...`、origin/main `e31c487...`、matching branch ahead1/behind0。matching PRは0件。local HEADのhosted checks取得はHTTP422 No commit found。これは失敗/不成立のreadであり、四CIが成功したことを意味しない。dirty local sourceをmain release commitとして扱わない。
- Neva/Rioの現在のpure fixtureをlocalで生成し、実際の通常authoringが使用するassetContentDigestで固定した。[全文候補JSON](vt104-content-candidate-2026-09-30.json)。DB prepare・provider送信・owner confirmはしていない。

| 候補 | 提案character ID | candidate digest |
| --- | --- | --- |
| 夜航の灯守・ネヴァ | stage-trial-neva-736a5e323e94f501 | 50edf23389df253762378ba622537cff3d86722f613693b6a92796a7624d307f |
| 潮騒の記録士・リオ | stage-trial-rio-736a5e323e94f501 | a9ee9fda59bb0bdb1b8d77bbff300dac57ef372dfb41e1786e67691635c38252 |

ネヴァは夜道の灯を守る静かな観察者で、危機では大胆に動き、約束を守る。リオは潮と戦場の変化を記録し、機を待ち、仲間の動きを読む。これは手入力sourceの概要であり、compiler/profile/mechanicsを含む全文の受入れを代替しない。attempt ID・generation ID・confirmation permit IDは本番の通常prepare/review/confirm後の実物であり、現在はnull。

## 今回のレビュー境界と発見

`review-phase-boundary`を用い、対象を**Accepted ADR-0040 r1/detailに従うローカル実装と、vt104 release候補の準備適合性**に固定した。上位はADR-0039 D3、ADR-0040 Decision、detail「Stage受入の全条件」「候補file set」、release_process flow2–8。現段階で必要なのは実装の閉包、入力・最大作用・実測回復手段を特定すること。次のvt105/vt108では許可済みexact対象で実cloud/DB結果を取得する。例: smoke scriptのpermit欠落は現在INSIDE、本番削除後のreceiptそのものは後続実行OUTSIDE。ただし回復方法・時間の事前未確定は現在のrelease準備を阻害する。

### INSIDE — Stage smokeのpermit接続未完

Accepted detail「Stage受入の全条件」はPG、email/Google認証、ownership、R2、SSE、direct保護を独立receiptとし、既存smoke scriptもadmission permitを通すよう求める。現在のcontrol本体/HTTP/provider/taskの試験成功はこの全条件の実装完了を証明しない。次のexact pathを固定した（hashはpacket fileInventory）。

| 現在のpath | 観測した作用と不足 | 次の実装・検証の出口 |
| --- | --- | --- |
| backend/src/scripts/postgres-runtime-smoke.ts | PID/timeによるschema作成、migration、V2 fixture/session/quota/balance write、最後DROP SCHEMA。cutover permitなし | exact run/schema prefix、全DDL/write件数、失敗時残存readbackを定量化し、control permitを接続。control本体と別DB/schemaを操作しても実行ledgerは対象controlへ保持 |
| backend/src/scripts/supabase-auth-smoke.ts | admin auth user作成/削除、application mapping、V2 fixture/upgrade、一般API read。cutover permitなし | V3専用fixtureとowner限定API pathに分離。email/Google acceptanceの固定対象・認証証拠・cleanup最大作用を確定する。別ownerをtrialに勝手に許さない |
| backend/src/scripts/r2-smoke.ts | MaxKeys1で任意先頭objectを選びHEAD、空bucketでもpass。cutover permitなし、writeはない | exact existing object ID/hash/public URLを固定し、LIST/HEADの回数とreceiptをpermitで追跡。writeが必要ならexact prefix/countを別途固定 |
| backend/src/scripts/persistent-battle-e2e.ts | 既存V2 fixture生成/再importを前提。新trial固定owner/generation/requestに接続しない | 固定Neva/Rio generationとkey、V4 create/SSE/advance/worker receiptを追う専用adapter。V2を作らずphysical provider上限を検証 |
| backend/src/scripts/authenticated-read-surface-smoke.ts | 通常一般read面向けでcutover専用bindingなし | trialで必要なexact method/path/query/bodyだけbindingへ載せる。任意asset/history開放で代用しない |
| scripts/smoke-deployment.mjs | health/direct protectionの既存観測 | same revision/Worker identityと独立receiptを固定。healthだけで全Stage受入れとしない |
| .github/workflows/stage-release.yml | RUNNING queue要求、V2 smoke、CUTOVER identity受渡しなし、shared Worker preview設定write | paused配送とbounded task deliveryの順序、各jobのsame identity、closed deploy→trial→same-artifact promotionを接続。現在workflowをdispatchしない |
| .github/workflows/promote-release.yml | protected environment/typed confirmationとartifact再利用の既存経路 | accepted Stage receipts/control revisionを照合し、同image/revision/Workerへpromotion。公開smoke完了までopenしない |

### BOUNDARY_DISPUTE — email smokeのapplication側受入経路

Accepted ADRはtrialを指定owner・固定generation/requestに限定し、他ownerを閉じる。既存email smokeは新しい別ユーザをprovisionしてAPIを使う。このままでは両方を満たさない。候補Aはemail provider/JWTの確認をAPI provisionから切り離し、指定ownerのGoogle/migrated ownershipと別receiptで検証する方法。これがreleaseのemail認証受入を満たすかは、pure JWT verificationとapplication境界の詳細を先に照合する。追加コード照合では、既存 `userFromSupabaseAccessToken` が署名検証後にensureSupabaseUserでprovisionする一方、cutoverの `existingUserFromRequest` は署名検証と既存mappingのSELECTだけを行うことを確認した。したがって既存auth smoke関数を単に呼ぶadapterは採用しない。候補Aではproductionと同じES256/issuer/audience/role/sub検証を共有するpure verifierと外部auth往復receiptを用い、mapping/owner API receiptを分離する設計候補が必要。JWTの成功だけでは通常APIを含むemailの受入完了とは主張しない。

候補Bは別smoke userの限定API例外を追加する方法で、Accepted owner限定の外部契約を変えるため、ADR/上位owner revisionが必要。Bをagent判断で実装しない。推奨はAの最小read-onlyコード照合で受入経路を具体化し、成立しない場合だけ正確な変更候補をownerへ戻す。

### OUTSIDE — 許可後の実行証拠

actual snapshot取得/保護保存/restore、cloud停止/収束、削除transactionとreadback、二体正式prepare/confirm、Stageプレイ、protected promotionの結果はvt105/vt108/vt106/vt107の別途許可された実行で取得する。今は対象identity、手段、最大作用、失敗分岐・verification閾値を確定する。local合成PG17結果を実snapshotの30分適合へ流用しない。

ADR-0040はheaderのAcceptedとowner acceptanceが現在authority。本文の「候補・未受入」は候補時の表現が残っているが、本作業ではAccepted rationaleを編集して新しい意味を与えない。status整合のeditorial修正はADR governance経路で扱う。

## execution packetの順序と凍結条件

1. 停止前: 上記smoke閉包を隔離試験し、main exact commit、四CI、tag、backend digest/Cloud Run revision/Worker versionを固定する。candidate version0.23.0はまだ候補。snapshot保存先/暗号化/アクセスprincipal/保持期間、restore先identityとpretrial/posttrial回復時間をownerに確認する。
2. T0の開始前: operator一人、禁止する並行caller、old tag78を含むexact tag map、Worker route/version、queue/tasks、全job execution、会計・leaseを固定する。回復時間Rが未測定なら開始せず、30分を延長する仮定を置かない。
3. 閉鎖・収束: queue pause、old tags clear、service scaling0、job/producer停止をexact承認対象へ含める。stopped barrierは独立writer/provider/permit読戻しで成立させる。boolean stopped/desired scalingだけで済ませない。
4. snapshot/plan: 閉鎖後snapshotを承認済み保護先へ一つ取得・検証し、targets/finished/related counts/idempotency/plan digestを再固定。14:27のunfinished18は暫定で、実削除対象ではない。現local候補のpending migrationは0026–0030の5本（古い4本記述との差は0030 control追加）。実DB適用状態は実行前readbackで再確定する。
5. cutover/owner確認: frozen deletion transaction1、receipt/readback、exact二prepare/通常owner confirm2を別々に検証。二settled confirm permitとcurrent generationsの実IDでtrial遷移する。
6. trial: exact requests/keys/quota、八Stage receipts、same artifactを照合する。trial開始後の回復は新V3データ保持の前進復旧。全DB旧snapshot復元へ切り替えない。
7. promotion/open: protected production approval + typed confirmation + exact同一artifact promotionを読み戻し、公開smokeとerrorsを確認した上でopenへ進む。並行promotionを共通排他に束ねる。

最大writesのknown候補はpacketのwritesUpperCandidateに列挙した。control正常4revision（initialize/barrier/trial/open）、削除transaction1、prepare2、confirm2、queue pause/resume各1、tag clear1等。Worker shared settings、smoke permit行数、task retarget、回復branchとDB削除件数はnullであり、凍結できるまで実行不可。nullは0ではない。曖昧なwriteでは新operation IDによる再送を行わず、exact readbackへ戻る。

削除開始の最終時刻は `T0 + 1800秒 − max(実測pretrial復元上限, 実測posttrial前進復旧上限) − readback/開放予備` を上限候補とする。各値と適用phaseを測るまで時刻を確定しない。T+10/T+20の暫定checkpointだけでは回復保証にならない。

## 引継と次の一手

今回増えた証拠はowner exact ID/Google連携、fresh cloud tag/traffic/queue、二候補digest、release未hosted/CI不成立、smoke閉包の不足。Stageで利用者がV3対戦を遊べる価値は依然0。準備packetは具体化したが、execution-readyではない。

推奨次作業はvt104のStage smoke adapter詳細化。exact email受付経路を最小照合し、上記file setの作用・permit・receipt・resource prefix/最大件数を一つの候補へ固定する。owner限定契約を変えずに成立する部分は既存local authorityで実装・隔離確認へ進める。変更が必要な部分だけ最上位owner判断へ戻す。保護保存先入力と実回復Rは並行して待つ。exitは全8smokeのbinding/receipt閉包と回復入力が揃い、release候補レビューで未確定欄が解消すること。本番/remote write承認は別。


## 19時台以降の更新

八smokeのbounded adapterをローカル実装し、既存認証の共通verifier、既存emailアカウントの認証/mapping、Google receipt、exact R2 HEAD、full PG disposable runtime、health/owner/direct、実V3 create→SSE advance→stored binding/progress readbackを接続した。ローカルのsigned JWKS/loopback SupabaseとSQLite/Hono/Mock provider、PG17隔離clusterで適合確認した。実Stage八receiptは取得予定のまま。起動ログのlisten前通知による試験raceもcallback通知へ修正した。

推奨次作業はworkflow接続候補の資源入力固定と同file setの実装。保存先候補はowner依頼に基づいて作成済み。email existing account指定と保存案選定をowner入力へ渡す。ゴールまでの見込時間: vt104残1.75–4.5 agent時間、Stage cc314残3.75–9時間、親csm001残6.75–16時間、いずれも低信頼度。workflow1–2＋回復条件/資源入力/候補review0.75–2.5=vt104、後続2–4.5を加えてStage、さらに3–7を加えて親。実回復時間と外部待ちは実測/owner入力で更新する。

owner選定更新: 事前暗号化＋東京専用bucket＋30日保持＋7日soft deleteを選定済み。[ADR0041](../adr/0041-cutover-snapshot-protection.md)へ記録し、[新規鍵作成準備](vt104-owner-key-preparation-2026-09-30.md)と公式signed Ubuntu ageの合成確認を完了した。実owner鍵のprimary/backup target、既存email account、real Rとworkflow/artifact packetが残る。新しい鍵/本番snapshot/保存資源は実行packetのexact対象へ進める。


20:36 JST更新: ownerの明示指示により新規age identity/recipientをmain kshiai secdat domainのsnapshot-recovery storeへ登録し、独立読戻しと合成復号を確認した。[実registration receipt](vt104-owner-key-secdat-registration-2026-09-30.json)。公開recipientをpacketへ固定した。原WSL平文keyfile案の代わりにsecdatをprimaryとして使用する。independent secdat backup、実snapshot/restore/forward recovery R、existing email account、workflow/CI/artifact fieldsは後続packetで確定する。
