# Semantic Migration V3 有償失敗の回収記録

日付: 2026-09-11  
対象: `semantic-migration-grok-2026-09-11-v3` の保存済み6応答  
目的: 次の有償実行前に、各応答の正答・誤答・波及・既知の防止策を再利用可能な証拠へ変える。

## 結論

V3は移行結果としては不合格だったが、6応答すべてに次へ使える情報がある。第1応答は、必要な
`consciousGuidance`、実行可能な`actionNorms`、fallbackを個別には正しく生成していた。一方、同じ
対象への重複操作で正しい`actionNorms`だけが落ちた。その後は、レビューの正しい指摘と誤った指摘を
同じ修復根拠として扱ったため、正しかったfallbackとpriorityが順番に壊れた。

そこで、保存済み6 receiptを固定失敗コーパスとし、実応答を直接読むオフライン回帰を追加した。
次の有償実行は、この回帰と通常検証、実行対象snapshotのレビューを通過するまで行わない。

## 消費量

| 呼出 | 役割 | prompt | completion | 合計 | 推計USD |
|---:|---|---:|---:|---:|---:|
| 1 | 初期生成 | 29,374 | 678 | 30,052 | 0.0384125 |
| 2 | 初回レビュー | 30,440 | 352 | 30,792 | 0.0389300 |
| 3 | 修復1 | 31,491 | 259 | 31,750 | 0.04001125 |
| 4 | 再レビュー1 | 31,147 | 362 | 31,509 | 0.03983875 |
| 5 | 修復2 | 32,194 | 180 | 32,374 | 0.0406925 |
| 6 | 再レビュー2 | 31,350 | 449 | 31,799 | 0.0403100 |
| **計** |  | **185,996** | **2,280** | **188,276** | **0.238195** |

推計USDはprovider receiptの記録であり、請求書の実測値ではない。総tokenの約98.8%がpromptである。
したがって、追加呼出を軽く考えず、次回も呼出ごとのraw応答・parsed receipt・usageを必ず保存する。
prompt縮小は費用面の候補だが、必要な完全候補や由来を落とす危険があるため、この記録だけを根拠に
実装しない。

## 6応答から回収した内容

| 呼出 | 使える内容 | 問題 | 後続への影響 | V4での扱い |
|---:|---|---|---|---|
| 1 | 2件のconscious guidance、`basic-action`を選ぶpriority 40のaction norm、`basic-action` fallbackはいずれも値として正しい | `definition.actionNorms`をretireした後、同じ対象へsynthesizeし、一応答一書込規則に違反 | retireは適用され、正しいaction normだけが重複操作として拒否された | 重複は引き続き拒否。実行可能normの欠落は決定論的findingになり、修復対象として残る |
| 2 | action norm欠落の指摘は正しい。conscious guidanceに公開規則がないという実質的指摘も、後のオーナー判断と一致 | 実在するfallbackを「失われた」と誤認 | 誤ったfallback指摘が修復入力へ入った | 未裏付けレビューはclosureだけを広げ、修復errorには昇格しない。公開規則はサーバが葉単位で継承 |
| 3 | priority 40の実行可能action norm修復は正しい | 「fallbackは存在する」と説明しながら、その値を`null`へ変更 | 正しかったfallbackを破壊 | target fragment検証で`null`を適用前に拒否し、直前の`["basic-action"]`を保持 |
| 4 | fallbackが`null`になった指摘は正しい | selectorの由来がpriority 40のnormなのに60を要求。V3に存在しないselfAwarenessをaction normへ要求 | 次の修復が正しいpriorityを60へ改変 | fallbackのサーバfindingだけが修復を駆動。priorityの異norm由来変更は決定論的に検出。selfAwareness主張は未裏付けとして停止材料に留める |
| 5 | 直前候補へ実際に適用された変更履歴として再現価値がある | fallbackを空配列にし、priorityを60へ変更 | schema不正と意味的priority逆転を同時に作った | 空配列は適用前に拒否。priority変更はschema上可能だが、selectorに結び付くsource lineage不一致として検出 |
| 6 | fallback喪失とpriority逆転の指摘は正しい。conscious guidanceの公開規則欠落も実質的に正しい | `disclosurePolicy.rules.4`に旧規則が残るという事実認定は誤り。新candidate pathをsourcePathsに置いたfindingも契約違反 | 正しい兄弟findingは保持されたが、収束はしなかった | 誤ったレビュー事実は自動修復させない。公開statementは同一テキストの公開元から葉単位で継承 |

