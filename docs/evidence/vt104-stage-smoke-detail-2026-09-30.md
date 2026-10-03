# vt104 Stage smoke実装と実行接続

> 2026-09-30方針更新: 以下は旧保全・八smoke前提の歴史的資料。現行の初回試行条件は[計画再修正](vt104-unreleased-trial-rescope-2026-09-30.md)と要件v3を参照する。ここに記載したemail/snapshot/restoreの不足を現行vt104のblockerとして扱わない。

上位入力: Accepted ADR-0040 r1、linked detail「Stage受入の全条件」「候補file set」。既存のSupabase認証・通常owner review/confirmを使用し、その配備後の動作を確認する。email smokeは既存emailアカウントのpassword sign-in、共通JWT検証、既存application mappingのSELECT。メール送信や新しい認証方式の導入ではない。Googleは実ログインのtokenとsignin receipt、同じJWT verifierと既存mappingを確認し、指定ownerのAPI ownershipは独立receiptで検証する。

## ローカル実装

- `services/supabase-identity.ts`: ES256/JWKS、issuer、audience、authenticated role、subjectを一元検証。通常authは既存provision処理を保持し、cutover authとsmokeは既存mappingを読む。
- `services/cutover-stage-smoke.ts`: run/owner/kind/対象/各step最小・最大回数をstrict manifestで固定。trialのexact requestと最大reservationに照合する。closed、別owner、変更対象、上限超過を拒否し、不明な外部結果・不足readbackはindeterminate。permitのsettledは各step完了後のみ。
- `services/stage-auth-smoke.ts` + `scripts/stage-auth-smoke.ts`: email/Google既存アカウントを認証し、mapping一致を読む。新user/assetの作成・削除を行わず、token/password/profileをreceiptへ保存しない。既存legacy supabase-auth-smokeはcutover設定時にこのadapterへ誘導する。
- `scripts/stage-postgres-smoke.ts`: exact schema、runtime script hash、全31migration hash、credentialを除く接続先を固定する親permit。既存postgres-runtime-smokeを子として実行し、全runtime検証を隔離schemaで保持する。子は親sending permitを確認してからDDLを開始し、自ら作成したschemaだけcleanup。親がschema不存在を独立readbackしてsettleする。
- `services/stage-r2-smoke.ts` + `scripts/r2-smoke.ts`: exact既存objectのS3 HEAD1回とpublic HEAD1回、SDK最大attempt1。空bucket・別先頭objectによるpassをやめる。
- `services/stage-http-smoke.ts` + `scripts/stage-http-smoke.ts`: healthのpostgres/Supabase/exact revision、固定owner mapping、direct originの401/403を別permitで確認。503はdirect protectionの成功として扱わない。
- `services/stage-v3-smoke.ts` + `scripts/stage-v3-smoke.ts`: 固定二generationとcreate key/body、deterministic battle IDで実作成。V4 stored bindingを読み、advance/streamを1回実行し、done frame・battleRevision増加・同一generationを再読する。通常provider上限とHTTP/background admissionも別bindingで保護する。

各scriptはabsolute STAGE_SMOKE_MANIFEST_FILEと同じCUTOVER_ID/CUTOVER_ARTIFACT_IDを受ける。manifest自体にtoken/credentialを含めない。PG compiled script hashとsource script hashは異なるため、実際に配備するimage内のcompiled scriptを用いて最終manifestを生成する。Googleの取得済tokenだけではbrowser signinの証拠が不足するため、実ログインreceiptを別に固定する。

## 検証の意味

共通JWT verifier3ケース、bounded smoke10ケース、実email CLI1ケース、closed owner confirm→trial→V3 create→SSE advance1ケースがローカルで成功した。email CLIはloopback Supabase doubleと実ES256署名/JWKS、SQLite mapping、persistent permitを使用し、新user/asset作成なしを確認した。実Supabaseへのsignin証拠は後続Stage実行で取得する。

PostgreSQL17.11のloopback TLS環境で、実supervisor→実runtime smoke→cleanup→独立schema readbackが成功し、permit settled、残存schema0を確認した。trial admissionのsetupは合成fixtureであり、本番の停止/削除/回復証拠とは区別する。通常review/confirmからのtrial遷移は別Hono統合試験で実行した。最初のSSE試験は作成直後のfollowにイベントがなく失敗したため、実際のadvance/stream1回とstored進行読戻しへ訂正した。

## Stage実行への接続 — 残作業と判断基準

既存stage-release workflowはqueue RUNNING、旧V2 smoke、shared Worker preview設定writeを含む。今回のpaused共有切替へ接続する詳細file setは `.github/workflows/stage-release.yml`、`.github/workflows/promote-release.yml`、`.github/workflows/rollback.yml` とrelease evidence validator。Accepted detailはworkflowsをexact operation packet統合段階の別file setとして固定する。現在のpacketはartifact IDs、snapshot保護先/回復時間、real generation IDs、全request/provider/task上限が未確定である。まず停止前のimmutable artifact準備と停止中の同artifact検証を分けた候補を作り、上記workflow file setへ実装する。

1. 停止前にhosted exact source/四CI/image digest/Worker versionを固定し、cutover identity付きbackendとjobの同一imageを確認する。Worker shared設定writeは最大作用へ明示する。
2. Stage/promote/rollbackを共通排他へ接続し、一人のexecutorが停止・trial・promotionを担当する。今回のローカル作業は直列で進める。独立readbackは別時点・別照合による確認を意味し、並行agentを必須としない。
3. exact owner/二generation/HTTP key・digest/各smoke manifest/各step回数をtrial policyへ固定する。email既存検証アカウントは認証とmappingのみ、指定ownerのGoogle/API ownershipは別receiptとする。他ownerの一般API例外を追加する場合は上位owner決定へ戻る。
4. 八独立receiptとpermit settled、source/image/revision/Worker/run一致を確認するvalidatorを通し、protected promotionのreadback後にopenする。SSE単独成功でpromotion条件を満たした扱いにしない。
5. owner管理保護保存先（暗号化・access principals・保持期間）、restore先と実測回復上限Rをpacketへ入れる。停止上限1800秒からRとreadback予備を引き、最終開始時刻を計算する。

完了条件: 全八smokeの実Stage receiptとsame-artifact照合、回復条件、protected promotionの承認候補が具体化すること。今回のローカル試験はこの条件を準備する証拠として使用する。


最新全体検証: [validation JSON](vt104-stage-smoke-local-validation-2026-09-30.json)。選択unit173＋release24＋authority9＝206成功、active37/provisional2/disabled141。typecheck/build成功、deployment3、PGcontrol3成功、source555件/aggregate一致、SealGraph fsck ok。PG server停止とport不存在を読戻した。repo ADR checkは既存ADR0039のACCEPTANCE decision marker欠落で失敗し、新ADR0041自身のDSL/Accepted markerは成功した。0039にはowner acceptance evidence/受入ledgerが存在するため、既存Accepted方向の不成立を意味しない。受入済SHAとcause closureを保つgovernance経路でmarker投影修正を準備する。
