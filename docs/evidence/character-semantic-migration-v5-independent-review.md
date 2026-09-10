# キャラクター意味マイグレーション — 要件候補・改訂5 独立レビュー

- 結果: `completed`
- Lifecycle: Step 3完了。Step 2でオーナーが実際に選択した経路は`REVIEW`。
  追加質問はなく、次はStep 4。
- 日付: 2026-09-10
- レビュー対象: `docs/character-v2-compatibility-requirements-v5.md`
- 対象SHA-256: `15ba8c14d8aacd21e135db6da6387b2ebf934ef0d37eb4f316772cd22ab73ffc`
- 対象Seal: `26ea3409a47c4d6da7f40ef216fbcba5343f204232d77313273cd5947cec6684`
- レビュー入力: `docs/evidence/character-v2-compatibility-requirements-v5-owner-review.md`
- 入力SHA-256: `b6132f3daf99f5b27278fa7b9fceeb60331207c31c2d7d4dcf407bdd9e508d5f`
- 入力Seal: `ce92c2ed93fac151ec261da226876bff3843b65f3b8ee6e4f467f0ee1dc80aa7`
- 独立性: 固定された候補を独立コンテキストでAccepted ADR、現行schema、compiler、
  persistence contractとread-onlyで照合した。候補、レビュー入力、ADR、実装、本番は変更していない。

## 結論

LLM支援型意味マイグレーションという方向、LLMをcandidate authorに限定する責務境界、保全、
consumer単位defer、fallbackの分離、owner acceptance、append-only activationには直接矛盾を
認めなかった。

ただし、bounded patch retryの受入条件にnormative contradictionが1件ある。R14はinvalid fragmentを
同じattempt内で追加provider requestにより修正するが、受入条件はsame-attempt retryで第二の
`provider operation`を作らないと無限定に要求している。現行文書で`provider operation`はprovider workを
開始する単位として使われ、複数requestを包む別の論理用語は定義されていない。このため改訂5のままの
`ACCEPT`は支持せず、Step 4では`REVISE`を推奨する。

独立reviewerの初期判定はこの点をLow evidence gapとして`ACCEPT`推奨とした。統合監査ではR14、R22、
受入条件、既存authoring attempt用語を相互照合し、仕様どおりのrepair requestを実行すると受入条件を
満たせないためcontradictionへ再分類した。

## Material findings

### F1 — contradiction / Medium

最早期の原因段階はStep 1のretry/idempotency contract定義である。

- R14はinvalid structured responseについて、error、cause、関連context、prior valid resultを使い、
  invalid部分と意味的影響部分を再度providerへ要求する。
- R22はcompleted attemptの反復ではproviderを呼ばず、invalid-fragment retryは同じpersisted attemptを
  継続すると区別している。
- 受入条件は`Same-attempt retry ... creates neither a second provider operation nor generation`とし、
  completed replayに限定せず第二のprovider operationを禁止する。
- 既存authoring designでも、同一idempotency identityを再実行した場合に`another provider operation`を
  始めない、という表現はprovider workを開始しない意味で使われる。

根拠:

- 候補R14: `docs/character-v2-compatibility-requirements-v5.md` 203–210行
- 候補R22: 同 264–270行
- 受入条件: 同 314–318行
- 既存attempt/idempotency contract:
  `docs/structured-asset-envelope-design.md` 259–299、454–460行

root causeは、1つの文で次の3 identityを混同したことである。

- migration attempt
- 個々のprovider repair request
- completed attemptのidempotent replay

escape/detection causeは、セルフレビューがR22の区別を確認した一方、受入条件のより広い文言をR14へ
逆照合しなかったことである。

最小修正は次のようにidentityと期待結果を分けることである。

- invalid-fragment repairは同じ`migrationAttemptId`を継続できる
- 各LLM invocationは別の`providerRequestId`とreceiptを持てる
- valid fragmentは再利用し、必要なrepair requestだけ追加する
- completed attemptのreplayではprovider requestを追加しない
- いずれのretryでもtarget generationを重複作成しない
- 意図的に別の意味結果を求める場合だけ新しいmigration attemptにする

### F2 — evidence gap or unresolved unknown / Medium

R10はLLMに`affected semantic dependants`を列挙させ、R14はinvalid部分とその依存部分だけを再提出し、
merge後のcandidate全体を再検証する。しかしR14が列挙するvalidationは`Structural validation`であり、
schema-validだが意味的に古くなった依存fieldを誰が再発見するかは一意でない。

これは限定patch方針との矛盾ではない。後継contractまたは次改訂で、repair setを次の情報から拡張できる
ことを明示する必要がある。

