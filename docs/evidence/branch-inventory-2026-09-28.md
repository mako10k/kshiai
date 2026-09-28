# ブランチ棚卸しと整理根拠（2026-09-28）

基準: `origin/main` = `c526972d289d46146b02d37a31d15e35efcccc80`。GitHub から fetch/pr 状態を読み戻した時点の記録。ローカル 66 本、リモート 11 本、ワークツリー 5 個。PR の squash merge により Git の祖先判定だけでは統合済みと判定できないため、PR の `headRefOid` とローカル先端の完全一致を使う。

## 固有作業または判定待ちのローカル参照

| ブランチ | 先端 | 役割と状態 | ワークツリー |
| --- | --- | --- | --- |
| `codex/cc304-focused-revise` | `cc2e2cef8` | V3 Stage 試行の計画修正・差分監査。現行の計画 WIP。 | あり |
| `codex/monotony-log-rca` | `f510a44ef` | Compact psyche 修正。ローカルにリモート未反映の1コミットがある。 | あり |
| `codex/stage-observation-rc3` | `93ddad3f3` | Stage 実測観察の記録。ローカル固有の1コミット。 | あり |
| `codex/v3-stage-trial-candidate` | `77ed6a01b` | V3 キャラを V4 バトルへ結合する実装 WIP。未完成。 | あり |
| `docs/narrator-context-compression` | `971c768a4` | ナレーター入力圧縮の検討文書。未統合。 | なし |
| `eval/character-focus-replay` | `09d36203d` | character focus の独立レビュー記録。未統合。 | なし |
| `main` | `9243f6a6c` | 旧ローカル本線。origin/main と大きく分岐し、固有差分の扱い未確定。 | なし |
| `poc/battle-pipeline-projection` | `28fb5bab9` | 旧 battle pipeline 試作。PR #62 は未マージで終了。 | なし |
| `release/v0.17.3-tag` | `6bbf60f2c` | リリース用ローカル参照。origin/main の祖先で削除可能。 | なし |
| `wip/v0.17.2-production-handoff-20260812` | `90b206039` | v0.17.2 本番引継文書。未統合。 | なし |
| `work/sda-character-norm-receipts-20260814` | `a9ea6aceb` | 対話活性化の旧引継。現在の主 checkout。 | あり |

## マージ済みPRと先端が完全一致するローカル参照

以下の55本は対応するマージ済みPRの最終 head commit と完全一致し、どのワークツリーでも使用されていない。PR の URL と commit ID が復元手掛かり。ローカル参照を削除しても PR とその履歴は残る。

