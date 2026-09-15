# cc304 Revision 5 時間policy修正 — 2026-09-15

## 結果

旧D11 revision 2由来のprovider 60秒、whole-attempt 240秒を共通semantic authoring
policyと実行停止条件から除去した。別の既定値には置き換えていない。

- provider transportは`ProviderTransportPolicyV1`のidentity、route identity、正のtimeout、
  recovery 0/1を明示入力とする。
- workerは別の`WorkerExecutionPolicyV1`のidentity、platform identity、正のleaseを明示入力とする。
- focused providerを設定した実行ではworker policy欠落をjob claim前に拒否する。
- focused claim、renew、heartbeatは同じ明示lease値を使用する。
- elapsed timeは観測・会計には残すが、whole-attempt累積打切りには使用しない。
- 同一run recovery=1はまだ未実装なので、指定時にfail closedする。
- legacy authoring routeの既存lease defaultは変更していない。

## 検証

- semantic authoring、focused owner-worker、authoring jobの対象テスト: 82/82成功。
- shared/backend/frontend/deployment typecheck: 成功。
- `git diff --check`: 成功。
- 製品provider call、Stage、本番、deployment、activation: 未実施。

## 未完了

実運用のtimeout、worker lease、recovery 0/1は未決であり、この修正は数値を承認しない。
またtransport/worker policy identityはruntime設定として分離したが、独立したrun永続列への固定は
未実装である。同一run recoveryのrequest identity、recovery basis、CASも未実装である。
したがって`cc304`とRevision 5 runtime適合全体は未完了のまま維持する。
