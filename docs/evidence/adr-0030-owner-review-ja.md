# ADR-0030 改訂1 オーナーレビュー（完全日本語訳）

- レビュー対象: `docs/adr/0030-llm-assisted-character-semantic-migration.think` と同名 Markdown 投影
- 状態: Proposed（提案中）
- 日付: 2026-09-10
- 決定者: プロダクトオーナー
- 改訂: 1
- 正本: 英語の `.think`。本書は、その判断範囲全体を確認するための日本語訳であり、第二の正本ではない
- 受入れた場合に具体化するもの: ADR-0010、ADR-0011
- 維持するもの: ADR-0027、ADR-0028 の実行時責務境界
- 実装方針として退けるもの: ADR-0029 改訂1
- 関連資料: 受入れ済み要件・改訂6、受入れ済み後続計画・改訂1

## 背景

V2 の action norm の意味を厳格化した結果、ready である正確な V2 キャラクター generation 8件が、
新しい試合から除外されている。受入れ済み要件では、恒久的な V2 reader、決定論だけに限定した
適格性の行き止まり、無制限なモデル書換え、read 時の provider 呼出しを導入せず、これらを厳格で
不変な V3 へ移行することを求めている。

ADR-0010 と ADR-0011 の、不変 generation、永続化された attempt、validation、owner confirmation、
CAS pointer 移動、正確な battle binding は維持する。ADR-0027 と ADR-0028 の、目標・行動・発話を
顕在意識が所有すること、深層心理は反応だけを担うこと、engine validation は決定論的であること、
既存の qualified V3 runtime identity も維持する。

## 判断要因

- 履歴 V2 bytes や既存 battle を変えずに8キャラクターを復旧する。
- 削除または役割変更された値を、将来の再マイグレーション用にすべて保全する。
- 意味の非連続箇所では LLM の判断を使うが、runtime、情報開示、identifier 割当て、activation の権限は与えない。
- error の影響を受ける意味的閉包だけを修復し、merge 後の candidate 全体を毎回再検証する。
- 将来用の任意項目が未解決でも、無関係な現在の consumer を妨げない。
- provider request、acceptance、activation、replay、drift、rollback をそれぞれ独立した receipt で追跡する。

## 検討した選択肢

1. 恒久 V2 compatibility reader: 短期的には最短だが、V2 の二重の意味を残し、受入れ済み目的と衝突する。
2. 決定論的 mapping のみ: 安価で再現可能だが、追加・削除・役割変更された意味を安全に解決できない。
3. 無制限の LLM 書換えと即時 activation: 柔軟だが、source の喪失を隠し、決定論的 validation と owner review を迂回する。
4. versioned hybrid migration: 意味が安定している箇所は決定論的に正確に copy し、意味が変わる箇所だけを
   限定的なモデル操作で扱う。その後、決定論的 enforcement、独立した意味 review、owner acceptance、
   append/CAS activation を行う。

## 提案する判断

正確な ADR 改訂への owner acceptance を条件として、選択肢4を採用する。

### V3 キャラクターと compiler の identity

厳格で実行可能な `actionNorms` と、それとは別の上限付き `CharacterConsciousGuidanceV1` collection を持つ
`CharacterDefinitionV3` を追加する。各 action norm は、少なくとも action reference、action kind、
tactic tag のいずれかを選択する。conscious guidance は applicability、statement、priority、
preference/commitment force、self-awareness、exceptions、metadata を持つが、action selector、
restrictive disposition、tactic、fallback は持たない。

移行された機械的 fallback には `CharacterMechanicalConflictFallbackV1` を使い、登録済み action reference、
legality の再検証、ordering、conflict receipt を持たせる。V3 definition の battle compilation は
`CharacterBattleCompilerInputsV4` を生成し、basic-action provenance は `character_generation_v3` を使う。
既存の qualified V3 identity の意味は変更しない。