| ブランチ | 先端 | マージ済みPR |
| --- | --- | --- |
| `codex/compact-release-correction` | `0bea1af95c4f1c8e158af6d4c6b52ceb96ce7067` | [#142](https://github.com/mako10k/kshiai/pull/142) |
| `codex/dialogue-activation-authority` | `b88f652310a0115e0300bc5b536fc1d3729be897` | [#130](https://github.com/mako10k/kshiai/pull/130) |
| `codex/dialogue-stage-smoke-2-outcome` | `d6afdc8321b8975695ef8235697879598cb99e56` | [#132](https://github.com/mako10k/kshiai/pull/132) |
| `codex/dialogue-stage-smoke-outcome` | `d6bd069391644d8c8ae80c41d0a2016cb840f54d` | [#131](https://github.com/mako10k/kshiai/pull/131) |
| `codex/e2e-battlefield-readiness` | `4ae89ba32772dc532e1af27fc30eff0439cae69b` | [#133](https://github.com/mako10k/kshiai/pull/133) |
| `codex/promotion-recovery` | `01e2256eac93c8c7cf058842d0c3a48cdb36cb8b` | [#144](https://github.com/mako10k/kshiai/pull/144) |
| `codex/rc9-stage-horizon-remediation` | `09ab6de1aeb9dd056cb8f1a0ec08aa868f151274` | [#143](https://github.com/mako10k/kshiai/pull/143) |
| `docs/battle-observation-kpis` | `7671d8670d694b4e243ceb8ef27b36a808832ef1` | [#110](https://github.com/mako10k/kshiai/pull/110) |
| `feat/agent-action-proposal-contract` | `fc4b39a0a179ce86b6a57e20c6b8aae14badd774` | [#48](https://github.com/mako10k/kshiai/pull/48) |
| `feat/agent-pipeline-dag` | `cb49f98cd3f73d38b3e65976de8df94374b45c8b` | [#44](https://github.com/mako10k/kshiai/pull/44) |
| `feat/causal-narration-pipeline` | `19562b0aaa02cf8e02f2e1269649c2ba37a33886` | [#34](https://github.com/mako10k/kshiai/pull/34) |
| `feat/character-focus-shadow` | `9f1bf6aae7f56038a3ac1601d4313b2ea1e626f9` | [#112](https://github.com/mako10k/kshiai/pull/112) |
| `feat/persistent-e2e-observer` | `8c1c017cac443ddf797113fdf2a9d671fde6c163` | [#38](https://github.com/mako10k/kshiai/pull/38) |
| `feat/value-driven-free-actions` | `5b692ca05ec75b78ffc231de671e8e4135575206` | [#29](https://github.com/mako10k/kshiai/pull/29) |
| `fix/llm-provider-fallback-policy` | `a4f272f43987201f838ea8b4455cb1bfe196dcf8` | [#56](https://github.com/mako10k/kshiai/pull/56) |
| `fix/persistent-e2e-receipt` | `f3153e7d2689c6c6e25176c7a4dc3117eca86088` | [#41](https://github.com/mako10k/kshiai/pull/41) |
| `fix/provider-operation-accounting` | `6715062a377e8158dd6856c693870febc48c7c16` | [#107](https://github.com/mako10k/kshiai/pull/107) |
| `fix/stage-release-followup` | `cb3a5e8912b8e815c7248655ab8526fdb7a82d32` | [#103](https://github.com/mako10k/kshiai/pull/103) |
| `fix/stage-shared-build-v0.17.3` | `701bdade84c545893c01d6a23a1364ee9435c8f7` | [#105](https://github.com/mako10k/kshiai/pull/105) |
| `fix/v0.17.0-observation-rca` | `4de13808ae03979f66374c59aaa7ebc32e0030c5` | [#101](https://github.com/mako10k/kshiai/pull/101) |
| `fix/v0.18.1-character-upgrade-contract` | `773f5c1915e672e5d074e494f1d13c48eaea014d` | [#114](https://github.com/mako10k/kshiai/pull/114) |
| `ops/0.7.2-staging-evidence` | `cde13188c2daa8f6d55aedffca3de7860bf290e9` | [#36](https://github.com/mako10k/kshiai/pull/36) |
| `ops/2026-08-07-battle-pipeline-handoff` | `e2b67d806aa1db34cc3604f53f19df780269266f` | [#61](https://github.com/mako10k/kshiai/pull/61) |
| `ops/record-v0.17.0-deployment` | `e437c80580e36e79e5d1973619baf4c7df1b57e9` | [#100](https://github.com/mako10k/kshiai/pull/100) |
| `ops/record-v0.7.2-production` | `75f598202be11d229264700f85580f0fd4cefff8` | [#37](https://github.com/mako10k/kshiai/pull/37) |
| `ops/release-0.10.0-observation` | `3673cfbe9fbb435222e5083e06b7a4286f276f7c` | [#46](https://github.com/mako10k/kshiai/pull/46) |
| `ops/v0.11.0-observation` | `33bf816191e4bb6170ff26e761705f763b148868` | [#50](https://github.com/mako10k/kshiai/pull/50) |
| `ops/v0.11.1-observation` | `d7c4411e1453af72720cbe68919f70c8a3d6e6cb` | [#52](https://github.com/mako10k/kshiai/pull/52) |
| `ops/v0.12.0-observation` | `748fa01c3ad1def695002d123436eedc1dc404c9` | [#54](https://github.com/mako10k/kshiai/pull/54) |
| `ops/v0.12.2-e2e-observation` | `9cc0b849477aa081a71341c1cc2f7842f990de15` | [#59](https://github.com/mako10k/kshiai/pull/59) |
| `ops/v0.12.2-e2e-observation-record` | `20e3c2ca1e404ff2f937d21e5f8dce69164a4a7f` | [#60](https://github.com/mako10k/kshiai/pull/60) |
| `ops/v0.12.2-release-record` | `a1a2d2afb930f6c883b72db86bde6a6822767bd2` | [#58](https://github.com/mako10k/kshiai/pull/58) |
| `ops/v0.17.1-production-observation` | `890d7de65ab5772067670f3cd9cd304944de2ebe` | [#104](https://github.com/mako10k/kshiai/pull/104) |
| `ops/v0.17.3-observation-receipt` | `ed8d677c8dc79d3846fa6f643bbc8503a0bc40e6` | [#106](https://github.com/mako10k/kshiai/pull/106) |
| `ops/v0.17.4-release-observation` | `0401f6ad54bec2eb25a1b3db074bd12cb3ff715a` | [#109](https://github.com/mako10k/kshiai/pull/109) |
| `ops/v0.8.0-e2e-evidence` | `520a37637bf5ac4818b2fd733c2f3946d23c37eb` | [#40](https://github.com/mako10k/kshiai/pull/40) |
| `ops/v0.9.0-observation-closeout` | `b4f572b106fdb3d20b40101de74ca872f797981f` | [#43](https://github.com/mako10k/kshiai/pull/43) |
| `plan/character-attention-hypothesis` | `4b70806134b1ea929968e1f6b2e9c1c6b3003aa3` | [#111](https://github.com/mako10k/kshiai/pull/111) |
| `plan/observation-driven-pipeline-priority` | `814fac128b8e7fd0ee60045fe37d3aaf339adada` | [#47](https://github.com/mako10k/kshiai/pull/47) |
| `release/0.10.0` | `f3f718fb3fc194d8310623c6ae9b840e7d1b65b0` | [#45](https://github.com/mako10k/kshiai/pull/45) |
| `release/0.11.0` | `c08149693bff56e1e6bab2a938af5c89285a4da7` | [#49](https://github.com/mako10k/kshiai/pull/49) |
| `release/0.12.2` | `4c67c6282837dfe7c48d2f059553ad5c7d529e02` | [#57](https://github.com/mako10k/kshiai/pull/57) |
| `release/0.17.1` | `5895ec0e62fb4238958e0436b1b1ac4120eb16e9` | [#102](https://github.com/mako10k/kshiai/pull/102) |
| `release/0.17.4` | `f6f0bd08dc4a38c0b45e09eb4f5303f6c58d9dc0` | [#108](https://github.com/mako10k/kshiai/pull/108) |
| `release/0.19.0` | `9dba45a652d4e7003ca9a6b45d4978bedf834ceb` | [#116](https://github.com/mako10k/kshiai/pull/116) |
| `release/0.7.0` | `af2d70343d1c94d93f718784f0e25179c33adc41` | [#30](https://github.com/mako10k/kshiai/pull/30) |
| `release/0.7.2` | `559765068095c0c585d4d9ea22e37be1b824cae0` | [#35](https://github.com/mako10k/kshiai/pull/35) |
| `release/0.9.0` | `97c8787e80f3fc3aab0d6a0f419c4c9e62025762` | [#42](https://github.com/mako10k/kshiai/pull/42) |
| `release/v0.11.1` | `9bee7c473902ca769296bd2f40fb143bb30a41cf` | [#51](https://github.com/mako10k/kshiai/pull/51) |
| `release/v0.12.0` | `3aaf40f215fd532577bef0e3739a98f6a231087a` | [#53](https://github.com/mako10k/kshiai/pull/53) |
| `release/v0.12.1` | `98ad1e4850105e5e1430e49dfa86c8ca9af43f30` | [#55](https://github.com/mako10k/kshiai/pull/55) |
| `release/v0.17.0` | `ea4fdace85f184840076c224d4ae365e101ccb9c` | [#99](https://github.com/mako10k/kshiai/pull/99) |
| `release/v0.18.0` | `f42ef49988447fd4e7ac0d49b4adfe470b0baa08` | [#113](https://github.com/mako10k/kshiai/pull/113) |
| `release/v0.8.0` | `a46d95d49ecfec737bb3bda95947a1b1bc602e7d` | [#39](https://github.com/mako10k/kshiai/pull/39) |
| `work/structured-domain-assets-integration-v0181` | `fb3ff608e1ac8b82b65d199e743f66129de3e592` | [#115](https://github.com/mako10k/kshiai/pull/115) |

## リモート参照

| ブランチ | 先端 | 役割と扱い |
| --- | --- | --- |
| `origin/agent/document-appraisal-subject-rca` | `265d75dff` | 文書 appraisal の RCA。Draft PR #93 がオープン。 |
| `origin/codex/cc304-focused-revise` | `cc2e2cef8` | 現行計画 WIP の同期先。 |
| `origin/codex/monotony-log-rca` | `154dcb453` | Compact psyche 引継の同期先。ローカルが1コミット先行。 |
| `origin/codex/v3-stage-trial-candidate` | `77ed6a01b` | V3/V4 結合 WIP の同期先。 |
| `origin/docs/narrator-context-compression` | `971c768a4` | 未統合の検討文書。 |
| `origin/main` | `c526972d2` | 最新の共有基準線。 |
| `origin/ops/cicd` | `eab15a86b` | 旧 CI/CD 作業。PR #1 はマージ済み。 |
| `origin/poc/battle-pipeline-projection` | `1559493c9` | 旧試作。PR #62 は未マージで終了。ローカル先端は別。 |
| `origin/release/0.8.0-opponent-memory` | `4976a251a` | 旧 0.8.0 リリース候補。PR #63 は未マージで終了。 |
| `origin/wip/v0.17.2-production-handoff-20260812` | `90b206039` | 本番引継の同期先。 |
| `origin/work/sda-character-norm-receipts-20260814` | `a9ea6aceb` | 旧対話活性化引継の同期先。 |

## ワークツリーと整理境界

主 checkout と4つの linked worktree はすべて作業ツリーが clean。ただし、clean は作業完了を意味しない。`codex/cc304-focused-revise`、`codex/v3-stage-trial-candidate` は現行の計画・実装 WIP、`codex/monotony-log-rca` と `codex/stage-observation-rc3` は固有コミットを持つ。これらは統合可否を個別確認するまで維持する。

今回の確定整理対象は上記55本と `release/v0.17.3-tag` のローカル参照、およびマージ済みPR #1 と先端が一致する `origin/ops/cicd`。その他のリモート参照、未マージPRの再開・終了、固有作業のマージ、ワークツリーの撤去は未判定。

## 実施結果

55本のマージ済みPR一致参照と `release/v0.17.3-tag` を、削除直前に先端・PR・ワークツリー状態を再照合してローカルから削除した。ローカルは66本から10本になった。さらに `origin/ops/cicd` はマージ済みPR #1 の最終先端と完全一致することをサーバーで再確認し、同じオブジェクトIDを lease に指定して削除、サーバー側の不在を読み戻した。リモートは11本から10本になった。ワークツリー5個と残る固有作業は維持した。
