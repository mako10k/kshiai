# キャラクター顕在意識ガイダンス移行 — 要件候補・改訂3 独立レビュー

- 結果: `completed`
- Lifecycle: Step 3完了。Step 2のオーナー経路は`REVIEW`。次はStep 4。
- 日付: 2026-09-10
- レビュー対象: `docs/character-v2-compatibility-requirements-v3.md`
- 対象SHA-256: `fc98c623083402adbdf382494a47d974bf50f0aa70a9faf4bfe6777bd96b997b`
- 対象Seal: `edf4341932f2c4fefb5a9c4d168320011db48f67e21f4326522032ae7125bfeb`
- レビュー入力: `docs/evidence/character-v2-compatibility-requirements-v3-owner-review.md`
- 入力SHA-256: `64b63f4df84007d9e4d581318eb0dcb865175605797c2e78e58252a39058726c`
- 入力Seal: `7fc4eca41259575377bbc7ca60ee9ca624edb434367ab32795dfafe81844ec2d`
- 独立性: 前回の改訂2レビューを引き継いだ承認とはせず、固定された改訂3を
  Accepted ADR、現行schema、projection実装とread-onlyで再照合した。
- 変更境界: 候補、ADR、実装、本番、Sealgraphの既存対象はレビュー中に変更していない。

## 結論

独立レビューは実施可能であり完了した。ただし、一次資料と直接不一致する
contradictionが2件あるため、改訂3のまま`ACCEPT`することは支持しない。
Step 4では`REVISE`を推奨する。

移行方式の中心、すなわち「恒久V2互換readerを置かず、対象8件を凍結manifestに
基づいて追記型・決定論的にV3世代へ移し、旧世代と旧試合を保持する」方針自体に
material contradictionは見つからなかった。

## Material findings

### F1 — contradiction / Medium

最早期の原因段階はStep 1のauthority dispositionである。

改訂3はADR-0010に`no-bulk-operation clause`があり、それを後継ADRで限定的に変更すると
記載している。しかしADR-0010が実際に禁止するのは、推測によるeager bulk inference、
暗黙の試合時変換、恒久legacy選択経路であり、一括移行一般を禁止する条項ではない。
bulk migrationを未許可とする権限境界はADR-0011にある。

- 候補: `docs/character-v2-compatibility-requirements-v3.md` 30–34行
- ADR-0010: `docs/adr/0010-structured-selectable-asset-envelope.md` 103–108行
- ADR-0011: `docs/adr/0011-structured-character-definition.md` 177–180行

root causeは、Step 1の文言でADR-0010の「推測による一括変換禁止」とADR-0011の
「bulk migration未許可」を同じ出典へ帰属させたauthority conflationである。レビューで
見逃したことはescape causeであり、要件不一致を作った原因ではない。

### F2 — contradiction / High

最早期の原因段階はStep 1のnamespace inventoryである。

改訂3は`CharacterAgentStateV3`をADR-0028が所有する既存identityとして列挙し、受入条件も
その名前との区別を要求する。しかし、その型・schemaは存在しない。ADR-0028と現行実装が
定義するqualified identityは`CharacterAgentState.consciousAgencyV1`である。

- 候補: `docs/character-v2-compatibility-requirements-v3.md` 61–67行、198–200行
- ADR-0028正本: `docs/adr/0028-versioned-conscious-agency-contract.think` 129–147行
- 実装: `packages/shared/src/battle.ts` 1439–1475行

root causeは、確認されていない非公式なV3ラベルを、既存の型名としてStep 1のnamespace
inventoryへ昇格させたことである。

### F3 — evidence gap or unresolved unknown / Medium

R7の可変field写像は現行V2 schemaを網羅し、凍結値の切詰めも禁止している。一方、現在の
disclosure/projectionは`actionNorms.*.response.statement`等のliteral pathに依存する。
移動後の`consciousGuidance` pathと複写された`consumerTags`で、ADR-0011の既存disclosure
意味をR8どおり維持できることは、まだ証明されていない。

- R7/R8: `docs/character-v2-compatibility-requirements-v3.md` 118–136行
- V2 schema: `packages/shared/src/structured-character.ts` 192–230行
- 現行path projection: `packages/shared/src/structured-character.ts` 691–693行
- projection matrix: `docs/structured-character-projection-matrix.md` 65–71行

