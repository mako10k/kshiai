# 戦闘パイプライン LLMコスト設計方針

Status: proposed design; implementation requires owner gate  
Date: 2026-08-12  
Related: [Issue #98 plan](issue-98-battle-pipeline-plan.md), [ADR-0002](adr/0002-separate-advance-and-narration-apis.md), [ADR-0004](adr/0004-versioned-lightweight-psyche-dynamics.md)

## 1. 方針

LLMコストは心理層だけでなく、戦闘パイプライン全体の優先設計指標とする。最適化単位はcall数だけではなく、一戦闘・一turnあたりの課金見積、input/output token、latency、retry、fallbackを含む総コストである。

コスト削減のために異なるauthorityやprivacy contextを一つのpromptへ統合しない。各責務を分離したまま、責務ごとに次の順で最小経路を選ぶ。

```text
skip / reuse durable result
  -> deterministic local processing
  -> fixed lightweight model
  -> explicitly enumerated high-cost fallback
```

高価なmodelほど良いという前提を置かない。最も軽い候補が、その責務のschema、privacy、品質fixtureを満たせば採用候補となる。

## 2. 対象LLM責務

現行コードで確認できる責務を、少なくとも次の予算単位に分ける。

| 責務 | 低コスト化の第一候補 | 高コストを許す候補 |
| --- | --- | --- |
| encounter / prologue preparation | asset generation時reuse、短い固定入力、lightweight model | 初回のみ、明示fallback |
| deep psyche | deterministic reaction policy、hold/no-op | OOD等の列挙例外 |
| action proposal | deterministic available-action pruning、短いobserver projection、lightweight model | 重要局面または軽量model不合格時の固定route |
| expression | expression eligibilityによるskip、短い専用projection、lightweight model | character品質fixtureを満たせない場合の固定route |
| semantic/world reconciliation | 既知canonical operationはlocal、free-form candidateだけmodel | 複雑なvalidated free action等の列挙scope |
| sensory evidence | deterministic evidence優先、既存combined/split評価を尊重 | accepted provider topologyのみ |
| narration | advanceから非同期分離、turn receipt reuse、lightweight narrator候補 | finale等の明示classまたは品質不合格時 |
| terminal explanation | winnerはdeterministic、説明のみ軽量化/skip可能 | canonical winner変更は不可 |

表は候補であり、modelやrouteを現在仕様として断定しない。実測前にprovider/modelを選ばない。

## 3. route契約

各責務はversioned route policyを持つ。

- responsibility IDとphase。
- skip条件、reuse対象、deterministic handler。
- lightweight provider/model、timeout、token ceiling、schema。
- high-cost fallbackを許す列挙条件。
- 同一責務の最大attempt数。runtimeの無制限repair/escalationは禁止。
- failure時のno-op、prior result、deterministic fallback。
- fixture set、quality floor、cost ceiling。

routeはbattle開始時にpolicy generationを固定する。active battleの途中でcurrent modelやpromptへ追随しない。

## 4. 計測receipt

private prompt/outputを公開せず、各callまたはskipについて次を内部receiptへ記録する候補とする。

- responsibility、phase、turn、side。
- `skipped | deterministic | lightweight | high_cost | reused | failed`。
- route reason、provider/model/prompt generation。
- input/output token、課金見積、latency、attempt count。
- schema validation、fallback、durable reuse。
- privacy-safe quality resultまたはfixture version。

管理画面は集計とroute reasonを表示し、private psyche、raw prompt、hidden perceptionは表示権限とretentionを別契約にする。

## 5. 採用判断

baselineと候補を同じfixture、同じbattle class、同じpricing snapshotで比較する。

- battle/turnあたり総costとcall数。
- responsibility別cost share。
- p50/p95 latency、timeout、retry、fallback。
- schema-valid率、privacy violation、canonical divergence。
- action validity、expression repetition、narration completeness等の責務別品質。
- cost分布のcharacter/event偏り。

一部callが減っても、長いprompt、repair、fallbackで総costが増える案は不採用とする。品質floorを割ってまでcostだけを下げない。一方、fixture上同等なら軽いmodelを優先する。

## 6. 初期優先順

1. call inventoryと実測baselineを作る。
2. retry/reconnectによる重複callをdurable reuseで除く。
3. deep psycheのroutine callをdeterministic/no-call化する。
4. action/expressionの入力を責務別に短縮し、lightweight modelを評価する。
5. known canonical operationでsemantic LLMをskipする。
6. narrationを非同期化し、lightweight narratorを独立評価する。
7. prologue、aftermath、finale等の低頻度・高価値routeを評価する。

順序はbaselineでcost shareが異なる場合に変更してよい。常に最も総cost削減効果が高く、境界を壊さない責務を先にする。

## 7. 未決事項

- 現行provider/model別の実測cost、token、latency baseline。
- model pricing snapshotの取得・保存方法。
- 各責務のquality fixtureと最低基準。
- lightweight model候補とhosting方法。
- high-cost fallbackを許すevent classと上限。
- prompt cache、batch、parallelismが課金・latencyへ与える効果。
- provider usage metadataが欠損する場合のcost推定。
- test/user dataのtrace retentionとaccess。

これらを決める前にmodel置換やproduction route変更を行わない。
