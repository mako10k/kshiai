# 実装設計候補v1 revision 5 自己点検 — 全文日本語訳

## 目的

Revision 5がrevision 4独立レビューのP1指摘2件を訂正したかを点検する。この点検は
候補の受理ではなく、独立再レビューの代替でもない。

## Exact対象

- 英語設計候補SHA256:
  `426470047d0e380de90624192b9db71d3f30788fa44423ed0710f9cb1e6cdba4`
- 完全な日本語投影SHA256:
  `7130a67b9e13521d072c7c10cb5d3c1d4bb2bcf08268322b22765ac4596434a0`

## 観測

1. Section 7.2は、累積資源admissionより先にtransport recoveryの適格性を判定する。
   recovery 0、recovery消費済み、真実なserver導出recovery basisなしは、それぞれ異なる
   理由を持つ回復可能な`provider_transport_unavailable`とowner新run recipeで終端する。
2. 累積資源admissionは、それ以外は適格なrecoveryについてだけ実行する。admission失敗は
   `resource_exhausted`で終端し、枯渇した累積dimensionをすべて特定し、消費済みまたは
   保持予約accountingを記録する。provider unavailableへ読み替えない。
3. 両failure分岐ともsource timeout receiptと単調accountingを保持し、意味的無効性を
   主張せず、resetも別attemptの自動開始もしない。
4. Section 10のfixtureは、recovery 0、消費済み、根拠なし、それ以外は適格だが資源admission
   失敗を別parameterとして検証する。最初の3つはprovider transport unavailable、4つ目は
   exact dimension・accounting付きresource exhaustedへ到達し、全経路でblind replayがない
   ことを要求する。

## 判断

Revision 5は、決定的な遷移優先順位と対応するconformance義務により、revision 4のP1指摘2件を
閉じている。cc304はsuspendedのままとし、このexact revision 5を独立再レビューへ提示する。

正確なprovider timeout、worker lease、transport recovery 0回/1回の選択はADR-0032に従い未決で
ある。この自己点検から設計受理、実装、route activation、数値policy選択を推論してはならない。