これは移行方向との矛盾や新規製品要件ではない。後継ADR・compiler設計・positiveおよび
non-leakage fixtureで、既存R3/R8を満たすために解消する証明課題である。

### F4 — evidence gap or unresolved unknown / Medium

現行`BattleBasicAttackSource`はgeneration-backed source discriminatorとして
`character_generation_v2`だけを許す。CharacterDefinitionV3 generationをbattleへ束縛する
際に、V2を名乗って意味を変えず、complete tuple検証へ組み込むqualified表現または明示的な
変換規則は未確定である。

- 現行schema: `packages/shared/src/battle.ts` 2080–2094行
- V3 battle binding: `packages/shared/src/battle.ts` 2204–2219行
- 要件R8/R16: `docs/character-v2-compatibility-requirements-v3.md` 132–136行、180–182行

これは後継のnamespace/compiler設計unknownである。既存identityを意味変更して再利用しない
という改訂3の原則に従って解く必要があるが、最終表現を本要件で固定する必要はない。

### F5 — optional or future / Informational

物理transaction table/key、migration ledger、authoring-policy永続化方式は、R11–R18の
観測可能な原子性・冪等性・明示切替を満たす限り、後継ADRに残してよい。改訂3は物理設計を
先取りしていない。

### F6 — out of scope / Informational

deployment、policy activation、本番migration、rollback、provider再生成、no-state 16件の
一括upgradeは明確に別権限である。独立レビューはこれらを受入条件へ追加しない。

## Material findingなしと判断した領域

- direct/indirect effect境界はADR-0027/0028と整合する。mechanical action集合、engine field、
  同一遷移psycheへの直接流入を禁止し、顕在意識の選択と後続経験による間接影響を許している。
- R11–R14はgeneration、pointer、readiness、receiptの観測可能な原子性とcrash結果を定めるが、
  tableやkey構成を強制していない。
- cutoverは専用`characterDefinitionSchemaVersion`で明示的に選び、deployment時刻、dialogue
  V3、限定されない`V3`から推測しない。
- cutover後のV2 restore/import/derivedは同一mapperを通すかfail closedとし、新しいcurrent
  V2を生成しない。
- append-only generationと旧battle bindingを保持する。
- cutover後のcreate/revision/upgradeはstrict V3であり、V2をauthoring fallbackにしない。

## RCA分類

- root causes:
  - ADR-0010とADR-0011のbulk authorityを混同したStep 1の出典帰属
  - 非公式な`CharacterAgentStateV3`を実在するidentityとして扱ったStep 1の名称確認不足
- contributing cause:
  - `V3`という非限定ラベルが複数契約に使われ、非公式な総称を型名と誤認しやすかった
- escape/detection cause:
  - 改訂3セルフレビューで、authority文言とsymbol名を一次資料へ一語単位で照合しなかった
- corrective action:
  - 新しい要件改訂でF1/F2を正しいauthorityとqualified identityへ訂正する
- recurrence-prevention action:
  - 後継ADRのauthority tableとnamespace acceptanceで、出典行および実在symbolを照合する
  - F3/F4を「解決済み」とせず、後継設計のproof obligationとして追跡する

CLI LLMThink監査は`fatal=0 / error=0 / warning=0`。hintは、複数findingが共通のレビュー問題・
分類規則を参照する構造上の近接指摘だけで、矛盾判定を変更する内容ではなかった。

## Step 4 owner routes

- `REVISE`: 新しい改訂4を作成してStep 1へ戻る。
- `REREVIEW`: 候補bytesを変えず、レビュー質問を追加または変更してStep 3を再実施する。
- `ACCEPT`: exactな改訂3を承認する。

本報告は`REVISE`を推奨する。F1/F2は一次資料との直接不一致であり、as-isの`ACCEPT`では
誤ったauthority帰属と存在しないnamespace名が規範化される。F3/F4は改訂で物理設計まで
固定せず、明示的な後継proof obligationとして保持するのが最小変更である。

いずれの経路も、それだけではADR承認、実装、deployment、本番migration、rollbackを
許可しない。
