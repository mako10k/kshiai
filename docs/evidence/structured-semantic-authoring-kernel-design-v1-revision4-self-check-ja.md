# D11 実装設計 Revision 4 — 自己確認

- 状態: 自己確認完了、独立レビュー待ち
- 対象: 実装設計候補 v1 Revision 4 全文
- 英語版SHA-256: `559c8bce9165b51a3aa274c701ee17aee3fe97a96652601cb8b2f7fc71537594`
- 完全日本語投影SHA-256: `b830a65bfe35387e96438eb28774d3dd3505903793e0598c02ec8c1a5949e83b`
- 権限境界: 自己確認であり、レビューPASS、owner受入、実装認可ではない

## 確認結果

Revision 3のP1指摘だけを修正した。

1. timeout済みrequestは、現行fenceのCASで`outstanding`から`timed_out`へ終端化した後にだけ
   recoveryできる。late resultはreceiptとして保持できるがcandidateへ適用できない。
2. 同一run内recoveryは別request identityと`recoveryOfRequestId`を持ち、strategy changeを
   消費し、変化したtransport conditionまたは実質的に異なる認可済みrequestを型付き
   `recoveryBasis`として正確に1つ記録する。
3. recovery 0、消費済み、またはadmission不可では、runを回復可能な
   `provider_transport_unavailable`技術failureへ移し、source、receipt、accounting、新run再開
   recipeを保持する。
4. timeout handlerがfenceを失った場合は書き込まず、現行recovery ownerが既存の
   process/lease-loss遷移を行う。
5. provider request状態を閉じ、terminal request identityの再open・再利用を禁止した。
6. parameterized fixtureは、上記遷移、recovery 0/1、late result、fence喪失を証明する。

数値timeout値とrecovery 0/1の選択はADR-0032どおり未決定のままである。`cc304`はsuspendedを
維持し、Revision 4を新しい`REVIEW`対象とする。
