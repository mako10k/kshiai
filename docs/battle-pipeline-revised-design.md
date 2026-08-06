# 戦闘パイプライン改訂設計

Status: design baseline (fixed)
Fixed on: 2026-08-06
Scope: battle turn pipeline, canonical state, projection, adjudication,
consistency, perception, and narration

## 0. 文書の位置づけ

この文書は、今後の戦闘パイプライン改訂に対する設計前提である。設計上の最優先品質、
責務境界、主要な型、処理順、縮退方針を固定する。

- この文書の採用は、記載された機能の実装完了、既存データの移行、release、または
  production反映を意味しない。
- 各段階が実装されるまでは、既存の `BattleState`、`worldState`、`semanticState`、
  perception、temporal resolutionの挙動を維持する。
- 既存文書と将来の戦闘パイプライン像が競合する場合、この文書を改訂目標として扱う。
  ただし、実装済み挙動の変更は対応する実装・互換性・受入れ工程を通して行う。
- この前提を変更する場合は、変更理由、影響する契約、LLM呼び出し予算、移行方法、
  受入れ条件を明記して本文と実装計画を同時に更新する。

既存資産からは全面移行せず、最初は次のadapter境界を置く。

```text
既存BattleState
    ↓ adapter
Canonical Graph View
    ↓ purpose-specific projection
既存consumer / 新pipeline stage
```

既存の次の権限境界は継承する。

- `worldState` と検証済み `semanticState` はserver側の正準入力である。
- observer別perceptionは正準世界の全量ではなく、対応observerに許された局所状態である。
- character agentは観測可能状態と自己状態から意図・行動を提案し、成功を確定しない。
- narratorは確定結果を表現するだけで、状態、因果、時間順序、勝敗、意図、発話を変更しない。
- 公開ナレーションをmechanics、character cognition、adjudicationへfeedbackしない。
- XAIをprimary、OpenAIをordered operational fallbackとする既存provider順位は、
  この設計の採用だけでは変更しない。

## 1. 設計目標

最優先する品質は再現性ではなく、結果の納得性である。

同じ入力から異なる結果が生じてもよい。ただし、利用時点で必要となる範囲について、
次との矛盾を可能な限り解消する。

- 世界観と世界ルール
- 現在採用されている正準事実
- 正準オブジェクトの状態・関係
- キャラクターの認知
- キャラクターの心理・経験・意図
- 行動の前提条件
- アクションとエフェクトの因果関係
- 環境変化と世界過程
- 同時行動の時間関係

正準状態は「完全に無矛盾な世界」ではない。

> 正準状態とは、現時点で公式状態として採用されている事実集合であり、
> 未発見の矛盾を含み得る。

## 2. 中核原則

### 2.1 LLM呼び出しは少なくする

通常ターンの必須LLM呼び出しは、原則として次の3回に限定する。

```text
キャラクターA判断
キャラクターB判断
ナレーション
```

A/B判断は独立したobserver sliceから並列実行できる。追加LLMは、次のいずれかに
該当し、かつルールまたは既存の構造化情報だけでは処理できない場合に限る。

- 概要裁定では結果を決められない。
- 行動計画の詳細が結果へ影響する。
- 正準世界の未具体化状態が結果へ影響する。
- 利用時に矛盾が発見された。
- 既知の整合性issueが現在処理を妨げる。

### 2.2 コンテキストは小さくする

LLMへ正準世界全体を渡さない。用途ごとに正準グラフから次のprojectionを生成する。

```text
観測可能状態
裁定必要状態
無矛盾チェック必要状態
```

取得範囲は物理的距離だけでなく、現在の処理に対する相互作用可能性で決める。

### 2.3 完全な競合検出を目指さない

すべての暗黙的排他関係を事前にルール化せず、次の段階的検査を採る。

```text
安い早期検査
    ↓
限定差分監査
    ↓
正準commit
    ↓
利用時検査
    ↓
必要時だけ修復
```

完全な競合グラフ構築や、commit時点での世界全体の無矛盾証明は要求しない。

## 3. 正準世界モデル

正準世界を次の論理グラフとして扱う。

```text
Canonical Graph
├─ Entity graph
├─ Fact graph
├─ Temporal graph
├─ Causal graph
├─ World-process graph
├─ Consistency-issue graph
└─ Rule references
```

### 3.1 共通参照

