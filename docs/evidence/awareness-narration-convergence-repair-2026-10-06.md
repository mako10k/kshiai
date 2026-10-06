# Awareness実況収束検査の適合修復

## 上位契約とフェーズ

Accepted ADR0006 Verificationはreceiptごとのterminal block一つとabandoned試行の部分本文非公開を要求する。Accepted ADR0050のbatch構成とADR0057 Decisionは、成功した実況公開・未解決物理試行なし・SDK実利用台帳を要求する。claim履歴を一件に制限していない。独立reviewでこの境界を確認した。現在は同一契約への詳細設計・実装・テスト。旧V4検査の意味、worker、schema、retry、モデル、入力・出力契約は変更しない。公開Stage→Promote→Observeは後続gate。

## 観測

[rc.14 Stage37421048966](https://github.com/mako10k/kshiai/actions/runs/37421048966)のCloud Run job kshiai-persistent-e2e-jfr7rは、Narration receipts did not converge to one terminal attempt eachで失敗。候補kshiai-api-00179-junへ公開traffic切替なし。

verified CA・BEGIN READ ONLY・transaction_read_only=on・ROLLBACKで試合btl_e4cf6c24b67f68e3d38c6966a02e8234を照合。runtime revision509、tick36 terminal、incompleteReasonなし、physicalAttempts143、physicalOutstanding0。SDK143件すべてcompleted、reported total1,023,920。実況38receiptすべてcompleted、38distinct presentation、38outbox completed、lease0。35batch completed、73budget_lease_busy abandonedはhttp_attempts0。claim countは31receiptが1、残り7receiptが3/5/8/9/11/13/31。

## 生成条件と未知

persistent-battle-e2eの内部観測は、他の収束条件とともにattemptCount===1を要求する。workerのclaimはSDK送信前にattempt_countを加算し、budget lease busy時はhttp_attempts0のabandoned履歴を保存して再配送する。よって許可されたprephysical deferralから、正常公開済みreceiptのclaim count>1が生じ、observerが拒否する。claim回数をSDK回数へ読み替えない。

rc.14当時の完全な内部API応答は保持していない。複数条件をまとめたerrorなので、当時の全predicateを再現したとは扱わない。現在のDB対応値は他の収束条件を満たし、claim countが少なくとも一つの決定的な不一致と確認できる。修正後のStage成功と公開完走は未確認。

## 選択

workerのdeferralを禁止、claim counterを巻き戻す、検査を全削除する案は採らない。V5専用のtyped収束検査で、正整数claim count>=1、全receipt completed、blockなし、leaseなし、outbox completedを検証する。旧V4のterminal/exactly-one判定を維持する。順序・receipt coverage・unique presentation・runtime/SDK整合の既存検査は保持する。deferral/batch成功と失敗・不正count・未解決queueの拒否を回帰検査する。

同名.thinkのCLI audit fatal/error/warning0。PERT awareness-public-deployの実作業を再開し、CI/cloud/model待ちはactive actualから除く。新しいimmutable候補で公式Stageを通過してからPromoteと公開Observeへ進む。旧trialは保留、計画全体を完了とは扱わない。

## rc.14実利用内訳

|役割|provider/model|SDK件数|入力token|出力token|SDK報告total|
|---|---|---:|---:|---:|---:|
|creation|xai/grok-4.5|1|1451|152|2763|
|conscious|xai/grok-4.5|20|94196|5941|128496|
|subconscious|openai/gpt-6-luna|74|439695|23131|462826|
|narration|xai/grok-4.3|35|313425|9523|322948|
|adjudication|xai/grok-4.5|13|100843|735|106887|

報告totalはprovider SDKの値をそのまま合計した。入力+出力と一致するとは仮定せず、差分から非表示reasoning tokenを推定しない。料金表の確定なしに金額を算出しない。

## 実装と保存証跡の表示

SRP module awareness-narration-convergenceはbound manifest schemaVersionで検査を選択する。persistent-battle-e2eはそのtyped contractへ委譲し、既存順序・receipt coverage・runtime/SDK整合を保持する。test:awarenessに専用回帰テストのexact pathを登録した。既存artifactのoneAttemptPerReceiptという表示はV5ではoneTerminalSnapshotPerReceiptとclaim履歴の意味へ訂正し、V4は旧表示を保持する。

一つのterminal presentationは既存battle_presentationsのPRIMARY KEY(battle_id,receipt_id)とUNIQUE(battle_id,sequence)、V5 publicationでentry completionとpresentation INSERTの同一transaction・rowCount=1、公開snapshotのsequence一意性とreceipt coverageで担保される。今回新しいDBacceptance基準は追加しない。

開始点はactive worktree cc304、merged PR168 branchからfresh origin/main8d87edへ。tree一致を確認し、branch preflightのunrelated dirty/missing-origin dispositionを記録してcodex/awareness-narration-convergenceへ同checkoutで切り替えた。未承認AGENTS/旧trial/evidence等のWIPは保持し、今回commitへ含めない。

PERT document check・dag analyze両schedule・dag nextはok。observe-velocityは既知PTHIS-103 history競合で利用不能、perttool Issue42に記録済み。実作業のstart/resume/suspendは正規CLIで測定し、未観測velocityを実績として扱わない。

## 回帰検査と独立レビュー

関連22件成功。通常governed201件成功。awareness317件中314成功・失敗0、local PostgreSQL未設定3件skip。独立reviewは当初artifact生成で公開DTOにないassetManifest参照を検出し、内部でparse済みmanifestSchemaVersionの返却へ修正した。公開DTO拡張やV4 fallbackは導入しない。旧sourceで開始済みbuild/lintの型エラーは合格と扱わず、修正後の最終build/lintを再実行する。

修正後の最終build/lint成功、全workspaceとdeployment型検査・静的検査を通過。独立最終review残存INSIDE0。既存frontend chunk-size warningは残存するが今回observer repairの型/検査不合格はない。次gateはexact PR/mainCI（nativePG含む）と新候補Stage。