## 失敗の連鎖

1. 第1応答の正しいaction normが、同一対象への重複操作で落ちた。
2. 第2応答がその欠落を正しく検出した一方、正しいfallbackまで誤って欠落扱いした。
3. 第3応答はaction normを直したが、誤った指摘に従ってfallbackを`null`にした。
4. 第4応答は壊れたfallbackを見つけた一方、正しいpriorityを誤って60扱いした。
5. 第5応答はfallbackを空配列、priorityを60にし、構造と意味の両方を悪化させた。
6. 第6応答はその二つを見つけたが、公開規則について真偽混在の指摘を返し、上限6回で停止した。

根本原因、寄与要因、逃逸原因の正式な区分は、既存の
`result-rca.think`とV4 verificationに従う。この文書は、それを呼出単位へ展開した回収台帳である。

## 追加した実行可能証拠

`character-semantic-migration.test.ts`は保存済みファイルを直接読み、次を固定した。

- 6 receiptが現在の厳格Schemaで引き続きparseできること。
- 応答種別の順序と、3レビューの全finding codeが保存証拠と一致すること。
- 記録された総tokenが188,276であること。
- 第1・3・5生成応答をV3へ順に適用すると、fallbackが`["basic-action"]`、`null`、`[]`と壊れること。
- 同じ3生成応答をV4へ順に適用すると、fallbackが全段で`["basic-action"]`のまま残ること。
- V4が最終priority 60を`executable_action_norm_source_mismatch`として検出し、
  `candidate_schema_invalid`を発生させないこと。

これは整形し直した模擬応答ではなく、実際に料金を消費したreceiptをfixtureとして使う。元の証拠が
変化した場合もテストが落ちるため、失敗事実と回帰のずれを検出できる。

最終検証では、固定コーパス回帰と全785テスト、全workspace・deploymentのtypecheck、build、
jscpd、Lizard 1.23.0が合格した。buildには既存のVite chunk-size警告だけが残った。
回帰作成中に、review schemaのimport漏れ、初回生成に`repairClosure`がないことのfixture表現、
成功・失敗receipt unionの型絞込み不足を順に検出した。いずれもunsafe castを使わず是正し、
最終結果からは解消している。計画・結果のCLI LLMThink監査はfatal/error/warning 0だった。

## 次の有償実行前ゲート

次の実LLM検証を提案できるのは、少なくとも以下がそろった時点とする。

1. 固定6 receipt回帰が合格している。
2. V4のfragment保持、review grounding、action norm lineage、葉単位disclosure回帰が合格している。
3. 全体test、typecheck、build、既定の静的検査が合格している。
4. 新しいprepare proofが、実行コード・prompt identity・schema・モデル・上限・非activationを固定している。
5. その完全な実行範囲が日本語で提示され、オーナーが当該snapshotの有償実行を明示承認している。

合格しても「V4が実モデルで収束する」とは断定しない。既知失敗を繰り返しにくいことを確認した、
という実行資格に留める。未知の失敗が出た場合は自動再送せず、今回と同様にbefore、raw response、
receipt、候補差分、サーバfinding、usageを保存してから、次の判断を行う。

## 残る未知と対象外

- Grokが同じ種類の誤認を再び出す確率は不明。
- V4の実モデル収束、実token量、実費用は未確認。
- 同一モデルの自己レビューは独立した意味的真実ではない。
- この作業ではprovider呼出、activation、本番変更、prompt V5作成、Sealgraph本体変更、commit、push、
  deployを行わない。

## 証拠チェーン

- `A-PAIDRUN-001 -> C-PAIDRUN-001/002/003 -> E-PAIDRUN-001..005`
- 正本: `semantic-probe-v3-failure-harvest-plan-2026-09-11.think`
- 元応答: `semantic-migration-grok-2026-09-11-v3/call-{1..6}-response.json`
- parsed receipt: `semantic-migration-grok-2026-09-11-v3/call-{1..6}-receipt.json`
