# 戦闘パイプライン LLMコスト設計方針

Status: owner decision candidate; measurement implementation remains gated
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

### 2.1 現行コードから確認した呼出しinventory

ここでいう「call」はapplication上の責務呼出しであり、providerへのHTTP attemptとは分ける。現行の共通OpenAI-compatible adapterは429を最大2回、503を最大1回、合計最大2 retryするため、1 callが最大3 attemptになり得る。DNSまたはbilling unavailableの場合だけ外側のprovider fallbackが発生し、timeout、429、503、operation errorではproviderを切り替えない。

| lifecycle | responsibility | 現行method | 1回の実行におけるapplication call | 現行tier / fallback |
| --- | --- | --- | --- | --- |
| battle setup | battlefield concretization | `concretizeBattlefield` | 0–1 | fast / local fallbackあり |
| battle setup | encounter preparation | `prepareBattleEncounter` | 1 | fast / timeout時はserver fallback |
| battle setup | case-policy generation | `generateBattlePolicies` | 1 | fast / fallback policyあり |
| prologue/turn/aftermath | private psyche A/B | `advanceCharacterPsyche` | sideごとに0–1、通常最大2 | fast / prior state保持 |
| prologue/turn/aftermath | expression/action A/B | `advanceCharacterAgent` | sideごとに0–1、通常最大2 | fast /新規発話・提案なし |
| turn | free-action adjudication | `adjudicateFreeActions` | free action群がある場合0–1 | fast / validation fallback |
| turn | semantic/world reconciliation and sensory evidence | `reconcileTurnSemanticState` | 1 | fast / committed mechanicsからlocal projection |
| turn | environment proposal | `proposeHappening` | supervisor条件時0–1 | fast / skip |
| turn | narration focus | `chooseNarrationFocus` | perspective条件時0–1 | fast / external focus |
| turn | narration | `narrateTurn` | 1 | fast / deterministic composer |
| turn-limit terminal | terminal verdict | `referee` | 0–1 | engine / deterministic factsへfallback。ただし現行は成功時にwinnerを上書きし得る |
| turn-limit terminal | terminal presentation | `narrateJudgment` | 0–1 | fast / local judgment block |
| prologue | narration | `narratePrologue` | 1 | fast / local fallback |
| aftermath | narration | `narrateAftermath` | 1 | fast / local fallback |

通常combat turnの静的上限は、psyche 2 + agent 2 + reconciliation 1 + narration 1の6 callを基礎とし、environment proposalとfocus choiceがともに発火すれば8 callである。free actionがあればさらに1 call、turn-limitではrefereeとjudgmentがさらに各1 callとなる。これはコード経路の上限であり、実測頻度、token、価格、latencyのbaselineではない。

character作成・編集、battlefield/narration-style作成、battle後のcharacter improvementはbattle進行とは別予算にする。存在はinventoryに残すが、Issue #98のturn予算へ合算しない。

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

### 3.1 採用候補となるV1 budget

以下はownerが受け入れるための初期契約候補であり、現行実装値ではない。具体的なtoken数・金額はusage取得とpricing snapshotが揃うまで空欄を許し、空欄のrouteをproductionへ有効化してはならない。

| responsibility | normal-turn call ceiling | attempt ceiling | 初期route制約 |
| --- | ---: | ---: | --- |
| psyche | sideごとに0、列挙例外時のみ1 | callあたり2 | deterministic/no-callを通常経路とし、A/Bを一つのpromptにしない |
| action | 行動決定が必要なsideごとに1 | callあたり2 | observer-safe projectionだけを入力にする |
| expression | eligibility成立sideごとに1 | callあたり2 | actionと別context。無発話を正常なskipとする |
| semantic/world | turnあたり1 | 2 | known canonical operationは0、free-form候補だけ1 |
| sensory evidence | topologyで0または1 | 2 | semantic/worldとのcombined可否は既存fixtureで個別に承認する |
| narration | committed turnあたり1 | 2 | advanceから分離し、job IDでdurable reuseする |
| terminal explanation | terminalあたり0または1 | 2 | deterministic winnerを変更しない。説明だけを生成する |
| encounter | battleあたり0または1 | 2 | immutable setup generationを再利用する |

V1では同一callの自動retryを1回までに削減する候補を採る。二度目のretry、高価なmodel、別providerへの切替は、責務ごとに列挙されたfallback classとbattle-level ceilingの両方を満たす場合だけ許す。数値を埋める前のproduction変更は禁止する。

最初の削減目標は、通常turnの基礎6 callを、psycheの通常0 call化とnarrationの非同期化後に「同期advance 2–4 call、独立narration job 1 call」へ分けることである。2–4の内訳は後攻action 1、必要時expression 0–2、未知のsemantic/world 0–1であり、先行予約の作成時点は別turn receiptへ帰属させる。これは目標値で、後続fixtureと実測を通るまで達成扱いにしない。

