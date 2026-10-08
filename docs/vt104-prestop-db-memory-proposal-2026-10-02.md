# 停止前DB接続確認：メモリ補正の候補

## 観測結果と推奨

承認済みの管理job作成1回・execution1回を実施した。execution `kshiai-v3-trial-preflight-b6wkr`はfailedCount1。Cloud RunのCompleted条件は「configured memory limit was reached」、ログはOOM event／signal9。512Miの管理jobは完走せず、GCPのDB接続・planの結果は未確認。通常サービス、queue、DBデータ、ゲーム認証は変更していない。

同じRC2 compiled previewを既存pooler経由で手元実測：186対戦、state_json総量117,922,187bytes、最大1行3,046,729bytes。DB/module import後RSS約58Mi、previewの最大RSS630,764KiB（約616Mi）。18未完了／168完了／finished outbox14のread-only planは成功した。実装は全state_json行を保持してhashを求める。これは手元の観測で、Cloud Runの内部ピークやOOM位置そのものを観測した証拠ではない。

推奨は管理jobの上限だけを1Giへ変更して確認すること。616Mi×1.5の暫定余裕924Miを上回る。GCPでの成功は未証明で、retryで成功と決めつけない。代替の全件読み込み最適化はsource／CI／RC／prepareの更新が必要となり、追加0.5～1.5h（agent暫定・低確度）。コード変更の代わりに今回の固定workloadの容量を確認する。

## 追加作用の全範囲

GCP project kshiai／region asia-northeast1／job kshiai-v3-trial-preflightだけを対象に、memory=1Giへ1回updateし、previewを追加1回executeする。imageはRC2のsha256:2e7051ec6395d36a27124ace0cad8d032bbb6b47878509339b05ce27c679c056、source4ab1971、DIRECT_URL=kshiai-direct-url:1、command／args／job内Supabase設定／管理用NODE_ENV=developmentは先の承認と同一。CPU1、task1、parallel1、retry0、timeout120秒も同一。追加実行費用が発生する。

全argvは`docs/evidence/vt104-prestop-probe-memory-candidate-2026-10-02.json`。job idleと既存configurationを新しく読む。update前後を比較しmemory以外が変わっていないことを確認してから実行する。execution IDは新規1件だけを保存する。終端とplanを独立に読む。結果不明を再実行で解消しない。

この許可はjob update1／追加execute1だけで、通常APIのメモリ、DB処分、migration、queue停止、公開traffic／Worker、OAuth設定、有料LLM呼出しを含まない。成功なら停止・処分・試験用配備の具体的な候補へ進む。失敗なら新結果から追加観測・所有者の次の判断へ戻し、既存環境を停止しない。

GCPの終了理由と手元profile・代替・未知をCLI llmthinkで監査済み（fatal0/error0）。元の512Mi／1回実行の承認を超えるため、AGENTS.mdの開示された承認範囲に従い追加許可を求めた。内部見積りはこの確認0.1～0.25h、vt104残0.25～1h、初回V3体験1.75～5.25h、親csm0014.75～12.25h（agent暫定、低確度）。外部待ち別。次の計測checkpointは追加executionの終端とplan取得時。
