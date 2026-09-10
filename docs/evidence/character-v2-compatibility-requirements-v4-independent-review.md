# キャラクター顕在意識ガイダンス移行 — 要件候補・改訂4 独立レビュー

- 結果: `completed`
- Lifecycle: Step 3完了。Step 2でオーナーが実際に選択した経路は`REVIEW`。
  追加レビュー質問はなく、次はStep 4。
- 日付: 2026-09-10
- レビュー対象: `docs/character-v2-compatibility-requirements-v4.md`
- 対象SHA-256: `ac74435ac76fdfbd03e20ab4656c3e1a8b8002553844e09f404aed2835fd8370`
- 対象Seal: `061093e71d42c38311f48d73828fb1b8e69a1a2087e3296261df327674752eb3`
- レビュー入力: `docs/evidence/character-v2-compatibility-requirements-v4-owner-review.md`
- 入力SHA-256: `81d5f472e6f7394f3b614ec92bd5bd7a6a12f6fe4cf7847388101fe47b0ce20e`
- 入力Seal: `64dea15c3e595a3fff81976cca724798c0861d6d2e41a3f4e7a24b8837ecd080`
- 独立性: 固定された改訂4を独立コンテキストでAccepted ADR、現行schema、
  compiler、既存RCAとread-onlyで再照合した。前回レビューの訂正済み結論を
  そのまま承認根拠として引き継いでいない。
- 変更境界: 候補、レビュー入力、ADR、実装、本番はレビュー中に変更していない。

## 結論

独立レビューは完了した。ただし、V2の独立fieldである`fallbackActionRef`が
移行適格条件にも移行先にも明記されておらず、schema上可能な入力が「R7では適格」かつ
「R9では写像不能」になり得るcontradictionが1件ある。このため、改訂4のまま
`ACCEPT`することは支持せず、Step 4では`REVISE`を推奨する。

さらにR13のreceipt条件には時系列上の曖昧さがある。移行成功をcommitする瞬間の
原子性として読めば整合するが、将来の通常改訂後にもmigration targetがcurrent pointer
であり続けることを要求するようにも読める。これは現時点で物理設計の矛盾とは断定せず、
改訂時に時間境界を明記すべきevidence gapとして扱う。

一方、改訂3で見つかったauthority帰属とstate identityの矛盾は改訂4で解消されている。
恒久V2 compatibility readerを置かず、対象を凍結manifestに基づいて追記型・決定論的に
V3世代へ移し、旧世代と旧試合を保持する中心方針には、上記以外のmaterial contradictionは
見つからなかった。

## Material findings

### F1 — contradiction / Medium

最早期の原因段階はStep 1のdeterministic mapping definitionである。

現行V2 schemaでは、`actionRefs`、`actionKinds`、`tacticTags`とは別に、nullableな
`fallbackActionRef`が存在する。reference検証とV2 compilerもこのfieldを独立して扱う。
既存RCAと改訂4のR4は、実行selectorを前者3種類として定義している。

しかしR7は「all selectors are empty」で移行適格としながら、
`fallbackActionRef`がnullであることを要求せず、移行先へ複写するfieldにも含めない。
R2はconscious guidanceにfallback actionを持たせることを禁止し、R9は未写像値のdropや
推測を禁止する。そのため、3種類のselectorが空で`fallbackActionRef`だけが非nullの
schema-valid V2 normは、R7の文言上は適格でありながらlosslessに移行できない。
R17が同じmapperを将来のV2 restore/import/derived authoringにも使うため、凍結8世代だけの
値を確認しても一般契約の不整合は残る。

- 候補R2/R4/R7/R9/R17:
  `docs/character-v2-compatibility-requirements-v4.md` 99–115、129–157、200–204行
- V2 schema: `packages/shared/src/structured-character.ts` 192–220行
- reference検証: `packages/shared/src/structured-character.ts` 500–513行
- V2 compiler: `packages/shared/src/character-definition-rules.ts` 213–237行
- 既存RCAのselector定義:
  `docs/character-authoring-selection-rca-2026-09-10.llmthink.dsl` 13–14行

root causeは、移行境界でaction-bearing source fieldを列挙せず、集約語`selectors`だけで
適格性を定義したことである。escape/detection causeは、従来レビューが3種類の実行selectorと
本番件数の集計に集中し、独立したfallback fieldまで照合しなかったことである。

最小の是正は、移動対象の適格条件へ`fallbackActionRef is null`を明記し、非nullなら
R9どおりasset単位でfail closedにすることである。別案としてfallbackのlosslessなV3
mechanical mappingを設計できるが、意味同一性の証明が増え、conscious guidanceへの単純移動
では済まない。凍結21件の実値がすべてnullかは現在のレビュー証拠では未確定であり、manifest
確定時に確認が必要である。

### F2 — evidence gap or unresolved ambiguity / Medium

R13は、per-assetのatomic success boundaryにreplacement generation、current pointer、
readiness、durable receiptを含め、「receiptなしのmigrated current pointer」も
「そのpointerなしのsuccess receipt」も公開しないとする。この記述はmigration commit時の
原子性としては妥当である。

一方、通常改訂では後日別generationへcurrent pointerを進められる。receiptはdurableで、
R14のidempotent readbackにも必要であるため、その後は「migration receiptは残るが、current
pointerはmigration targetではない」正常状態が生じる。R13末尾の`No state`を全時点へ適用
すると、この正常状態まで禁止する読みにもなる。

