# ADR-0033 revision 1 受理記録（日本語）

- 日付: 2026-09-15
- 決定者: 製品オーナー
- 正本: `docs/adr/0033-runtime-config-not-run-identity.think`
- 受理対象: ADR-0033 revision 1および適合する実装設計revision 6
- 受理前ADR SHA-256: `ae8b736857b59188880acbf397e2da941caf5c102539b2410ddd7011fd1f529a`
- 受理前設計SHA-256: `a0f2ba909d3c71fb7de2235bd84125b420663f6f8b5400c4236eaf92e832ebff`
- Review結果: PASS、P0〜P3 0件
- Review reasoning SHA-256: `cdd328284fd76310ef28dfaff0f59c2e7cf559828c738a3a71c85839be1567d3`

## オーナー判断

PASS結果と完全な日本語review範囲を提示し、`ACCEPT`がADR-0033 revision 1と実装設計
revision 6の双方を受領することを明示した直後、製品オーナーは`ACCEPT`と回答した。

## 受理された内容

- Provider Transport ConfigとWorker Execution Configの世代IDまたはsnapshotを、共通の
  durable Run identityには含めない。
- Run/source identity、provider request lifecycle、reservation、receipt、単調なaccounting、
  fence、question/answer、技術結果、final candidate metadataは永続化する。
- 同一Run内のprovider通信回復は、そのlive executionで選択済みのimmutable Configを使う。
- processまたはworker lease喪失は現在のRunを終了し、明示的retryはその時点のConfigで
  sourceから新しいRunを再構築する。
- 将来、exact replay、complianceなどでConfig履歴が必要になった場合は、別の受理済み
  永続化判断を要求する。

## 未決事項と境界

具体的なprovider timeout、worker lease、有限transport-recovery値は未決のままである。
実装時には、Config世代IDを保存せずに再起動後のlease失効を判定できる永続claim事実を持つ。

この受理は、実装、commit、push、provider call、deployment、migration、activation、rollback、
releaseを認可しない。