## 4. 計測receipt

private prompt/outputを公開せず、各callまたはskipについて次を内部receiptへ記録する候補とする。

- responsibility、phase、turn、side。
- `skipped | deterministic | lightweight | high_cost | reused | failed`。
- route reason、provider/model/prompt generation。
- input/output token、課金見積、latency、attempt count。
- schema validation、fallback、durable reuse。
- privacy-safe quality resultまたはfixture version。

管理画面は集計とroute reasonを表示し、private psyche、raw prompt、hidden perceptionは表示権限とretentionを別契約にする。

call、attempt、jobを別IDで記録する。少なくとも `battleId`、`turn`、`responsibility`、`callId`、`attempt`、`idempotency/reuse key`、policy/model/prompt generationを結合できなければ、retryやreconnectによる重複課金を判定できない。

現行adapterはresponse本文を返す一方、共通経路でprovider usageをreceiptへ保存していない。このため、現在確認できるのは静的call上限と既存timeout/retry規則までであり、token、課金、p50/p95は **baseline unavailable** と記録する。推定値を実測値として補完しない。

## 5. 採用判断

baselineと候補を同じfixture、同じbattle class、同じpricing snapshotで比較する。

- battle/turnあたり総costとcall数。
- responsibility別cost share。
- p50/p95 latency、timeout、retry、fallback。
- schema-valid率、privacy violation、canonical divergence。
- action validity、expression repetition、narration completeness等の責務別品質。
- cost分布のcharacter/event偏り。

一部callが減っても、長いprompt、repair、fallbackで総costが増える案は不採用とする。品質floorを割ってまでcostだけを下げない。一方、fixture上同等なら軽いmodelを優先する。

### 5.1 固定する比較条件

- setup、通常turn、free-action turn、environment発火turn、turn-limit、KO/aftermathを別classにする。
- A-first/B-first、private perception差、provider failure、save成功後の応答失敗を含む固定fixtureを使う。
- provider/model/prompt、pricing、入力・出力schema、fixture setを世代IDで固定する。
- 少なくともcall数、attempt数、input/output token、推定課金、wall latencyを欠損のまま明示できる形式で採取する。
- quality floorはschema-valid 100%、private input leak 0、canonical mechanics divergence 0をhard rejectとする。characterらしさ等の主観評価は別指標とし、hard rejectを相殺しない。
- shadow比較中は候補出力をcanonical state、public narration、次consumer入力へ接続しない。

金額、token、latencyの採用閾値はbaseline取得後に設定する。初回の比較は「総課金が減少し、hard rejectがなく、責務別fixtureの非劣性範囲内」であることを必要条件とするが、非劣性幅と必要標本数は未決とする。

## 6. 初期優先順

1. call inventoryと実測baselineを作る。
2. retry/reconnectによる重複callをdurable reuseで除く。
3. deep psycheのroutine callをdeterministic/no-call化する。
4. action/expressionの入力を責務別に短縮し、lightweight modelを評価する。
5. known canonical operationでsemantic LLMをskipする。
6. narrationを非同期化し、lightweight narratorを独立評価する。
7. prologue、aftermath、finale等の低頻度・高価値routeを評価する。

順序はbaselineでcost shareが異なる場合に変更してよい。常に最も総cost削減効果が高く、境界を壊さない責務を先にする。

## 7. owner decision

この文書で受入対象にできるのは、次の境界である。

1. LLMコストをbattle pipeline全体の上位指標とする。
2. context/authority/privacyの異なる責務は統合しない。
3. route順を `skip/reuse -> deterministic -> fixed lightweight -> enumerated high-cost fallback` に固定する。
4. callとprovider attemptを分離し、retryを含む総課金で比較する。
5. normal-turn V1のcall ceilingとattempt ceilingを上表の候補で開始し、空欄のtoken/金額budgetではproduction routeを有効化しない。
6. hard quality/privacy floorとshadow非権限を固定する。
7. 現時点のtoken/cost/latencyはbaseline unavailableであり、後続の計測実装なしに削減達成を主張しない。

この受入はmodel選定、課金を伴うbenchmark、production設定変更、route実装を認可しない。

## 8. 未決事項

- 現行provider/model別の実測cost、token、latency baseline（現行共通adapterでは取得・永続化されない）。
- model pricing snapshotの取得・保存方法。
- 各責務のquality fixtureと最低基準。
- lightweight model候補とhosting方法。
- high-cost fallbackを許すevent classと上限。
- prompt cache、batch、parallelismが課金・latencyへ与える効果。
- provider usage metadataが欠損する場合のcost推定。
- test/user dataのtrace retentionとaccess。

これらを決める前にmodel置換やproduction route変更を行わない。