以下の型名は概念契約である。Phase 1では既存IDとの互換aliasまたはbranded stringで
開始してよく、永続形式の分離は正準グラフ化の段階で行う。
この文書中で `unknown` としたpayloadは未設計のまま自由入力を許すという意味ではない。
Phase 1以降で用途別のstrict schema、件数上限、size上限を定義するためのplaceholderである。

```ts
type CanonicalRef = string;
type FactId = string;
type IssueId = string;
type RuleRef = string;
type ActionRef = string;
type EffectRef = string;
type ProcessRef = string;
type RepairRef = string;
type ProposalRef = string;
type StepRef = string;
type ObserverLocalRef = string;
type TemporalPoint = number;

type TemporalWindow = {
  from: TemporalPoint;
  to: TemporalPoint;
};

type ProjectionPurpose =
  | "character_decision"
  | "character_reaction"
  | "speech"
  | "adjudication"
  | "world_process"
  | "perception"
  | "narration"
  | "patch_audit";
```

### 3.2 エンティティ

独立した同一性を持つものだけをエンティティにする。

```ts
type CanonicalEntity = {
  id: CanonicalRef;
  kind:
    | "character"
    | "object"
    | "location"
    | "terrain"
    | "process";

  type: string;
  stableAttributes: Record<string, unknown>;
};
```

例は、キャラクター、武器、衣服、扉、橋、部屋、地形領域、火災、崩落過程である。
単なる一時的な状態値はエンティティにせず、factとして表現する。

### 3.3 正準事実

状態変化や関係を、有効期間と由来を持つfactとして保持する。

```ts
type FactProvenance = {
  sourceRef: ActionRef | EffectRef | ProcessRef | RepairRef | RuleRef;
  authority: string;
};

type CanonicalFact = {
  id: FactId;
  subjectRef: CanonicalRef;
  predicate: string;
  objectRef?: CanonicalRef;
  value?: unknown;
  validFrom: TemporalPoint;
  validTo?: TemporalPoint;
  provenance: FactProvenance;
};
```

例:

```text
Sword-1 held_by Character-A
Sword-1 located_in Hand-A-right
Door-1 state closed
Bridge-1 connects Zone-A Zone-B
Character-B restrained_by Rope-1
```

一つのpredicateについて潜在的に競合するfactが存在することを許容する。競合の存在は、
どちらかが自動的に非正準であることや、世界全体が利用不能であることを意味しない。

### 3.4 因果情報

```ts
type CausalLink = {
  sourceRef: ActionRef | EffectRef | ProcessRef;
  targetFactRef: FactId;
  relation: "created" | "ended" | "modified" | "triggered";
};
```

状態修復では、因果情報を主要な判断材料とする。後続結果に使われたfactを、単に
表面的な競合だけを理由に優先度なく破棄しない。

### 3.5 整合性issue

```ts
type ConsistencyIssue = {
  id: IssueId;
  involvedFactRefs: FactId[];
  involvedEntityRefs: CanonicalRef[];
  discoveredAt: {
    stage:
      | "patch_audit"
      | "planning"
      | "adjudication"
      | "world_process"
      | "perception"
      | "narration";
    turn: number;
  };
  blocksPurposes: ProjectionPurpose[];
  status: "open" | "deferred" | "resolved";
};
```

`deferred` は事実の品質ではなく、「発見済みissueの解決を現在は行わない」という
処理状態である。`open` でないことも、世界全体が無矛盾であることを意味しない。

## 4. 相互作用可能範囲

相互作用可能範囲とは、現在の観測、行動、裁定、世界変化、整合性確認において、
結果や判断へ影響し得るノード、事実、過程、ルールの集合である。

```ts
type InteractionKind =
  | "physical_contact"
  | "movement_reachability"
  | "line_of_sight"
  | "audibility"
  | "ownership_control"
  | "containment"
  | "support"
  | "causal_dependency"
  | "process_propagation"
  | "remote_targeting"
  | "communication"
  | "rule_dependency"
  | "identity_dependency";

type InteractionScope = {
  anchorRefs: CanonicalRef[];
  entityRefs: CanonicalRef[];
  factRefs: FactId[];
  processRefs: ProcessRef[];
  ruleRefs: RuleRef[];
  traversedKinds: InteractionKind[];
  temporalWindow?: TemporalWindow;
};
```