- 候補R11–R14: `docs/character-v2-compatibility-requirements-v4.md` 163–185行
- 通常のappend/activation: `docs/adr/0010-structured-selectable-asset-envelope.md`
  75–79、151–152行
- ready characterの通常改訂:
  `docs/adr/0011-structured-character-definition.md` 154–169行

これは現時点では実装矛盾ではなく、時間範囲の指定不足である。改訂時には、pointerとreceiptの
同時可視性が必要なのはmigration successのatomic commit boundaryであること、後続の正当な
pointer変更後もreceiptはhistorical migration recordとして残ることを明記するのが最小修正である。

### F3 — evidence gap or unresolved unknown / Medium

R8は、移動した全V2 literal disclosure pathをV3 `consciousGuidance` pathへ決定論的に変換し、
grant wideningを禁止し、複写した`consumerTags`自体をaccess authorityにしないと定めている。
ただし、具体的なV3 path table、compiler、positive fixture、non-leakage fixtureはまだない。

これは方向との矛盾ではない。後継ADRと実装で、既存R3/R8を満たしたことを証明する義務として
正しく残されている。要件承認は、その将来証明が既に完了したことを意味しない。

### F4 — evidence gap or unresolved unknown / Medium

現行のgeneration-backed basic-action source discriminatorはV2名を持つ。改訂4は、V3では
qualified successor identityまたは意味保存を証明したmappingを使い、変更された意味を
`character_generation_v2`と呼ばないことを受入条件にしている。最終的な表現は未確定である。

これも後継namespace/compiler設計のproof obligationであり、要件の移行方向との矛盾ではない。
この段階で物理表現まで固定する必要はない。

### F5 — evidence gap / Low

Seal済みの日本語レビュー入力には`REVIEW`推奨が記録されているが、オーナーが実際に
`REVIEW`を選択したのはその提示後である。今回の直接指示によりStep 3の権限は成立している。
ただし、推奨と実選択を混同しないため、本報告では実選択、追加質問なし、exact candidate
identityを別途記録した。

### F6 — optional or future / Informational

qualified compiler identifier、physical migration-ledger schema、authoring-policy persistence、
manifest外のtest/seed asset移行は、R1–R18を満たす後継ADRまたはdelivery planで決めてよい。

### F7 — out of scope / Informational

deployment、policy activation、本番migration、pointer rollback、provider再生成、no-state 16件の
一括作業、live xAI検証は別権限である。独立レビューはこれらを候補の許可や受入条件へ加えない。

## Material findingなしと判断した領域

- ADR-0010の推測変換禁止とADR-0011のbulk migration未許可は、正しい出典へ分離された。
- state identityは実在する`CharacterAgentState.consciousAgencyV1`へ訂正された。
- guidanceはengineのlegal/ranked/excluded actionや同一遷移のpsycheへ直接流入しない一方、
  顕在意識の判断と後続経験を介する間接影響を許す。
- generationはappend-only、pointer更新はcompare-and-swap、旧battleは記録済み世代へ束縛される。
- cutoverは限定された`characterDefinitionSchemaVersion`で明示選択され、時刻や他のV3名称から
  推測されない。
- cutover後のV2 restore/import/derivedは同一mapperを通すかfail closedになり、新しいcurrent
  V2を作らない。
- cutover後のcreate/revision/upgradeはstrict V3であり、V2 compatibilityをauthoring fallbackに
  しない。

## RCA分類

- root cause:
  - R7がV2のaction-bearing fieldを完全列挙せず、`fallbackActionRef`を移行適格条件から
    漏らしたこと
- contributing cause:
  - `selector`が3種類の実行selectorだけを指す文脈と、action選択に関わるfield全体を指す
    ように読める文脈が混在したこと
- escape/detection cause:
  - 既存レビューが3 selector collectionと本番21件の分類を中心にし、nullable fallbackの
    実値と一般schema shapeを独立に照合しなかったこと
- corrective actions:
  - 新しい改訂で、移動可能なnormは`fallbackActionRef`もnullであると明記するか、別の
    lossless mechanical mappingを規定する
  - R13のatomic visibilityをmigration commit時に限定し、後続の通常pointer変更後のreceipt
    保持を明記する
- recurrence-prevention actions:
  - migration eligibilityとcopy matrixをsource schema field単位で照合する
  - frozen production fixtureにnullable/optional fieldの実値を含め、一般contract fixtureとは
    別に検証する
  - receipt invariantはcommit時、定常時、後続revision後、retry時の各時点を分けて記述する

CLI LLMThink監査は`fatal=0 / error=0 / warning=0`。11件のhintは複数findingが共通の
レビュー問題・分類規則を参照する構造上の近接指摘であり、各findingが参照する個別証拠を
再確認した結果、結論間の矛盾は認めなかった。

## Step 4 owner routes

- `REVISE`: 新しい改訂5を作成し、F1を解消しF2を明確化してStep 1へ戻る。
- `REREVIEW`: 改訂4のbytesを変えず、レビュー質問を追加または変更してStep 3を再実施する。
- `ACCEPT`: exactな改訂4を承認する。

本報告は`REVISE`を推奨する。F1はschema-valid inputに対する規範の直接不整合である。
F2は短い時系列明確化で後戻りを防げる。F3/F4は物理設計へ拡張せず、明示済みの後継proof
obligationとして保持するのが最小変更である。

いずれの経路も、それだけではADR承認、実装、deployment、本番migration、rollbackを許可しない。
