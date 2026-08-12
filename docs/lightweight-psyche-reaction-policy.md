# 軽量NNによるキャラクター深層心理・内的反応ポリシー設計

Status: design only; implementation not authorized  
Date: 2026-08-12  
Decision basis: [ADR-0004](adr/0004-versioned-lightweight-psyche-dynamics.md)  
Related: [Observer-relative battle perception](battle-perception.md), [Battle semantic state](battle-semantic-state.md), [Issue #98 battle pipeline plan](issue-98-battle-pipeline-plan.md)

## 0. 文書上の区分

本書では、現在の実装と将来案を混同しないため、次の語を使う。

- **確認済み**: 現在のコードまたは既存のAccepted ADRから確認できる事項。
- **決定済み**: ADR-0004でAcceptedとなった設計制約。
- **提案**: 実装前の設計候補。APIや保存形式として未確定。
- **例示**: 議論を具体化するための仮の値・タグ・JSON。互換性契約ではない。
- **未決**: owner decision、実験、または追加調査が必要な事項。

本モジュールは人間心理一般を正確に再現するモデルではない。対象キャラクターについて、設計者が望む一貫した反応傾向を、観測可能な経験と持続状態から生成する**キャラクター反応ポリシー**である。「深層心理」はゲーム内部の非公開・持続的なキャラクター状態を指す製品用語であり、臨床的・心理学的診断を意味しない。

### 0.1 目標像の扱い

本書の五層分割、入力group、出力head、状態更新式、モデル候補、Phase順序は、現時点の**理想的な参照モデル**であって、将来実装がその形を忠実に再現することを要求しない。既存コードへの適合、データ品質、評価結果、推論コスト、運用可能性に応じて、項目の統合・分割・省略・名称変更・導入順序変更を認める。

ただし、形を変更する場合も、本書で挙げる要素を設計レビューのチェックリストとして参照し、採用、代替、延期、不要のいずれかと理由を記録する。たとえば三つの独立headを一つの共有表現から導出してもよいが、emotion、interpretation、impulseが概念上混同され、衝動がそのまま行動命令になる設計は避ける。

形より優先する制約は次である。

- observer-relativeな入力境界とprivate stateの非公開性。
- reaction outputが発話、行動、mechanics、勝敗を直接決定しないこと。
- LLM削減を理由に異なるauthorityのcontextを無検討に統合しないこと。
- 入力、正規化、モデル、評価器、データの世代と比較可能性を保持すること。
- 未確認事項を現在仕様や心理学的事実として扱わないこと。

## 1. 背景と目的

### 1.1 現在の構成

**確認済み:** 現在の通常ターンには、概ね次の責務がある。

```text
canonical mechanics / semantic world
        -> validated observer-relative perception
        -> TurnObservationPacket (A/B separately)
        -> deep-psyche LLM
        -> private CharacterAgentState update + ExpressionBrief
        -> expression/action generation
        -> server validation and canonical adjudication
        -> narration
```

`CharacterAgentState` は `privateMemory`、`currentGoal`、`emotion`、`beliefs`、`observations`、`dialogueThread`、`interior` などをbattle stateに保持する。`CharacterDeepPsyche` の主要フィールドは現在、自然言語文字列または小さなenumである。compact pathでは `TurnObservationPacket`、直近会話、matchup memory等をdeep-psyche LLMへ渡し、その呼出しがprivate deltaと`CharacterExpressionBrief`を返す。

`TurnObservationPacket` は、確定したobserver-relative perceptionから `selfResult`、`counterpartResult`、`ambientChange` を作る既存の安全境界である。一方、その各itemは主に `phenomenon` 文字列、certainty、source event IDsであり、NNが直接使うactor、target、利益、損失、脅威、親和、予想差などの固定特徴契約ではない。

### 1.2 解決したい問題

- 毎ターンの自由生成でprivate stateが過剰に複雑化または不連続になり得る。
- routineな内的反応にもLLM latency、token、provider availabilityが必要になる。
- キャラクター特性、関係、直前状態が同じでも、生成ゆらぎが一貫性を弱め得る。
- deep psycheがprivate reactionだけでなくexpression briefまで生成するため、将来の責務分離に移行境界が必要である。

### 1.3 目的

軽量NNの主責務を次に限定する。

```text
(battle-frozen psyche traits,
 observer-safe normalized experience,
 target relationship state,
 prior private psyche state)
        -> internal reaction distribution
```

出力は感情、主観的解釈傾向、行動衝動、活性度、モデル信頼性である。出力は発話、意図、行動、正準世界変更ではなく、それぞれの独立consumerへ渡す補助情報である。

## 2. 対象範囲と対象外

### 2.1 対象範囲

- battle内で持続するprivate psyche stateの概念モデル。
- observer-safeな確定経験からNN入力を作る正規化境界。
- キャラクター固有の`PsycheTraitProfile`と対象別relationship state。
- emotion、interpretation、impulse等のマルチラベル・連続強度出力。
- 減衰と反応加算による状態更新候補。
- 軽量モデル候補、学習データ、評価器、品質区分、固定評価セット。
- shadowから限定導入までの段階的運用。
- schema、normalizer、evaluator、model、datasetの独立versioning。

### 2.2 対象外

- 人間心理、精神疾患、人格診断の再現または推定。
- NNによる発話文、意図、具体的行動、action legality、HP、勝敗の決定。
- observerが知覚していないcanonical truthの入力。
- narrator proseや未検証LLM proseからの心理事実抽出。
- character sheet全体のembedding。
- 今回のソースコード、DB、API、migration、training pipelineの実装。
- 学習済みモデルをauthoritativeに採用する判断。

## 3. 全体アーキテクチャ上の位置付け

### 3.1 責務の五層

**提案:** 製品上の責務を検討するため、次の五層を参照モデルとする。実装module数やAPI境界を五つに固定するものではない。

| 層 | 主な責務 | authority |
| --- | --- | --- |
| 1. 深層心理 | 持続するtrait、baseline、現在のprivate affect、遅い関係傾向 | battle-bound private state |
| 2. 経験への内的反応 | 今回の経験に対するemotion / interpretation / impulse delta | 本軽量reaction policy |
| 3. 意図 | 何を目指すか、何を守るか、表現するか抑えるか | 独立character consumer。将来方式は未決 |
| 4. 行動計画 | available actionsからaction proposalを選ぶ | action consumer + server validation |
| 5. 正準裁定 | mechanics、action legality、semantic/world commit、terminal outcome | engine / server / validated reconciliation |

層2は層3・4を強制しない。たとえば`confront=0.8`は対立衝動が強いことを示すだけで、攻撃、威嚇、沈黙、抑制のどれを選ぶかは意図・行動層が、available actionsとキャラクター方針を含めて判断する。

### 3.2 データフロー

```text
committed bucket facts
  + observer-relative perception frame
        |
        v
server-owned feature extraction / normalization
        |  (no hidden canonical facts, no narration prose)
        v
NormalizedExperience
  + bound PsycheTraitProfile
  + RelationshipState[target]
  + PriorPsycheState
        |
        v
Lightweight Reaction Policy
        |
        +--> ReactionOutput + reliability
        |
        v
server-owned bounded state update
        |
        +--> ActionPsycheProjection ----> action consumer
        +--> ExpressionPsycheProjection -> expression consumer
        +--> private audit receipt

action/expression proposals -> server validation -> canonical adjudication
```

**決定済み:** private psyche、action、expression、semantic/world adjudication、narrationを、呼出し削減のため一つのLLM contextへ統合しない。

### 3.3 既存構成との接続

- `CharacterPerceptionFrame` と `TurnObservationPacket` はNN入力の上流に再利用できる。ただし後述のtyped feature extractionが必要である。
- `CharacterAgentState` はprivate persistence envelopeとして互換層に利用できる可能性があるが、現行の自由記述フィールドだけでは連続状態を表せない。
- `CharacterDeepPsyche` は既存consumer向け表示・projectionとして段階移行できる可能性がある。NNの内部状態と同一schemaとは限らない。
- `DecisionProfile` は勝利目的とdecision principlesを持つが、心理trait profileではない。混用しない。
- ADR-0003に従い、input schema、normalizer、trait profile、embedding、model weights、fallback policyをbattle asset manifestへ世代固定する。

## 4. 入力の概念スキーマ

以下は**例示**であり、確定TypeScript/APIではない。

### 4.1 入力を分離する理由

単一の埋め込みへ全情報を混ぜると、次を検査しにくい。

- 状況を変えた効果とキャラtraitを変えた効果。
- 同じ出来事を別の対象が行った場合の関係効果。
- prior stateによる慣性とfresh reaction。
- unrelated character factsによるembedding leakage。

そのため、最低限 `experience`、`psycheTraits`、`relationship`、`priorState` を別branchまたは別feature groupとして保持する。

### 4.2 NormalizedExperience

**提案:** 自然言語をそのまま渡さず、server-ownedな構造へ正規化し、必要な表示文字列だけcanonical serializationして固定embedding modelへ渡す。

```json
{
  "schemaVersion": "experience.v0-example",
  "observerRole": "self",
  "eventClass": "counterpart_action",
  "actorRelation": "counterpart",
  "targetRelation": "self",
  "observableAct": "refused_request",
  "impact": {
    "benefit": 0.0,
    "loss": 0.2,
    "threat": 0.1,
    "affiliation": -0.6,
    "controlChange": -0.3,
    "normViolation": 0.2
  },
  "expectation": {
    "expectedness": -0.7,
    "controllability": 0.3,
    "certainty": 0.8
  },
  "evidenceRefs": ["observer-local-ref-example"]
}
```

候補項目は次を含むが、採否と範囲はPhase 0で決める。

- event class、actor、target、observable act、result category。
- self / counterpart / ambientへの利益、損失、脅威、親和、支配・制御、規範、目標関連性。
- expectedness、novelty、certainty、controllability、attribution certainty。
- sourceが発話の場合のheard / understood / attributed。発話内容のembedding採用は別途privacy評価が必要。
- temporal position、repetition、freshness。turn番号そのものを性格差の代理特徴にしない。

**確認済みの不足:** 現行`TurnObservationItem.phenomenon`は文字列であり、上記の影響軸をauthoritativeに保持していない。文章のkeyword分類で埋めることは既存のsemantic/perception方針と衝突する。入力特徴はmechanical evidence、validated semantic/world transition、utterance evidence等の構造から導出するか、独立して検証された提案として扱う必要がある。

### 4.3 PsycheTraitProfile

**決定済み:** character sheet全体や任意の設定文をembedしない。深層心理に関係するaccepted structured profileだけを正規化・canonical serializeしてembedする。

```json
{
  "schemaVersion": "psyche-traits.v0-example",
  "needs": {
    "approval": 0.7,
    "attachmentSecurity": -0.5,
    "autonomy": 0.6,
    "control": 0.4
  },
  "appraisalBias": {
    "abandonmentSensitivity": 0.8,
    "distrust": 0.5,
    "guiltProneness": 0.3,
    "rejectionSensitivity": 0.7
  },
  "regulation": {
    "selfEsteemStability": 0.35,
    "approachIntimacy": 0.4,
    "avoidIntimacy": 0.6,
    "impulseInhibition": 0.55
  }
}
```

これは例示であり、特定の心理学尺度または診断名への準拠を主張しない。traitは設計者が望むcharacter policyのパラメータである。

正規化契約には、Unicode、空白、controlled vocabulary、alias、field order、unknown / absent / neutral、numeric scale、clamp、quantization、重複・矛盾解決、canonical serializationを含める。source proseからの抽出を行う場合、抽出結果はproposalであり、accepted profileとは分離する。

### 4.4 RelationshipState

```json
{
  "schemaVersion": "relationship.v0-example",
  "targetRef": "battle-local-counterpart",
  "trust": -0.2,
  "affection": 0.4,
  "fear": 0.1,
  "competition": 0.7,
  "dependency": 0.2,
  "indebtedness": 0.0,
  "familiarity": 0.5
}
```

関係stateは対象ごとに分け、global traitと混同しない。不信傾向はtrait、特定相手へのtrustはrelationshipである。現行には自然言語の`attitudeTowardCounterpart`、`relationshipTension`、opponent memoryがあるが、数値relationship stateのcanonical authority、初期化、battle後への持越し規則は**未決**である。

### 4.5 PriorPsycheState

```json
{
  "schemaVersion": "psyche-state.v0-example",
  "emotion": {
    "irritation": 0.25,
    "anxiety": 0.35,
    "relief": 0.0,
    "fear": 0.15
  },
  "interpretationActivation": {
    "rejection": 0.2,
    "threat": 0.15,
    "affiliation": 0.1
  },
  "impulseActivation": {
    "confront": 0.2,
    "withdraw": 0.1,
    "approach": 0.1,
    "seekReassurance": 0.25
  },
  "arousal": 0.4,
  "fatigue": 0.2
}
```

タグ集合は例示に限定しない。Phase 0では、genre-neutral、bounded、相互排他的でない、未知タグを無秩序に増やさない、consumerに行動を命令しない、という基準でontologyを選ぶ。

## 5. 出力の概念スキーマ

### 5.1 分離された出力head

```json
{
  "schemaVersion": "reaction-output.v0-example",
  "emotion": {
    "irritation": 0.62,
    "anxiety": 0.48,
    "relief": 0.02
  },
  "interpretation": {
    "rejection": 0.74,
    "threat": 0.31,
    "affiliation": 0.05
  },
  "impulse": {
    "confront": 0.58,
    "withdraw": 0.22,
    "approach": 0.08,
    "seekReassurance": 0.46
  },
  "arousal": 0.57,
  "reliability": {
    "overall": 0.69,
    "outOfDistribution": 0.18,
    "supportBand": "silver_supported"
  }
}
```

- `emotion`: affect labelごとの同時活性。単一classに限定しない。
- `interpretation`: characterが出来事をどう受け取りやすいかという傾向。canonical factではない。
- `impulse`: 行動へ向かう内的圧力。actionまたはintentではない。
- `arousal`: 心理的活性度。stamina等のmechanical resourceではない。
- `reliability`: model outputを採用・fallback・人間reviewへ送る判断材料。

**命名上の注意:** 現行`CharacterDeepPsyche.confidence`はcharacter自身のconfidenceを`low | steady | high`で表す。モデル信頼性と衝突させず、将来schemaでは`selfConfidence`と`predictionReliability`等に分ける。

### 5.2 出力しないもの

- 発話文、口調文面、`ExpressionBrief`そのもの。
- `currentGoal`、`unspokenIntent`、具体的な次action。
- counterpartの心理、hidden identity、canonical semantic fact。
- mechanics delta、success/failure、winner。
- chain-of-thoughtまたは自然言語の自由な内省記録。

### 5.3 consumer projection

同じreaction outputを全consumerへ渡さない。

- action projection: relevant impulse、arousal、必要ならinterpretation band。private proseは渡さない。
- expression projection: outward expressionに関係するemotion band、expression impulse、concealment/regulation結果。action proposalは渡さない。
- administrator projection: model/version、bounded summary、reliability、reason codes。private raw features、embedding、関係詳細の表示権限は別途決める。
- public / opponent projection: 原則なし。実際に成立した行為・発話だけがperception経路へ戻る。

## 6. 心理状態の保持と更新

### 6.1 基本更新候補

**提案:** 毎turn全状態を再生成せず、前状態の減衰と今回reactionをserver-owned update policyで合成する方式を第一の参照候補とする。評価上より安定した別方式があれば置換できる。

```text
decayed_state = decay(prior_state, trait_profile, elapsed_steps)
candidate     = decayed_state + gated(reaction_output)
next_state    = clamp_and_quantize(candidate)
```

NNが`next_state`全体を直接出す方式と、`reaction delta`だけを出す方式が考えられる。初期候補は、連続性、fallback、解釈可能性のためdelta出力を優先する。

### 6.2 時間スケール

以下は**意図を示す例**であり実装値ではない。

- surpriseのような短期反応は速い減衰候補。
- anger / irritation / anxietyは中程度の減衰候補。
- distrust、attachment、relationship tendencyは遅い更新候補。
- trauma、価値観、core need等の長期変化は通常turn stateから分離し、別authority・別review・別世代にする候補。

減衰はemotion tagだけでなくcharacter trait、regulation、直後の再刺激、関係対象に依存し得る。NN内に隠す、明示policyに置く、両者を有界に組み合わせる、という候補は未決である。

### 6.3 persistenceとreplay

保存候補には少なくとも次を含める。

- prior state revisionとnext state revision。
- normalized input digestとobserver side。
- trait / relationship / model / normalizer generation IDs。
- model raw outputのquantized form。
- decay、clamp、fallback、採用結果のreason-coded receipt。

同じbound generations、normalized input、prior stateから同じquantized stateが得られることを目標とする。ただし使用runtime、浮動小数点、ONNX backendまで含めたbit-exact replayを要求するかは未決である。

## 7. 軽量NNの候補構成

モデル構造は本書では確定しない。

### 7.1 共通前処理

- 固定済みembedding modelでcanonical normalized stringsをvector化する。
- embeddingはofflineまたはasset-generation時に計算し、毎turn同じtrait textを再推論しない。
- experience textをembedする場合も、raw narrationではなくcanonical normalized representationを使う。
- numeric featuresはscale、clamp、missingness maskを明示する。
- embedding vector自体とmodel input feature orderをversioned artifactにする。

### 7.2 候補A: feature-group MLP

各groupを個別に小さくprojectし、interaction featuresとともにMLPへ入れる。

```text
E = project(experience embedding + numeric impact)
T = project(psyche-trait embedding + explicit traits)
R = project(relationship embedding + explicit relation)
S = project(prior state)

H = MLP([E, T, R, S, E*T, E*R])
heads = emotion / interpretation / impulse / arousal / reliability
```

単純連結より状況×trait、状況×relationshipの相互作用を明示できる。CPU推論、学習、ONNX化が容易な第一候補だが、手設計interactionが増えすぎるリスクがある。

### 7.3 候補B: gated / FiLM-conditioned MLP

experience encoderのhidden stateをtraitとrelationshipから得たbounded scale/biasで変調する。共通reaction dynamicsとcharacter差分を分けやすい。scale範囲を制限すればADR-0004の「共通基底＋有界な個体差」に合う。一方、解釈とdebugは候補Aより難しい。

### 7.4 候補C: low-rank residual adapter

共通base MLPに対し、psyche-only embeddingからlow-rank residualを生成する。character差を柔軟に表せるが、データ量、正則化、OOD評価、artifact versioningが増える。初期モデルではなく、十分なgold/silverデータ後の候補とする。

### 7.5 候補D: 小型recurrent / state-space model

GRU等で時系列を内部保持する候補。連続反応を学びやすいが、battle stateとmodel hidden stateが二重の状態authorityになり、replay、migration、説明可能性が難しくなる。明示`PriorPsycheState`を保存する設計では、最初から採る理由は弱い。

### 7.6 選択基準

| 観点 | A: grouped MLP | B: gated/FiLM | C: low-rank adapter | D: recurrent |
| --- | --- | --- | --- | --- |
| 推論コスト | 低 | 低 | 低〜中 | 中 |
| 必要データ | 少〜中 | 中 | 中〜多 | 多 |
| CPU/ONNX | 容易 | 容易 | 要検証 | 要検証 |
| 明示stateとの親和性 | 高 | 高 | 高 | 低〜中 |
| 解釈可能性 | 比較的高 | 中 | 中〜低 | 低 |
| character interaction | 手設計で明確 | bounded modulation | 柔軟 | 時系列込みで柔軟 |
| 再学習・差替え | 容易 | 比較的容易 | artifactが増える | state migrationが難しい |
| 初期候補 | 推奨 | 比較対象 | 後期候補 | 保留 |

parameter数、embedding model、runtime、latency目標は未決であり、計測前に「軽量」を特定サイズとして断定しない。

## 8. 評価者の役割

### 8.1 機械評価

決定的で高速なreject / flag / metricを担当する。

- schema、必須head、tag vocabulary、値域、有限値。
- prior stateからの最大変化、decay、clamp、連続性。
- 原因eventがない大変化、相互に明確に矛盾する出力。
- observer inputにないactor、intent、事実、identityへの依存。
- 同一・近傍inputに対する極端な変動。
- unrelated trait ablation、A/B role swap、relationship target swap。
- reliabilityと実測誤差のcalibration。

機械評価は「心理的に正しい」を判定せず、形式・不変条件・既知の禁止事項を担当する。

### 8.2 LLM評価

文脈依存の比較評価を担当する。

- accepted deep traitとの整合。
- 対象人物とのrelationship反映。
- observer-safe situationへの反応妥当性。
- 設計されたcharacterらしさ。
- prior stateからの心理的連続性。
- emotion / interpretation / impulseの分離。

候補の生成元（rule、NN、他モデル）は評価LLMへ知らせない。候補IDと順序をランダム化し、位置biasを計測する。同じcaseをA/B反転して評価するaudit subsetも持つ。

LLM evaluatorのconceptual outputは次を含む。

- `preference`: A / B / tie / neither。
- 項目別scoreとabstain可能性。
- 修正後の望ましいtarget。
- reason tags。
- evaluator confidence。

自由記述理由は監査補助であり、そのまま学習labelや新事実へ変換しない。

### 8.3 人間評価

全件ではなく、次を優先する。

- machineとLLM evaluatorの不一致。
- 候補差が小さい、evaluator confidenceが低い。
- state changeが大きい、OOD、new tag / relation / event class。
- 類似case間の判断不一致。
- model更新への影響が大きいactive-learning candidate。
- 固定率のrandom quality audit。

人間修正を次の別recordとして保存する。

| correction | 意味 | 直接変更する対象 |
| --- | --- | --- |
| target correction | このcaseの望ましいtag/strength | case target |
| judgment correction | A/B/tie/neither選好の訂正 | comparison judgment |
| evaluator correction | 一般化可能な評価規則・promptへの訂正指示 | evaluator change proposal |

evaluator correctionは即時に過去labelを書き換えない。新version候補を作り、固定評価セットと再評価対象で検証する。

## 9. 学習データの生成・採用フロー

```text
accepted source fixture / retained private receipt
        |
        v
versioned normalization
        |
        +-- mechanical invariant evaluation -- reject/flag
        |
        v
candidate generation
  - deterministic rule baseline
  - current shadow NN
  - optional comparison candidate
        |
        v
blind randomized LLM comparison
        |
        v
triage
  - clear machine+LLM agreement -> silver candidate
  - disagreement / low margin / high impact -> pending human queue
  - invariant violation -> rejected
        |
        v
human correction when selected
        |
        +-- target correction ------> gold target
        +-- judgment correction ----> gold preference
        +-- evaluator correction ---> evaluator change proposal
```

### 9.1 dataset recordの概念例

```json
{
  "caseId": "example-only",
  "versions": {
    "inputSchema": "...",
    "outputSchema": "...",
    "normalizer": "...",
    "traitProfile": "...",
    "embeddingModel": "...",
    "candidateModel": "...",
    "machineEvaluator": "...",
    "llmEvaluatorPrompt": "..."
  },
  "inputDigests": {
    "experience": "...",
    "traits": "...",
    "relationship": "...",
    "priorState": "..."
  },
  "candidates": [
    { "blindId": "candidate-1", "output": {}, "sourceRefEncrypted": "..." },
    { "blindId": "candidate-2", "output": {}, "sourceRefEncrypted": "..." }
  ],
  "evaluations": {
    "machine": {},
    "llm": {},
    "human": null
  },
  "quality": "pending"
}
```

例ではsource隠蔽を示しているが、暗号化方式、trace ACL、保存場所は未決である。

## 10. データ品質区分

| quality | 条件 | 学習利用 |
| --- | --- | --- |
| gold | 人間がtargetまたはjudgmentを確認・修正 | 高い重み候補。human versionと根拠を保持 |
| silver | machine invariantを通過し、blind LLM評価が採用基準を満たす | goldと別weight。自動真実とは扱わない |
| pending | 不一致、低margin、OOD、高影響、保留 | authoritative trainingから除外 |
| rejected | invariant違反または明示的不適切 | 学習targetから除外。hard-negative利用は別フラグ |

qualityは上書き履歴を消さず、transition receiptを残す。goldとsilverのsampling ratio、loss weight、minimum gold coverageをrun manifestに記録する。rejectedをnegative sampleに使う場合、何が誤りかを表すreason tagが必要である。

同一battleの連続turnやほぼ同じcharacter pairをtrain/testへ跨がせない。data leakageを避けるため、split unit候補はbattle、character、scenario family、temporal seriesを考慮する。

## 11. version管理と更新運用

最低限、次を独立artifactとしてversion管理する。

- input schemaとfeature ontology。
- output schemaとtag ontology。
- normalization / canonical serialization。
- machine evaluator logic。
- LLM evaluator prompt、provider、model、sampling settings。
- character `PsycheTraitProfile` generation。
- relationship initialization/update policy。
- embedding model、tokenizer、vector digest。
- lightweight NN architecture、weights、quantization、runtime。
- training dataset manifestとcase quality revisions。
- fixed evaluation setと期待値・許容範囲。
- state update / decay / clamp / fallback policy。

一つのrun manifestが全artifact digest、code revision、seed、split、hyperparameters、metricsを束縛する。battleはauthoritative推論に使うgenerationをADR-0003のasset manifestへ固定する。

### 11.1 freeze window

評価器と学習モデルを無秩序に同時更新しない。

1. evaluator setを一定期間freezeする。
2. 同じevaluatorでdataを蓄積し、model candidateだけを比較する。
3. model候補をfreezeし、evaluator変更候補を固定評価セットで比較する。
4. evaluatorを更新した場合、旧versionとの判定差を保存する。
5. 新しいdataset/modelは新evaluator versionを明示して別runで学習する。

これによりmodel改善、evaluator迎合、dataset構成変化を分離する。

## 12. 固定評価セットと回帰評価

固定評価セットには次を含める。

- 代表的event、trait、relationship、prior state。
- 境界・曖昧・低certainty・tie / neitherが妥当なcase。
- actorだけ、relationshipだけ、traitだけを変えたcounterfactual pair。
- emotionの短期減衰、再刺激、遅い関係変化を確認する連続case。
- 人間が期待rangeまたは順位を確定したgold case。
- 過去のmodel bug、normalization bug、evaluator誤判定。
- unrelated character fieldを変えても不変であるablation case。
- observerに見えない事実を変えても出力不変であるprivacy case。
- OODとfallback / abstain case。

期待値は必ずしも一点targetにしない。multi-label strengthには許容range、順序、単調性、invariantを併用する。

### 12.1 evaluator適合と本来品質の分離

- evaluator-development setとmodel fixed evaluation setを分ける。
- LLM evaluator promptの修正に使ったcaseを、そのprompt改善の独立testに使わない。
- blind human auditを保持し、LLM score向上だけを品質向上と呼ばない。
- evaluator間agreement、human agreement、calibration、neither/abstain率を別metricにする。
- character-specific exemplarsはglobal quality setと分離し、特定characterへのoverfitを検出する。

## 13. 段階的な導入計画

依頼されたPhase 0〜5を基準順序として示し、各phaseにpromotion gateを置く。これは固定工程ではなく、少量PoCの前倒し、評価器準備の反復、Phase間の往復を許容する。変更時にも、schema、evaluator、model、runtimeを無秩序に同時変更せず、比較可能性とrollback単位を残す。

### Phase 0: 契約・ontology・固定評価セット

- input/output概念schema、tag controlled vocabulary、normalizationを定義。
- observer-safe feature provenance、private/public access、retentionを決定。
- explicit deterministic reaction baselineとstate update policyを設計。
- fixed evaluation set、counterfactual、series、privacy fixturesを作る。
- generation manifestとrun manifestを定義。

Gate: ownerがtrait/relationship/state authority、tag、値域、unknown handling、評価基準を承認する。実データ収集はその後。

### Phase 1: rule baselineとsilver候補

- deterministic rule baselineからcandidateを作る。
- machine evaluatorとblind randomized LLM evaluatorをversion固定する。
- agreement caseをsilver候補、disagreement等をpendingへ送る。
- evaluator bias、position bias、self-consistency、costを測る。

Gate: silverを「正解」と呼ばず、coverageと既知biasを記録する。rule outputだけの自己模倣datasetにしない。

### Phase 2: 初期軽量NNとshadow

- grouped MLPを第一候補、gated/FiLMを比較候補として学習する。
- production battle stateを変更しないshadowでrule、NN、任意比較候補を記録する。
- CPU latency、memory、schema validity、continuity、calibration、counterfactualを評価する。

Gate: model outputはauthoritative consumerへ渡さない。第三者modelはreference baselineに限定する。

### Phase 3: 不一致中心の人間評価

- disagreement、low margin、large delta、OOD、novel relationを優先reviewする。
- random sampleでselection biasを監視する。
- target / judgment / evaluator correctionsを分離保存する。
- gold coverageとinter-rater disagreementを可視化する。

Gate: gold昇格、reviewer policy、character-specific exceptionの一般化可否を監査する。

### Phase 4: evaluator改善

- human evaluator correctionsからmachine evaluatorとLLM promptの変更候補を別々に作る。
- frozen modelとfixed evaluation setで各evaluator候補を比較する。
- evaluator更新後にdatasetを再評価する場合、旧判定を消さず新versionを追加する。
- character-specific評価例はglobal evaluatorと独立versionにする。

Gate: evaluator変更とmodel再学習を同一promotionに混ぜない。

### Phase 5: 限定導入と継続回帰

- approved account / battle mode等に限定し、battle開始時にmodel generationを固定する。
- low reliability、OOD、runtime failureはdeterministic baselineへfallbackする。
- canaryではprivate reactionだけを置換し、action legalityやcanonical mechanicsは変更しない。
- latency、fallback、state delta、expression/action downstream、character consistencyを監視する。
- rollbackは新battleのcurrent pointerを旧generationへ戻す。active battleは途中でrebindしない。

Gate: broader adoptionは別owner approval。production release、deployment、data retention開始は本書だけでは許可しない。

## 14. 未決事項・リスク・検証課題

### 14.1 schemaとauthority

- trait ontology、emotion / interpretation / impulse tagの初期集合と拡張手順。
- relationship stateのowner、初期値、battle間持越し、消去、privacy。
- `eventAppraisal`、`currentGoal`、`beliefs`等の既存自由記述を誰が将来更新するか。
- deep-psyche LLMが現在生成する`ExpressionBrief`をどの独立層へ移すか。
- prologue、normal turn、aftermathで同一reaction policyを使うか。

### 14.2 入力品質

- mechanical/semantic/world evidenceからimpact軸を決定的に導出できる範囲。
- free-form eventのimpact proposalをどのauthorityで検証するか。
- utterance content embeddingがprivate inferenceやprompt injectionを生まない境界。
- expectednessをcharacter memoryからどう計算し、未観測情報を避けるか。

### 14.3 modelとstate

- delta予測対next-state予測、明示decay対learned decay。
- multi-label loss、strength regression、ranking/preference lossの構成。
- reliabilityをcalibration、ensemble disagreement、distance、conformal prediction等のどれで表すか。
- CPU runtime、ONNX、quantization、determinism、許容latency/size。
- embedding modelの日本語・架空設定・canonical string適合性。

### 14.4 dataとevaluation

- LLM evaluator provider/modelの選定、費用、複数judge、再現性。
- human reviewer数、agreement基準、conflict resolution。
- gold/silver loss weight、minimum gold coverage、character imbalance。
- retained battle dataを学習へ二次利用する権限、同意、削除、retention。
- rare/high-impact心理変化を学習させつつ過剰反応を防ぐsampling。
- evaluator gamingと特定promptへのoverfit。

### 14.5 安全性と製品品質

- 診断的ラベル、差別的proxy、stereotypeをtraitへ入れないauthoring policy。
- character embeddingからunrelated identityを推定できないablation/privacy評価。
- reaction stateが相手へ直接漏れず、成立した発話・行動だけがperceptionへ戻る保証。
- low reliability時に「前state保持」「rule fallback」「neutral delta」のどれを選ぶか。

## 15. 将来の実装候補

以下は要素を見落とさないための順序候補であり、今回の実装項目でも必須実装順でもない。各要素は実装計画時に採用、代替、延期、不要を判断する。

1. sharedにserver-private conceptual schemasを追加する。
2. committed evidenceから`NormalizedExperience`を作る決定的feature builderを追加する。
3. editable `PsycheTraitProfile` generationsとnormalizerを資産世代管理へ追加する。
4. explicit reaction baseline、state updater、reason receiptを追加する。
5. dataset/evaluator artifact storeとoffline exportを追加する。
6. offline trainerとONNX artifact validationを追加する。
7. shadow inferenceと管理者向け比較表示を追加する。
8. owner-approved model registry/current pointerとlimited rolloutを追加する。

実装時には、現在の`CharacterDeepPsycheSchema`を即時置換せず、legacy natural-language state、numeric reaction state、consumer projectionのmigrationを別々に設計する。既存battleへ現在のtrait/modelを推測補完してはならない。

## 16. 既存設計との整合性と衝突

### 整合する点

- observer-relative perceptionを唯一のcharacter experience入口とする点は`battle-perception.md`と一致する。
- private conclusionをpublic DTOへ出さず、canonical mechanicsをserverが所有する点は`battle-semantic-state.md`と一致する。
- consumer contextを統合しない点、psyche-only normalized embedding、shadow-first、generation bindingはADR-0004と一致する。
- active battleがbound generationsを維持する点はADR-0003と一致する。

### 移行が必要な点

- 現行コメントではdeep-psyche LLMだけが`CharacterDeepPsyche`を更新する。軽量policy採用時はauthority記述とschema migrationが必要。
- 現行deep-psyche callはprivate deltaと`CharacterExpressionBrief`を同時生成する。本設計のreaction-only責務とは一致せず、意図・expression briefの独立ownerが必要。
- 現行psyche/relationshipは自由記述中心であり、numeric stateとrelationship authorityがない。
- 現行`TurnObservationPacket`はobserver-safeだが、NN入力に必要なtyped normalized impactを保証しない。
- 現行`confidence`はcharacter self-confidenceであり、model reliabilityとは別物である。
- 現在のbattle asset baselineは完全`CharacterSheet`を埋め込む暫定形で、`PsycheTraitProfile` generationは未実装である。

これらは本書で推測補完せず、Phase 0のdecisionと将来のschema/API/migration設計に残す。