物理距離は相互作用可能性の一要素にすぎない。狙撃対象、遠隔操作装置、結界へ
接続された対象、召喚物、通信相手、支持構造、火災や煙の伝播先も、現在の目的に
影響し得るなら含める。

## 5. 三つのprojection

### 5.1 観測可能状態

キャラクター判断へ渡すobserver-localなprojectionである。

```ts
type ObservationSliceRequest = {
  observerRef: CanonicalRef;
  purpose: "character_decision" | "character_reaction" | "speech";
};

type ObservationSlice = {
  observerRef: CanonicalRef;
  purpose: ObservationSliceRequest["purpose"];
  scope: InteractionScope;
  self: unknown;
  perceivedFacts: unknown[];
  uncertainties: unknown[];
  localRefMap: Record<ObserverLocalRef, unknown>;
};
```

含めるもの:

- 自分自身の認知可能状態
- 視覚、聴覚、接触等で認識可能な対象
- 見かけ上の姿
- 認知済み対象の継続情報
- 不確実性、誤認、識別状態
- 観測可能な環境変化

含めないもの:

- 相手の心理
- 観測不能な正準状態
- 正確な隠し残量
- 未知能力
- 整合性issue
- 裁定内部情報

```text
Canonical Graph
    ↓ perception projection
Observer-local Graph
```

既存の `CharacterPerceptionFrameA/B` とprivate contact registryは、この契約を満たす
初期adapter入力または出力として利用できる。canonical IDとobserver-local refの
対応はserver-privateに保つ。

### 5.2 裁定に必要な状態

行動または世界proposalを解決するためのserver-side projectionである。

```ts
type AdjudicationSliceRequest = {
  proposalRefs: ProposalRef[];
  temporalWindow: TemporalWindow;
};

type AdjudicationSlice = {
  proposalRefs: ProposalRef[];
  temporalWindow: TemporalWindow;
  scope: InteractionScope;
  facts: CanonicalFact[];
  applicableRuleRefs: RuleRef[];
  relatedIssueRefs: IssueId[];
};
```

含めるもの:

- 行為者、対象、手段
- 位置、到達可能性、保持、装着、拘束
- 行動可能状態
- 関連する環境過程
- 同時間窓の関連proposal
- 適用可能ルール
- 関連する既知issue

正準世界全体ではなく、裁定に必要な相互作用可能範囲だけを抽出する。

### 5.3 無矛盾チェックに必要な状態

patchまたは利用予定状態と、既存事実の潜在的競合を調べるためのprojectionである。

```ts
type ConsistencySliceRequest = {
  patch?: CanonicalPatch;
  anchorRefs: CanonicalRef[];
  purpose: ProjectionPurpose;
};

type ConsistencySlice = {
  purpose: ProjectionPurpose;
  scope: InteractionScope;
  facts: CanonicalFact[];
  causalLinks: CausalLink[];
  issues: ConsistencyIssue[];
  applicableRuleRefs: RuleRef[];
};
```

含めるもの:

- 変更対象の現在有効fact
- 対象を参照する逆方向relation
- 変更によって成立性が変わるfact
- 直近の因果履歴
- 接続済みissue
- 関連する世界過程
- 少数の関連ルール

このprojectionは無矛盾を証明しない。「矛盾候補を発見しやすくするための限定的取得」
として扱う。

## 6. Character内部パイプライン

```text
Deep Psychology
    ↓
Experiential Response
    ↓
Intent Formation
    ↓
Coarse Action Proposal
```

これらは概念上分離するが、通常は一人のcharacterにつき1回のLLM呼び出しで生成する。

```ts
type DeepPsychologyUpdate = unknown;
type ExperientialResponse = unknown;
type CharacterSpeech = unknown;

type CharacterIntent = {
  objective: string;
  targetRefs: ObserverLocalRef[];
  priorities: string[];
  mustPreserve: string[];
  mustAvoid: string[];
};

type CharacterActionProposal = {
  intent: CharacterIntent;
  method: string;
  targetRefs: ObserverLocalRef[];
  instrumentRef?: ObserverLocalRef;
  fallbackPreferences?: string[];
  latentPlanHints?: {
    approachPreference?: string;
    criticalStep?: string;
    fallback?: string;
    riskTolerance?: string;
  };
};

type CharacterTurnDecision = {
  psychologyUpdate: DeepPsychologyUpdate;
  experientialResponse: ExperientialResponse;
  intent: CharacterIntent;
  proposal: CharacterActionProposal;
  speech: CharacterSpeech | null;
};
```

