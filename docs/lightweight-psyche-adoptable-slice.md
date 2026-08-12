# キャラクター反応ポリシー — 初期採用可能スライス

Status: proposed implementation design; implementation requires owner gate  
Date: 2026-08-12  
Reference model: [軽量NNによる深層心理・内的反応ポリシー設計](lightweight-psyche-reaction-policy.md)  
Decision constraints: [ADR-0004](adr/0004-versioned-lightweight-psyche-dynamics.md)

## 1. 結論

現時点で採用可能なのは、学習済みNNではなく、その前提となる**決定的で計測可能なキャラクター反応ポリシー**である。既存のobserver-relative perceptionを入力境界として再利用し、明示的なtrait、対象別relationship、直前state、正規化されたevent impactから、boundedなreaction deltaを計算する。

このスライスの最優先成果は、通常turnのdeep-psyche処理で使うLLMコストを下げることである。完全なNN化を待たず、決定的policy、呼出しskip、固定小型modelによる軽量LLM経路を組み合わせてよい。ただし、コスト削減のためにpsyche、action、expressionのcontextを統合してはならない。

初期スライスは次だけを実装対象候補とする。

1. 小さな明示schemaとcontrolled vocabulary。
2. 既存のcommitted evidenceからの決定的feature extraction。
3. 明示パラメータによるbounded reaction deltaとdecay。
4. action用とexpression用の別projection。
5. private reason receipt、generation binding、固定fixture。
6. 現行deep-psyche LLMとのshadow比較と、routine callを削減するreversible routing。

これによりLLM置換の可否とコスト削減を測れるが、このスライスだけでNN採用、学習データ二次利用、production rolloutを許可しない。

### 1.1 コスト優先の実行経路

採用候補は低コスト順に評価する。

1. **deterministic/no-call**: featureとstateから十分なreactionを得られる通常case。
2. **deterministic hold/no-op**: 新しい意味判断が不要で、decayまたはprior state維持で足りるcase。
3. **lightweight LLM**: 自由記述の互換projection等、規則だけでは不足するが小型modelで処理できるcase。
4. **current high-cost LLM fallback**: OOD、schema failure、重要case等、ownerが列挙した例外だけ。

runtimeが品質を自己判断して無制限に上位modelへ昇格する設計は採らない。route条件、provider/model、timeout、最大call数はversioned policyとして固定し、receiptへ`no_call | lightweight | fallback`と理由を残す。

lightweight LLMを使う場合も入力はpsyche専用projectionだけとし、action、expression、canonical stateを同じcallで生成しない。modelの軽さは名称ではなく、実測cost、latency、schema-valid率、fallback率で判断する。

## 2. 採用判断の基準

採用要素は次を満たすものに限定した。

- 現行の`CharacterPerceptionFrame`、`TurnObservationPacket`、committed mechanical evidenceから入力根拠を追跡できる。
- 自由文の意味推測や新しいLLM callを前提にしない。
- 同じ入力と世代から同じquantized結果を得られる。
- private state、action proposal、expression、canonical adjudicationを分離できる。
- legacy battleへ未記録のtraitやstateを推測補完しない。
- local fixtureでprivacy、連続性、A/B対称性、影響方向を検証できる。
- 失敗時に現行経路を保持でき、rollbackが明確である。

## 3. 初期責務境界

```text
committed observer-safe evidence
        |
        v
DeterministicReactionFeatureBuilder
        |
        v
ReactionInputV1
  + PsycheTraitProfileV1
  + RelationshipStateV1
  + prior ReactionStateV1
        |
        v
DeterministicReactionPolicyV1
        |
        +--> next private ReactionStateV1
        +--> ActionReactionProjectionV1
        +--> ExpressionReactionProjectionV1
        +--> private ReactionReceiptV1
```

この境界は実装module数を固定しない。重要なのは、feature builderがobserver-safe evidenceだけを読み、policy outputがactionや発話を直接生成せず、server-owned validationより上位のauthorityを持たないことである。

## 4. 初期schemaの最小候補

以下は実装前owner gateで調整する概念候補であり、確定APIではない。

### 4.1 ReactionInputV1

初期event featureは、既存の構造から安定して導出できる軸に限定する。

