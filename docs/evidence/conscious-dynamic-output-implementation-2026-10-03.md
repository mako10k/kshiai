# 動的顕在出力契約の実装・ローカル検証

2026-10-03。所有者の「実装を進めましょう」に基づきADR-0047をAcceptedへ遷移し、[正本PERT](../conscious-dynamic-output.pert)のDY1〜DY6を実装した。既存ADR-0028は新規dynamic-v4の応答・修復契約についてSupersededとし、判断所有権等の理由と旧契約の履歴は編集していない。

## 動作

- 新しいV4 manifestへ `consciousOutputContract: dynamic-v4` を作成時に固定。旧manifestには補わず、旧試合はV3出力とconsciousAgencyV1を継続する。
- consciousAgencyV2を追加。意図の必須rationaleを撤廃し、目標・意図・根拠・行動は生成元の値を保持。旧V1のrationale必須schemaは維持する。
- phase・確定目標・表現候補・サーバー指定対象からGenerationPlanを構成。同じplanで指示、strict出力schema、復元、受入、修復scopeを決める。対象なしはcallなし。
- 確定済みinitialGoalと候補なしの発現を出力対象から除く。任意の省略/nullは新提案なしへ正規化し、由来は区別。新提案なしをmissing_proposalによる棄却とは記録しない。
- モデルはchoiceKeyを選び、固定skillId等をサーバーが今回の候補表から復元する。自由行動の説明/対象とreflectの分析/指針は補作しない。
- JSON構文やフィールド・根拠・行動検証の不備について、具体的なpath/code/期待型/候補を渡す。行動の選択変更は意図と行動の組、独立表現の不正はその表現だけを修復する。
- 同じ選択を保持できる自由行動/reflectでは、不足payloadスロットだけのschemaに絞る。提供済みの有効内容を保持し、対象外の上書きを拒否する。
- application repairは論理判断あたり最大1回。既存DB transactionで予約を保存してからcallする。予約だけを更新し、未完成phaseを確定状態へ保存しない。旧revision・失ったlease fenceは拒否し、reload/provider切替でも枠をリセットしない。
- 初回/修復の生成対象、schema digest、call数と具体的失敗理由を既存のprivate traceへ残す。公開投影へ私的目標・意図を追加しない。

## 検証

`npm run build`、`npm run typecheck`、`npm test`、`npm run static`、ADR-0028/0047の `npm run adr:check` は成功。

SealGraph選択によるnpm testはactive 41ファイル、provisional 2ファイルを実行し、グループごとの181+19+29件、計229件が成功。disabled 152ファイルは成功数に含めない。新しい動的契約テスト等は未sealedのため、直接実行によるローカル回帰を別に記録する。

重点回帰は8ファイル92件が成功。別途HTTPテストの隔離修正1件も直接成功（重複なし計93件）。以下を含む。

- 旧V3の目標null/理由必須の維持と、新V2保存値の分離。
- 目標有無、通常/later/aftermath、任意欠落/null、不正非null、古い根拠/候補、空対象。
- 実HTTP adapterへ渡すstrict schemaの確認（fetchをfixtureへ置換、実provider実行なし）。
- 発言だけの修復、有効な行動/意図の保持、対象外フィールドの書換え拒否。
- 自由行動の有効な説明を保持し、対象参照だけを修復すること。
- syntax修復1回、transport例外を意味修復にしないこと、未解決後の第三call禁止。
- 実SQLiteで予約・reload・再試行抑止。予約時にagent/turnRecords/turn/revisionを変更しないこと。
- stale revisionと失ったlease fenceで予約を拒否し、予約数が増えないこと。
- V4新規作成・進行・確定アセット維持、旧V3の受入・再読込み・CAS、発話配線。

テスト前提の訂正2点: cutover HTTP fixtureはDATABASE_URLをdeleteせず空文字で固定し、ローカル.envの実環境設定を拾わないようにした。旧V3 persistenceの新規作成テストは、ADR-0039ですでに禁止されたlegacy character作成を許す期待から、拒否と未作成を確認する期待へ訂正。既存V3の保存・継続テストは維持し、新規作成はV4 integrationで検証する。

最終のinstrument診断では、許可参照を同じkindのsetupTurns=0の機会に限定する。追加差分はbackendの型検査・ビルド、provider回帰とstaticで確認する。

## 範囲と未実施

実データへの移行、実providerによる有料比較、実環境設定変更、デプロイは未実施。新規契約のstructural acceptanceとローカル挙動を検証したもので、戦術・待機比率・台詞反復の実モデル品質改善を証明していない。自由行動adjudicationの別原因やナレーションの決着表現は今回の修復へ混ぜていない。DBのDDL変更はなく、新しい保存値は既存state JSON内。