### 6.1 深層心理

欲求、恐怖、執着、禁忌、防衛反応、無意識的傾向、価値観などの持続的な内部状態で
あり、毎ターン全体を新規生成しない。

### 6.2 経験反応

現在の観測と過去経験を結ぶ想起、警戒、条件反射、感情、予測、衝動、誤った期待を
表す。正準事実そのものではなく、対応characterが所有するprivate stateである。

### 6.3 意図と概要行動

意図は目的、対象、優先事項、維持事項、回避事項を表す。概要行動は方法、対象、手段、
fallback preferenceと、必要時だけ展開できる少量のplan hintを返す。通常ターンでは
詳細stepを生成しない。またproposalは成功、結果、正準状態変更を確定しない。

## 7. 正準世界の能動性

正準世界は受動的な保存庫ではない。現在状態と世界ルールから環境proposalを生成する。

```ts
type EffectProposal = unknown;

type WorldTransitionProposal = {
  sourceRefs: CanonicalRef[];
  processKind:
    | "fire"
    | "collapse"
    | "flood"
    | "fall"
    | "spread"
    | "decay"
    | "machine"
    | "custom";
  triggerFacts: FactId[];
  proposedEffects: EffectProposal[];
  timing: TemporalWindow;
};
```

対象は燃焼、崩落、落下、浸水、腐食、煙の拡散、機械動作、支持喪失、地形変化、
危険領域の拡大などである。world proposal生成は原則ルールベースとし、意味的に
曖昧で、かつ現在処理に必要な場合のみLLMを利用する。

## 8. 適応的裁定

```text
Level 0: ルールによる高速裁定
    ↓ 未解決
Level 1: 概要裁定
    ↓ 曖昧
Level 2: 必要範囲だけ詳細化
```

### 8.1 Level 0: Fast Path

通常攻撃、定義済みスキル、単純な移動、防御、物を手放す、明白な環境進行は、
既存の決定的ルールで処理できる限りLLMを使わない。

### 8.2 Level 1: 概要裁定

```ts
type ExpansionReason = string;

type CoarseAdjudication =
  | {
      resolution: "direct";
      outcome: "success" | "failure" | "partial";
      effects: EffectProposal[];
      costs: EffectProposal[];
    }
  | {
      resolution: "expand";
      actionDetailRequired: boolean;
      worldDetailRequired: boolean;
      reasons: ExpansionReason[];
    };
```

### 8.3 Level 2: 選択的詳細化

次の場合だけ実施する。

- 中間状態が結果へ影響する。
- 部分実行の停止地点が重要である。
- 同時行動が競合する。
- 未具体化状態が結果を左右する。
- 重大な不可逆効果がある。
- 世界ルールの解釈が分かれる。
- 失敗代償が実行段階に依存する。

### 8.4 Character側詳細化

```ts
type PlannedActionStep = unknown;
type PlannedBranch = unknown;
type ObservableCondition = unknown;

type CharacterActionPlan = {
  proposalRef: ProposalRef;
  steps: PlannedActionStep[];
  branches: PlannedBranch[];
  abortConditions: ObservableCondition[];
};
```

詳細計画はcharacterの認知、心理、経験、意図から生成する。裁定側はproposalにない
新しい戦術を勝手に作らない。

### 8.5 世界側詳細化

```ts
type WorldExpansionRequest = {
  anchorRefs: CanonicalRef[];
  requiredFactKinds: string[];
  purpose: ProjectionPurpose;
};
```

既存概要状態をrefineする。「未知から具体化」は許すが、「既知Aから都合のよい既知B」
への置換は許さない。具体化結果には由来を付け、既知factとの関係を監査できるようにする。

## 9. 部分実行と失敗代償

詳細行動が必要な場合は最長成立接頭辞を求める。

```text
Step 1 成立
Step 2 成立
Step 3 失敗
Step 4 未実行
```

成立した不可逆効果は残す。

```ts
type CanonicalEffect = unknown;

type ActionExecutionReceipt = {
  outcome: "completed" | "partial" | "attempted_failed" | "rejected";
  completedSteps: StepRef[];
  failedStep?: StepRef;
  effects: CanonicalEffect[];
  costs: CanonicalEffect[];
};
```