- observer side。
- event origin: `self | counterpart | environment | system`。
- target: `self | counterpart | ambient`。
- effect direction: `beneficial | adverse | mixed | unchanged | unknown`。
- qualitative magnitude: `none | low | moderate | high | critical | unknown`。
- certainty: 既存observer certaintyのbounded mapping。
- categories: `resource_change | action_blocked | action_succeeded | position_or_access_change | utterance_received | terminal_change | other_validated`。
- repetition / novelty: committed historyから完全に導出できる場合のみ。

`rejection`、`affiliation`、`norm violation`、`expectedness`等は有用だが、現在のcommitted evidenceだけでは安定して導出できないためV1の必須入力にしない。将来はvalidated semantic proposalとして追加できる。

### 4.2 PsycheTraitProfileV1

初期traitは、反応gain、decay、projectionに直接対応する少数の明示値に限定する。

- adverse sensitivity。
- uncertainty sensitivity。
- recovery speed。
- irritation persistence。
- anxiety persistence。
- approach tendency。
- withdrawal tendency。
- impulse inhibition。
- expression restraint。

名称と軸数は未決だが、各軸には値域、neutral、unknown、default、方向、作用先を定義する。character proseやcharacter全体のembeddingは使用しない。

### 4.3 RelationshipStateV1

初期はbattle-localかつ対象をcounterpart一人に限定する。

- trust。
- affiliation。
- fear。
- competition。

battle間継承は行わない。既存opponent memoryから数値を推測しない。初期値をcharacter pairからどう設定するか決まらない場合は、全軸neutralの明示値を使用し、unknownとは区別する。

### 4.4 ReactionStateV1 / ReactionDeltaV1

初期state/outputは既存consumerへ投影しやすい小さな集合に限定する。

- emotion activation: `irritation`, `anxiety`, `relief`, `fear`。
- interpretation tendency: `adverse`, `uncertain`, `affiliative`。
- impulse activation: `confront`, `withdraw`, `approach`, `seek_reassurance`。
- arousal。

すべてbounded continuous valueとする候補で、複数同時活性を許す。`impulse`はactionではない。model reliabilityはV1の心理stateへ混ぜず、receiptの処理信頼性として保持する。

## 5. 正規化と更新

V1の正規化は自然言語embedding用ではなく、同じ構造入力を同じ数値へするために使う。

- enum aliasを一つのcanonical valueへ変換。
- unknown、absent、neutralを区別。
- numeric range、clamp、quantizationを固定。
- feature orderとcanonical serializationを固定。
- unordered collectionをstable sort。
- normalization versionとdigestをreceiptへ記録。

更新は明示式を第一候補とする。

```text
decayed = per_dimension_decay(prior, traits)
delta   = bounded_weighted_response(features, traits, relationship)
next    = quantize(clamp(decayed + delta))
```

weight、decay、clampはversioned tableとして管理し、理由別contributionをreceiptに残す。長期trait、trauma、battle間relationship learningは更新しない。

## 6. consumer projection

- action projectionは、少数のimpulse band、arousal band、adverse/uncertain interpretation bandだけを候補とする。
- expression projectionは、emotion band、arousal、expression restraint適用後のexpression tendencyだけを候補とする。
- raw trait、raw relationship、reason contributionをconsumerへ渡さない。
- actionとexpressionは互いのprojectionやprovider outputを読まない。
- public、opponent、narratorにはreaction stateを渡さない。成立したspeech/actionだけが既存perception経路を通る。

現行deep-psyche LLMが生成する`currentGoal`、beliefs、free-text appraisal、`ExpressionBrief`の移管先は未決である。V1 reaction policyへ含めず、現行経路を維持して比較する。

## 7. 初期評価

固定fixtureだけを採用可能範囲とする。

- 同一入力・同一世代の決定性。
- no-eventでの減衰と、原因のない上昇がないこと。
- adverse magnitudeに対するreactionの単調性。
- certainty低下による断定的interpretation増加がないこと。
- trait一軸変更時のdocumented effect。
- unrelated character field変更に対する不変性。
- observerが見ていないcanonical fact変更に対する不変性。
- A/B role swapでの構造対称性。
- impulseがactionへ直接変換されないこと。
- schema/model failure時に現行LLM経路または明示no-opへ戻ること。

コスト受入では少なくとも次を測る。

- normal turnあたりのdeep-psyche provider call数。
- high-cost model call率とlightweight model call率。
- input/output token、課金見積、p50/p95 latency。
- deterministic/no-op coverage、schema failure、fallback率。
- characterごと・event categoryごとのcost偏り。
- cost削減時のfixed fixture pass率とdownstream action/expression regression。

