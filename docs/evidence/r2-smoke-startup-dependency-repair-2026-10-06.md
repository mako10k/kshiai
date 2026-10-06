# 通常R2検査の起動依存修復

## フェーズ・契約

既存official StageのR2 credential/list/public HEAD検査とcutover permit付きexact-object検査を維持する詳細設計・適合修復。ownerの公開配備・完走指示、SRP・疎結合要求に基づく。DB/auth/queue credential追加、production validator無効化、既存R2 gate削除は行わない。旧trial保留を維持し、rootが唯一の外部executor。

## 観測と生成条件

rc.15 Stage37423808342はbattle/auth/SSE/SDK/narrationを通過。34tick正常終了、129SDK/36実況すべて成功、total937,918、outstanding0。その後R2job kshiai-r2-smoke-kn6rrが2026-10-06T06:40:02ZにDATABASE_URL is required when NODE_ENV=productionで起動失敗した。公開Promoteなし。

r2-smokeはconfig/db/旧stage helperをmodule-load時に読み込む。旧helperもcutover DB/controlへ依存する。通常branchはS3一覧とpublic HEADだけなのに、全app設定が先にDB/auth/media/queueを検証する。StageのR2jobはR2envとR2secretだけを設定する。この不要なeager dependencyが、観測した起動失敗を生成する。実R2credential/objectの正常性は、runner起動後の検査まで未知。

## 詳細設計・代案

CUTOVER_IDまたはCUTOVER_ARTIFACT_IDのいずれかが設定された場合だけ、既存config/db/manifest/permit helperをdynamic importする。configのpairと全validatorを維持し、不完全な指定を通常経路へ落とさない。通常経路はR2設定とS3SDKのみで起動し、既存list/HEAD/maxAttempts1を保持する。clientをfinallyでdestroyする。

全appcredential注入は権限とcouplingを拡大し、NODE_ENV変更はproduction検査を迂回する。gate削除は完了条件を弱める。選択案は同じ外部検査を維持し、不要な読み込み依存だけを切る。

productionかつDBなしのsubprocessがR2 required-fieldへ到達すること、cutover指定が従来のvalidator/permitでfail-closedすることを回帰検査する。focused・型検査・通常必須checks・独立review・exactPR/mainCI後、新immutable候補Stageで実R2検査まで通過させる。同名.think CLIaudit0fatal/error/warning。

## 実装・局所検査

対象はr2-smoke.ts、scripts/r2-smoke-startup.test.mjs、package.jsonのexact test:awareness登録。通常経路のapp/DB/stage static importを除去し、いずれかのcutover ID指定時に従来configを読み込み、検証済みcutover時だけdb/manifest/permit helperを読み込む。R2 clientは両経路のfinallyでdestroy、cutover DBは従来のfinallyでclose。既存list・optional public HEAD・maxAttempts1を維持する。

production/DBなしでR2 required-fieldまで到達、partial cutoverでproduction app guardを保持、必要なfake local configを供給したpartialpairで既存pair guardを保持するsubprocess回帰3件成功。外部R2へ接続する前の起動依存のみを検証し、実credential/list/public healthは未確認。backend typecheck成功、diffcheck成功、独立最終review INSIDE0。CIはtest:releaseを直接呼ばないため、既存CIのtest:awarenessに新testのexact pathを含め、SealGraph未登録による通常test無効化へ依存しない。

開始点はmerged PR169のfresh main f9d0462と同一treeを確認したcc304 worktree。branch preflightで未関係WIPを保持する理由を記録し、codex/r2-smoke-dependencyへ切替。既存WIPは今回変更・commit対象に含めない。

全体build/lint成功、governed201成功、awareness320中317成功・localPG未設定3skip・失敗0。CIのnativePostgreSQLとproduction runner回帰実行を次gateとする。