失敗代償には、位置・姿勢変化、スタミナ・MP・弾薬消費、クールダウン、耐久低下、
露見、音、行動機会消費、新しい認知などがあり得る。代償は罰として任意に追加せず、
成立した実行過程または明示ルールから導く。

## 10. 効果差分

裁定器やLLMは完成後の世界全体を返さず、限定差分を返す。

```ts
type CanonicalAssertion = Omit<CanonicalFact, "id"> & { id?: FactId };

type CanonicalPatch = {
  sourceRef: ActionRef | ProcessRef | RepairRef;
  assertions: CanonicalAssertion[];
  retractions: FactId[];
  touchedRefs: CanonicalRef[];
};
```

例:

```text
Aがロープを切る

retract:
  restraint(A, Rope-1)
  Rope-1 integrity intact

assert:
  Rope-1 integrity severed
```

既存のmechanical effect、semantic patch、free-action result、world transitionは、
移行中はそれぞれの権限を保ったまま `CanonicalPatch` へ変換する。変換後のpatchから
元のsubsystemへ権限外の変更を逆流させない。

## 11. 早期差分監査

### 11.1 コード検査

すべてのpatchに対し、次を決定的に検査する。

- schema
- 参照先の存在
- patch内部の直接矛盾
- 既知の単純禁止状態
- retract対象の存在
- 明白な因果欠落

問題がなければLLM監査を呼ばない。

### 11.2 LLM差分監査

次の場合だけ呼ぶ。

- 複数オブジェクトを自由記述由来の内容で変更する。
- 未具体化関係を確定する。
- 重大または不可逆な変更である。
- 既存issueに接続する。
- 同一対象へ相反する主張がある。
- コード検査で判断不能である。

入力は `patch + interaction scope内の既存fact + 直近因果履歴 + 関連issue + 少数ルール`
に限定する。

```ts
type PatchAuditResult = {
  verdict: "no_issue_found" | "issue_found" | "indeterminate";
  checkedScope: {
    factRefs: FactId[];
    ruleRefs: RuleRef[];
  };
  issues: ConsistencyIssue[];
};
```

`no_issue_found` は「調べた範囲で問題を検出しなかった」という意味だけを持つ。
`indeterminate` を無条件の成功へ変換しない。

## 12. 正準commit

patch監査後、正準状態へcommitする。

```text
Canonical commit
= 現在の公式状態として採用
≠ 世界全体との完全整合性を証明
```

commitはfact validityを更新し、必要なcausal linkとissueを追加する。既知の未解決問題は
削除せずissueとして保持する。commitのatomicity、revision check、idempotency境界は
既存の原子的transition契約を後退させない。

## 13. 利用時整合化

状態を利用するたびに、用途ごとのinteraction scopeを取得する。

```text
Projection request
    ↓
interaction slice
    ↓
既知issue取得
    ↓
軽量整合性検査
    ↓
使用可能 / 修復必要
```

`deferred` issueだけを検査対象にしない。非defer状態にも未発見矛盾があり得るため、
利用slice全体を軽量検査する。

```ts
type CanonicalReadResult<T> = {
  value: T;
  consistency: {
    level: "unchecked" | "locally_coherent" | "conflicted" | "repaired";
    checkedFactRefs: FactId[];
    unresolvedIssueRefs: IssueId[];
  };
};
```

`locally_coherent` は「今回の利用目的に必要な範囲では、使用可能な一貫した解釈が
得られた」という意味であり、世界全体の無矛盾を意味しない。

## 14. LLMによる矛盾発見

どのLLMも、与えられたslice内の矛盾を報告できる。

```ts
type ConsistencyAlert = {
  reporter:
    | "character_agent"
    | "adjudicator"
    | "world_evaluator"
    | "narrator";
  involvedRefs: CanonicalRef[];
  conflictingClaims: FactId[];
  blocking: boolean;
  explanation: string;
};
```

LLMは直接正準状態を変更しない。alertは構造検証後にissueとして登録し、現在処理を
妨げる場合だけ修復器へ渡す。非blocking alertは、現在の結果を無条件に巻き戻さない。

## 15. 影響範囲限定修復