目標値は現時点で断定せず、Phase A0でbaseline計測方法とreject thresholdを決める。ただし、call数が減ってもfallbackの再試行やprompt増大で総costが増える候補は不採用とする。

shadow比較では、現行deep-psyche LLM outputを自動的な正解としない。比較対象はstate continuity、変化方向、downstream repetition、latency、call countであり、自由文同値性を要求しない。

## 8. 初期導入計画

### A0: owner gate

- V1 tag、値域、default/unknown/neutral、trait作用、private retentionを承認。
- 現行LLMと並行するshadowの保存範囲とアクセス権を承認。
- retained user battle dataを学習へ使わないことを初期defaultとして確認。
- normal turnのcall ceiling、high-cost fallback対象、lightweight model候補、cost/quality reject thresholdを承認。

### A1: schemaとfixture

- server-private conceptual schema、normalizer、canonical digestを追加。
- source provenance、privacy、continuity、counterfactual fixtureを追加。
- battle asset manifestへcontract generationを追加。

### A2: deterministic feature builder / policy

- committed evidenceからV1 featuresを構築。
- explicit decay、reaction delta、projection、receiptを実装。
- administratorにはgeneration、処理状態、bounded reason codeだけを表示。

### A3: shadow comparisonとcost routing計測

- 現行deep-psyche LLMをauthoritativeのまま維持。
- deterministic V1をshadow実行し、battle stateとconsumer inputを変更しない。
- fixed local casesと許可されたtest battleだけで比較する。
- deterministic/no-op/lightweight/high-costのrouteをshadow判定し、実行した場合の推定costとcoverageを記録する。providerを実際に呼ぶ範囲は別途承認する。

### A4: adoption decision

- rule policyをprivate reaction stateのauthoritative sourceにするかownerが判断。
- 不採用でもschema、fixture、計測結果を保持し、現行経路へ影響させない。
- 採用時もgoal、belief、intent、expression briefの置換は別taskとする。
- 通常caseをdeterministic/no-callへ切り替え、必要な互換処理だけlightweight LLMへ限定するか判断する。
- high-cost fallback率が上限を超えた場合はrolloutせず、routeまたはV1 featuresを見直す。

## 9. 初期採用から除外する要素

| 除外要素 | 理由 | 再検討条件 |
| --- | --- | --- |
| 軽量NNの学習・authoritative採用 | gold data、dataset権限、runtime基準がない | V1 receiptsと独立human評価が蓄積 |
| psyche traitの自然言語embedding | embedding modelとnormalizerの受入がない | curated profileとablation評価が成立 |
| experience自由文embedding | hidden fact・prose authority・prompt injection境界が未解決 | validated canonical serializationを定義 |
| LLM judgeによるsilver自動採用 | evaluator prompt/model、bias、費用が未承認 | fixed setとhuman auditで評価器を受入 |
| gold/silver学習pipeline | retention、同意、split、review運用が未決 | データガバナンスを別承認 |
| human active-learning UI | review主体と運用費が未決 | review protocolとownerを確定 |
| recurrent hidden state | battle stateと二重authorityになる | 明示stateでは不足する実証 |
| long-term trauma / relationship learning | battle間authorityと安全性が未定義 | 独立ADRとデータ方針を承認 |
| third-party affect model | domain、license、validation不一致 | separate benchmarkで採用根拠を得る |

除外は設計要素の否定ではなく、初期採用判断を可能にするためのscope boundaryである。

## 10. 実装前の未決事項

1. V1 tagとtraitの最小集合、値域、default。
2. relationship V1を全neutralで開始するか、owner-authored値を許可するか。
3. utterance receivedを意味分類せずevent categoryとして扱う範囲。
4. 現行deep-psyche LLMとのshadow結果をどこまで保存するか。
5. fallbackを現行LLM、prior-state維持、no-op deltaのどれにするか。
6. `CharacterAgentState`へnumeric stateを加えるか、別private envelopeにするか。
7. prologue / normal / aftermathのうちV1対象をnormal turnだけにするか。
8. A4でrule policyを採用した際、free-text emotionとの互換projectionをどう作るか。
9. lightweight LLMの候補、hosting、cost ceiling、provider failure時の扱い。

これらを決定するまでは実装を開始しない。