- serverが既知のschema/reference依存関係
- LLMが申告した意味的依存関係
- merge後candidate全体に対する独立したsemantic-consistency review

semantic consistencyが未解決ならactivationせず、reviewableな状態に残す。意味判断をすべて決定論的に
置き換える必要はない。

### F3 — evidence gap or unresolved unknown / Medium

`MigrationPreservationCapsuleV1`は、authoritative truthと通常compilerから隔離しながら、登録済みの将来
migration consumerが読めるという要求を持つ。方向は整合するが、次は後継ADR/schemaで証明が必要である。

- physical bindingとcontent digest
- size/retention/export/deletion policy
- future migration consumerのqualified identityとaccess gate
- ordinary runtime/public compilerが参照できないこと
- owner削除またはretention終了後の再マイグレーション可能性の扱い

これは物理設計未完了によるproof obligationであり、現候補との直接矛盾ではない。

### F4 — evidence gap / High（delivery evidence）

改訂5は8件を復旧するworkflowと受入証拠を要求するが、この候補・レビュー入力自体にはexactな8件の
manifest、generation ID、field実値、asset別LLM disposition、completed fixture resultは含まれない。
既存RCAが証明するのはpopulation countとselectorless soft norm計21件までである。

したがって、要件候補を承認しても「8件が既に復旧した」とは言えない。これは将来deliveryのacceptance
evidenceであり、production実行を明確に対象外とする要件候補そのものの矛盾ではない。

### F5 — evidence gap / Low（review record）

Seal済み日本語入力は`REVIEW`を推奨するが、実際のowner選択より前に作成されている。今回の直接指示により
Step 3の権限は成立する。本報告は推奨と実選択を区別し、exact candidate identityと実選択を記録した。

### F6 — optional or future / Informational

次はR1–R25を満たす後継ADR/designで決められる。

- mechanical fallback rule schemaとqualified compiler identity
- capsuleのphysical storage
- compiler capabilityとdeferred marker表現
- provider prompt/response/validation contract identity
- batch review UIおよび別途承認するautomatic-acceptance policy
- V3 basic-action provenance、authoring-policy persistence

### F7 — out of scope / Informational

production deployment、traffic/policy activation、provider-backed production migration、pointer rollback、
no-state 16件migration、live xAI validationは別権限であり、本レビューは実行していない。

## Material contradictionなしと判断した領域

- ADR-0010/0011のdeterministic-only legacy mappingを変えるには後継ADRが必要であることを明示し、
  immutability、validation、owner confirmation、CAS、read-only battle bindingを維持している。
- LLMはsemantic migration candidateを生成するが、runtime action、disclosure、compatibility、activationの
  authorityにはならない。
- `copy/move/transform/synthesize/retire_to_capsule/defer`の6 operationとsource accountingを定めている。
- fallbackをconscious guidanceへ混入・selectorへ捏造・無条件拒否せず、明示的mechanical targetまたは
  preserved semantic changeとして扱う。
- future/optional deferはcurrent battle compatibilityを止めず、required capabilityだけをresolutionまで止める。
- selection/battle read pathでproviderを呼ばない。
- disclosure wideningをserver-owned validationで禁止する。
- owner/batch acceptanceはexact candidate集合に束縛される。
- generation、capsule、receipt、pointerはappend-only/CAS境界を保ち、後続revision後もmigration receiptを
  履歴として保持する。
- explicit cutoverとstrict post-cutover V3 authoringを維持する。

## LLMThink監査

独立reviewerの3つの因果監査と統合監査は、すべて`fatal=0 / error=0 / warning=0`である。hintは共通の
review problem/classification参照や未使用snapshot evidenceを知らせる構造上の指摘で、個別証拠を再確認した
結果、finding間の矛盾は認めなかった。

## Step 4 owner routes

- `REVISE`: 改訂6を作り、F1を訂正し、F2を一意化してStep 1へ戻る。
- `REREVIEW`: 改訂5のbytesを変えず、質問を追加・変更してStep 3を再実施する。
- `ACCEPT`: exactな改訂5を承認する。

本報告は`REVISE`を推奨する。F1は実装詳細ではなく、同じ要件内のretryとacceptance criterionの
直接不一致である。F2は同じ小改訂で明確化できる。F3/F4は既に境界付けされた後継proof obligationとして
残し、物理設計やproduction evidenceを要件本文へ埋め込まない。

いずれの経路も、それだけではADR承認、実装、provider利用、deployment、本番migration、rollbackを許可しない。