`CharacterCompilerCapabilitySetV1` は、qualified consumer/compiler の必要条件を登録する。将来用で任意の
未解決値は active field の sentinel string ではなく、別の `CharacterDeferredValueV1` collection に置く。
compatibility は supported、blocked、deferred capability を報告し、影響を受ける必須 capability だけを止める。

### 保全と migration record

`MigrationPreservationCapsuleV1` は専用の restricted persistence に保存し、content digest を付け、source と
target generation に束縛する。これは `CharacterDefinitionV3` の外に置き、通常の public、battle、psyche、
conscious、narration、image、authoring compiler は読み込めない。移動された正確な path と canonical value、
operation provenance を保全し、1キャラクター256 KiBを上限とする。保持・export・削除は参照 generation の
lifecycle に従い、登録済みの将来 migration consumer だけが読める。

`CharacterSemanticMigrationContractV1` は、完全な source、許可された自然言語 source、target schema、prompt、
response schema、provider/model route、capability、初回 request digest を1つの `migrationAttemptId` に固定する。
物理的な各 call は別の `providerRequestId`、parent、digest、accounting entry、response/failure receipt を持つ。
attempt、request、candidate、generation、current pointer は別々の identity とする。

response identity `character_semantic_migration_change_set_v1` が許す operation は、`copy`、`move`、
`transform`、`synthesize`、`retire_to_capsule`、`defer` だけである。各 operation は target、登録済み source、
value または marker、上限付き owner 説明、provenance category、提案する意味的依存先を示す。
stable ID は server が割り当て、モデルが authority、fact、right を捏造した場合は拒否する。

### 意味 review と限定 repair

構造 validation 後、stateless な `CharacterSemanticConsistencyReviewV1` request が、凍結 source、完全に merge
された candidate、contract、operation を、会話 state や隠れた model reasoning なしで review する。
同じ受入れ済み provider/model を使ってよいが、別 request として receipt を残す。repair closure は、
server が把握する依存、model が提案する依存、review finding の和集合とする。

repair は最大2 round とする。各 round は、限定的な `CharacterSemanticRepairV1` request 1回と、candidate 全体の
新しい意味 review 1回から成る。したがって1 attempt の provider request は最大6回、すなわち初回生成・初回
review と、2組の repair・再review である。実行時の別承認で上限を下げることはできるが、ADR 改訂なしに
上げることはできない。各 merge 後、構造 validation は candidate 全体に再実行する。

### persistence、activation、cutover、rollback

attempt、request、candidate、capsule、acceptance、success receipt は専用の追記指向 record に永続化する。
完了済み attempt の replay では provider を呼ばず、generation を重複作成しない。別の意味結果を求める場合は
新しい attempt とする。failure、decline、drift は current generation を変更しない。

asset ごとに1 transaction で、受入れ済み V3 envelope、capsule binding、compatibility state、success receipt を
追記し、その後、凍結 source から pointer を CAS 移動する。asset は独立して commit する。rollback は、影響を
受けた pointer だけを過去の compatible generation へ CAS 移動し、receipt を追加する。V3 や capsule は削除しない。

`characterDefinitionSchemaVersion` は、値2または3を持つ専用の revisioned `CharacterAuthoringPolicyV1` record に
保存し、CAS で activation する。時刻、deployment、dialogue schema、環境変数から推測しない。3を選ぶ前に
dual reader を deploy・検証する。選択後の create と通常 revision は strict V3 を生成し、restore、import、derived、
upgrade input は migration contract を使う。asset 単位 rollback で policy を黙って downgrade しない。

## 結果

### 利点

- 恒久的な V2 semantics を残さず、8キャラクターの migration path を作れる。
- source loss、synthesis、deferral、provider work、owner decision が可視化される。
- capsule data は通常 runtime や public input にならない。
- candidate 全体を再生成せず、error の意味的影響を受ける valid field まで含めて限定 repair できる。
- character ごとに partial failure を隔離し、replay を冪等にできる。