```ts
type ConsistencyRepairResult =
  | {
      strategy: "select";
      retainedFacts: FactId[];
      retractedFacts: FactId[];
    }
  | {
      strategy: "reinterpret";
      newFacts: CanonicalFact[];
      retractedFacts: FactId[];
    }
  | {
      strategy: "intermediate_state";
      newFacts: CanonicalFact[];
    }
  | {
      strategy: "weaken_claim";
      newFacts: CanonicalFact[];
    }
  | {
      strategy: "reset_unknown";
      retractedFacts: FactId[];
      unknownFact: CanonicalFact;
    };
```

修復優先順位は次のとおりとする。

1. 後続の因果的に強い事実
2. より権威の強い由来
3. 両立可能な中間状態
4. より弱い主張
5. `unknown` への縮退

例:

```text
Aが剣を保持
剣は床上

修復候補:
  Aが落としかけている
  Aと床の間で保持状態不安定
  剣はAの直近、保持状態不明
```

過去ログの表示文章を必ず書き換える必要はない。現在状態を整合側へ収束させる。
修復結果は `RepairRef` をsourceとする通常のpatchとして監査・commitする。

## 16. Character認知更新

canonical commit後に観測可能projectionを生成する。

```text
Canonical Effects
    ↓
Sensory Evidence
    ↓
Observer Projection
    ↓
Observer-local Facts
```

characterは公開ナレーションではなく、観測可能factから学習する。A/Bのprojectionは
同一のcommit済み正準状態を基準にし、private continuityはobserverごとに分離する。

## 17. ナレーション

ナレーションは最後に生成する。

```text
確定した結果
＋ 公開可能な観測
＋ 実際の発話
＋ 表示スタイル
```

narratorは次を変更しない。

- 正準状態
- 勝敗
- 行動成立範囲
- 時間順序
- character意図
- 正準発話
- 認知状態

narratorが矛盾を見つけた場合は `ConsistencyAlert` を返す。blockingであれば限定修復と
slice再生成後にナレーションを再生成できるが、narrator自身はrepair patchを作らず、
確定済みの勝敗や時間順序を表現都合で変更しない。

## 18. 改訂後の1ターンフロー

```text
1. Canonical Graphから現在状態を読込

2. active world processをルール評価
   → WorldTransitionProposal生成

3. A/B向けObservation Slice生成

4. A/B Character LLMを並列実行
   → psychology update
   → experience response
   → intent
   → coarse proposal
   → speech

5. Character ProposalとWorld Proposalを時間窓へ配置

6. Level 0 Fast Path
   → 単純proposalを処理

7. Level 1 Coarse Adjudication
   → success / failure / partial / expand

8. 必要なproposalだけLevel 2へ
   ├─ Character Action Plan詳細化
   └─ Canonical World局所具体化

9. Action / World Execution Result生成

10. CanonicalPatch生成

11. コードによる軽量差分監査

12. リスク時のみPatch Audit LLM
    → no_issue_found / issue_found / indeterminate

13. Canonical Graphへcommit
    → fact validity更新
    → causal link追加
    → issue追加

14. 後続利用に必要なAdjudication / Observation Sliceを生成

15. 利用sliceの軽量整合性検査

16. 矛盾が現在処理を妨げる場合
    → Consistency Repair
    → Repair Patch commit
    → slice再生成

17. Observer Projection更新

18. Character experience / memory更新

19. Narration View生成

20. Narrator LLM

21. 必要ならNarrator ConsistencyAlert処理

22. 非公開状態保存・公開DTO送信
```

## 19. LLM呼び出し予算

```ts
type TurnLlmBudget = {
  requiredCharacterCalls: 2;
  requiredNarratorCalls: 1;
  maxCoarseAdjudicationCalls: number;
  maxPlanningExpansionCalls: number;
  maxWorldExpansionCalls: number;
  maxConsistencyRepairCalls: number;
  maxFactsPerCall: number;
};
```

予算はturn開始時に確定し、各追加callをpurpose別に計上する。同じpurposeのblind retryで
上限を超えない。予算超過時は次の順で情報量と断定を縮退する。

```text
詳細化
    ↓
中間状態
    ↓
弱い主張
    ↓
unknown
```

無理に勝敗や排他状態を確定しない。ただし、既存の機械的terminal ruleが既に勝敗を
確定している場合は、それをLLM予算不足によってunknownへ戻さない。

## 20. Projection Service

正準グラフを直接LLMへ渡さない。次を主要境界とする。

