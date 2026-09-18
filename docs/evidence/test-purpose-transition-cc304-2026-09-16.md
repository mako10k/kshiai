# cc304 focused テストの目的切替（2026-09-16）

対象ファイル: `backend/src/services/character-focused-authoring.test.ts`

| 目的 | 検証REF | 現在の扱い |
| --- | --- | --- |
| テスト側で変更領域を外見に固定した focused 修正経路を含む、旧ファイル全体の検証 | `verification/character-focused-authoring-v1` | 現行ファイルの根拠としては廃止。旧Seal `94375ea43c0365b18d1abd3f4478d25f93c86c850eb6b099e0458ab7e2647679` は旧ソース・旧Causeに対する歴史的記録として保持する。 |
| 通常の自然文依頼から provider を用いて変更領域を解決し、同一試行で計数・固定してから候補化する cc304 の試行を含む、現行ファイル全体の検証 | `verification/character-focused-authoring-request-scope-v1` | 新設。現行Seal `261afce4e0d6c8cf1b9f8aa47c62318ca6747d3c680512e095c8432a940bd4f1` は現行ソースに一致し、stale なし。選択器は `active/current` と判定する。draft のままであり、受入や実運用の根拠ではない。 |

旧Sealの内容、Cause、REFは書き換えない。旧目的の廃止は履歴の消去ではなく、現在のテスト選択から旧REFを外すことを意味する。同じファイルに残る create・migration 等のテストも、新REFに自動的に根拠が継承されるわけではない。

新目的の変更領域推定・曖昧／複数領域の拒否は受入済み ADR-0035 D1–D3 に従う。ADR-0035 は accepted character v5 と foundation v3 の正確なSealsをCauseに持つ draft Seal `a9b3027111f06e7e64784c87e489646d106d7464f5d191202d17aa647364a25d` として登録した。ファイル全体の create・revise・migrate・retry 等の根拠は、受入済み設計 revision 6 のソースSeal `0824b33d08238bf6192b9eb504c2d5cb66276f35e40d56a714b205fa3a805a98` とした。ADR-0035 は create・migration 全体の根拠ではない。

最初の新Seal `d4a1ebc5facd6c38614b57590b425be4e5a347056244eaeb426496eaa2a8095a` は、現行 revision 6 と旧 revision 5 の履歴を併記した受入記録Seal `78b528ccf5bf56869449a3d52363845847ef697b1b5484b2b9986b3af89fdaf3` を直接Causeにしたため、旧 revision 5 側の transitive stale を継承していた。履歴・受入記録・旧Sealは変更せず、再確認後に新テストのCauseを現行設計ソースSealへ付け替えて再Sealした。テスト内容は同一である。これは根拠経路の整合であり、テスト通過だけによる有効化ではない。

直接の診断実行は8件成功した。現行Sealでは選択器も `active/current` と判定するが、両CauseとテストSealは draft である。今回の確認は設計・ADRとの局所的な整合とテスト選択までであり、cc304の受入・配備・pointer有効化、v2→v3移行の完了を宣言しない。