### 欠点とリスク

- repair を伴う1 attempt 最大6回の provider request は、相応の費用と遅延を生む可能性がある。
- 同じ受入れ済み model による意味 review は request として独立しているだけで、別学習の judge ではない。
  実行 review ではこの制約を明示し続ける必要がある。
- capsule の保持により restricted data の lifecycle 義務が増える。
- dual V2/V3 reader と capability 単位 readiness により、実装・test 範囲が広がる。
- 256 KiB 上限または2 round 上限が不足する可能性がある。変更時は黙って緩和せず、ADR 改訂を review する。

## compatibility と migration

- 履歴 V2 generation と旧 battle は byte 単位で読み取り可能なままにする。
- selector、search、battle path では provider を呼ばず、character を migration しない。
- 凍結する production operation は、再確認した対象 generation 8件だけを含む。no-state character 16件は対象外とする。
- 新しい V3 generation は、新しい compiler identity と provenance identity を使う。
- 既存 runtime V3 tuple と `consciousAgencyV1` の意味は維持する。
- production provider work、acceptance、append/CAS、policy activation は後続計画の別々の gate とする。

## 検証

- 受入れ済み要件の各 criterion を focused test と B7 integration evidence に追跡する。
- strict V3 parsing、guidance/mechanics 分離、qualified tuple rejection、capsule の非消費、将来の登録済み recovery を検証する。
- 6 operation 全て、guidance/fallback 分割 migration、disclosure 非拡大、semantic closure 拡張、2 repair round、6 call 上限を検証する。
- completed replay、semantic regeneration、crash、failure、decline、source/pointer drift、asset 単位 CAS、partial success、rollback、old battle を検証する。
- deployment proposal 前に full test、typecheck、build、duplication、Lizard、ADR check、Seal impact、stale review、fsck を実行する。

## 実装参照先

- `docs/character-semantic-migration-successor-plan-v1.md`
- `packages/shared/src/structured-character.ts`
- `packages/shared/src/character-definition-rules.ts`
- `backend/src/repositories/character-assets-v2.ts`
- 新しい migration persistence と orchestration module の名前は B3〜B6 で決める。

## レビュー境界

owner acceptance は未実施である。この Proposed ADR は、implementation、provider call、deployment、production
read/write、candidate acceptance、pointer movement、rollback、policy activation のいずれも許可しない。

## オーナーが判断する主要論点

1. 恒久 V2 reader ではなく versioned hybrid migration を選ぶか。
2. conscious guidance、実行可能 action norm、mechanical fallback を別 contract に分けるか。
3. 退避値を V3 本体の自由領域ではなく、256 KiB 上限の restricted capsule に置くか。
4. 意味 review は stateless な別 request とし、同じ provider/model の使用を許すか。
5. repair を最大2 round、attempt 全体を最大6 provider request に固定するか。
6. asset 単位の append/CAS、非破壊 rollback、明示的 schema policy cutover を採用するか。

## 客観的な対案とトレードオフ

- 恒久 V2 reader: 最短で復旧しやすいが、旧意味を恒久運用し、将来の二重 contract コストを残す。
- 決定論的 migration のみ: 再現性と低コストに優れるが、意味の移動・分割・創造補完を扱えず、今回の8件を再び止め得る。
- 無制限 LLM rewrite: 実装は単純化し得るが、source loss、権限混入、説明不能な全体改変のリスクが高い。
- 推奨案: 実装と運用は重いが、LLM を意味変換に限定し、validation・owner acceptance・activation を分離できる。

## 未確定事項

- 実行時に採用する provider/model、予算、retry ceiling の引下げ有無は別承認で決める。
- 256 KiB と2 repair round が実データに十分かは、no-write dry-run と candidate evidence まで未確認である。
- 同一 model review で十分な品質が得られるかは、local fixture だけでは証明できない。
- production の8 generation identity は provider work と activation の前に再凍結・再確認する必要がある。