```ts
interface CanonicalProjectionService {
  buildObservationSlice(
    request: ObservationSliceRequest,
  ): ObservationSlice;

  buildAdjudicationSlice(
    request: AdjudicationSliceRequest,
  ): AdjudicationSlice;

  buildConsistencySlice(
    request: ConsistencySliceRequest,
  ): ConsistencySlice;
}
```

各methodは取得scopeと参照件数を監査可能にし、purposeに不要なprivate fact、raw resource、
canonical identity、issue内部説明をconsumerへ渡さない。

## 21. 推奨モジュール構成

```text
battle/
  application/
    battle-turn-pipeline.ts
    llm-budget.ts

  canonical/
    canonical-graph.ts
    canonical-facts.ts
    canonical-patch.ts
    canonical-commit.ts
    fact-validity.ts

  projection/
    interaction-scope.ts
    observation-projection.ts
    adjudication-projection.ts
    consistency-projection.ts

  character/
    psychology.ts
    experience-response.ts
    intent.ts
    coarse-proposal.ts
    detailed-planning.ts

  world/
    world-process.ts
    world-proposal.ts
    world-concretization.ts

  adjudication/
    fast-path.ts
    coarse-adjudicator.ts
    expansion-router.ts
    detailed-adjudicator.ts
    temporal-resolution.ts

  consistency/
    patch-audit.ts
    consistency-issue.ts
    consistency-alert.ts
    consistency-repair.ts

  perception/
    sensory-evidence.ts
    observer-facts.ts

  narration/
    narration-view.ts
    narrator.ts
```

実際の配置はnpm workspace境界に従う。domain-neutralなschema、DTO、決定的処理は
`packages/shared/src/`、provider呼び出し、永続化、turn orchestrationは `backend/src/`
に置く。上記は責務の論理構造であり、同名directoryへの一括移動を要求しない。

## 22. 実装順序

この順序は、最初から完成実装を約束するものではない。実装計画では各phaseを
`baseline固定 -> 最小PoC -> 比較評価 -> 継続判断` として扱う。権限、privacy、atomicity等の
hard invariantはpass/failで判定する一方、結果の納得性、局所整合性、因果追跡性はproxy評価で
あり、最終結果の客観的正しさを証明しない。評価が `supported` 以外なら後続施策へ自動進行せず、
`revise`、`unsupported`、`indeterminate` の理由を保持して再計画する。

### Phase 1: Projection契約

最初に `InteractionScope`、`ObservationSlice`、`AdjudicationSlice`、
`ConsistencySlice` を定義する。現在の `BattleState` から一時的に生成してよい。

### Phase 2: CanonicalPatch

既存のmechanical、semantic、free-action、world transitionの更新結果を限定差分へ変換する。

### Phase 3: ConsistencyIssue

issue登録、defer、resolve、blocking purposeを導入する。

### Phase 4: 利用時整合性検査

裁定、観測、world processの入力sliceに対し、既知issue取得、軽量矛盾検査、必要時修復を
導入する。

### Phase 5: 正準グラフ化

既存JSONを直ちに全面移行せず、`BattleState -> adapter -> Canonical Graph View` から始める。
その後、fact、issue、causal linkを順次独立保存する。

### Phase 6: Adaptive Adjudication

既存処理を `fast`、`coarse`、`expanded` へ分類し、必要なproposalだけを詳細化する。

### Phase 7: World Processの統合

環境変化をcharacter proposalと同じ時間窓へ載せ、同じexecution、patch、audit、commitの
経路を通す。

各phaseのPoC仮説、評価指標、依存関係、継続判断は
[`battle-pipeline-revision.pert`](battle-pipeline-revision.pert) で管理する。

## 23. 最終原則

> 正準世界は完全無矛盾である必要はない。

> 正準世界は、利用目的ごとに相互作用可能範囲を抽出できなければならない。

> 観測・裁定・整合性確認は、それぞれ異なるprojectionを使う。

> LLMは必要なときだけ、小さなprojectionを受け取る。

> 差分は早期に軽量監査するが、完全な競合検出は要求しない。

> deferは既知issueの処理状態であり、非deferは全体無矛盾を意味しない。

> 矛盾は利用時にも検出し、現在処理を妨げる場合だけ影響範囲を限定して修復する。

> 修復不能なら、中間状態、弱い主張、unknownへ縮退する。

> 正準グラフは、観測可能状態、裁定必要状態、無矛盾チェック必要状態を小さく
> 取り出すために存在する。
