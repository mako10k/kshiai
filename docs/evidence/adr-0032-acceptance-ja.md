# ADR-0032 revision 1 受理記録（日本語）

- 日付: 2026-09-15
- 決定者: 製品オーナー
- 正本: `docs/adr/0032-separate-authoring-time-boundaries.think`
- 受理対象: ADR-0032 revision 1
- 受理前SHA-256: `c9e8ee12edd8f57d796ab389958c8a8f741011fd853b49662f265291bbdb8409`
- レビュー結果: PASS、P0〜P3 0件
- レビュー記録SHA-256: `a343bd98f862d7e7f484134ff201ff8c0ae88d8f3590c3af72260426b5ddda6a`

## オーナー判断

完全な日本語レビュー範囲とPASS結果を提示した直後、製品オーナーは
`ACCEPT`と回答した。この回答により、ADR-0032 revision 1の時間境界
アーキテクチャを受理する。

## 受理された内容

- provider通信timeout、worker実行境界、意味的な無進捗・循環終了、call・step・
  token・費用の累積上限を別の制御として扱う。
- 固定されたattempt全体wall-clockを、意味的な失敗条件として使わない。
- provider timeoutは型付き通信結果とし、別途受理された限定回復が存在するときだけ、
  その回復を他のbudgetおよびfenceの範囲内で利用できる。
- providerおよびworkerの具体的な時間値は、対象route、platform、測定結果、
  オーナー待ち時間budget、exact policyが別途受理されるまで未決とする。

## ライフサイクルと境界

ADR-0031はADR-0032により`Superseded`となる。ADR-0031 D7の時間意味だけを
ADR-0032が置き換え、D1〜D6、D8〜D11およびD7の時間以外の制御はADR-0032 D5が
引き継ぐ。

このACCEPTは、具体的な時間値、設計書修正、実装、provider call、deployment、
route選択、policy activation、commit、pushを許可しない。
