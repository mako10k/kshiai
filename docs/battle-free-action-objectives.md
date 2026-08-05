# 価値駆動の自由行動と遅延オブジェクト昇格

作成日: 2026-08-05
対象: `D29`, `F-BTL-58`〜`F-BTL-71`

## 1. 目的

通常の勝利を既定目的として残しながら、キャラクタープロフィールに記された価値観、
関係性、ためらい、約束等によって目的の優先順位を変えられるようにする。キャラは毎ターン、
攻撃だけでなく、相手や場面の状態を変える自然文の`free_action`、物体の取得・準備、
拘束・遮蔽・位置取り等を含めて一つの行動を選ぶ。

自由な語彙を有限の「技名」へ列挙しない。LLMは自然文の意図、参照対象、望む変化、
成立根拠を汎用構造として提案する。サーバーは、正準状態、プロフィール、知覚境界、
汎用world operation、保護対象、効果上限から提案を検証し、最終結果だけを確定する。

### 1.1 2026-08-05 vertical slice実装状況

今日中に効果確認できる最小縦断として、次を実装済みとする。

- `free_action`を第6の1ターン行動として共有schema、実行可能行動、Agent出力へ接続
- observer別の認知・affordanceから行動意図を作り、server-only正準rootから成否を調停
- 通常ターンは追加LLM 0回、自由行動があるターンだけ両Sideをまとめて最大1回
- appearance、equipment、battlefield、semantic entity、既存characterへのroot binding
- 幻覚だけのobjectは生成せず、「認知は石・現実はボール」を別状態として保持
- object昇格と操作成否を分離し、操作失敗時にも妥当なobjectだけを元位置で昇格可能
- 同じ正準entity IDを維持したappend-onlyな段階的具体化
- 相手・自己への有界な姿勢、拘束、露出変更と、objectの配置・cover変更
- 保持・着用・usableを再検証した`instrumentRef`による後続の通常攻撃・防御補正
- profile生成・会話調整に同梱する非公開`DecisionProfile`と、価値・戦術・機会を受け取るAgent
- receipt、world transition、turn eventへの有界な結果記録
- profile由来objectの現在配置から、永続profileを書き換えない`currentStateOverrides`と、
  視点別・ID非公開の`sceneStateFacts`を同時に導出

このvertical sliceでは、自由行動のworld変更は当該ターンの数値解決後にcommitされ、
次ターン以降へ効く。以下は完全受け入れ前の残作業であり、現在の実装済み範囲と混同しない。

- 先行する自由行動を同一ターンの後続initiative bucketへ即時反映する分割実行
- 同時に同じ未昇格objectを争った場合の「一度だけ昇格、操作だけcontested」
- `partial`、検証済み失敗penalty、pair relation・area stateを含む変更pathの拡張
- latent affordance/promotion registryと調停proposalを含む完全な永続replay
- 1〜3ターン`ActivePlan`の永続化と機械的`ConsequenceGuard`
- 派生物の生成、着脱・投擲・遮蔽等を含む追加の受け入れfixture

## 2. 設計ロック

1. 各キャラの既定目的は「対戦に勝つ」だが、絶対命令ではない。
2. プロフィール由来の価値優先順位は、勝利より人情、安全、約束等を優先できる。
3. 勝敗条件、レーティング、HP・MP・能力値、戦闘不能は価値観や自然文から変更しない。
4. `free_action`は通常ターンの1行動を消費する。成立失敗後に別行動を追加実行しない。
5. 自然文は試みであり、成功事実ではない。キャラAgent、調停LLM、ナレータは結果を確定しない。
6. LLM提案は汎用構造を優先し、行動動詞の大規模enumは作らない。
7. enumは、権限境界、有限結果、保護対象、決定的fallbackに必要な最小集合だけにする。
8. 正準objectは必要になった時点で遅延昇格できる。行動文だけを存在根拠にしない。
9. 正準worldStateの変更は、確定eventに結び付いた検証済みの原子的transitionだけで行う。
10. 公開ナレーション、表示用話者ラベル、observer-localな幻覚・誤認からobjectを昇格しない。
11. profile本文と戦場説明は履歴・初期設定として不変に保ち、現在の着用・装備・所在は
    正準worldStateから一時projectionとして上書きする。

## 3. 権限分離

| 段階 | 所有者 | 入力 | 出力・権限 |
|---|---|---|---|
| 価値抽出 | キャラ生成・調整LLM + サーバー | 正準プロフィール、ユーザーによる調整 | 自然文principle候補。サーバーが上限・ID・由来を検証してプロフィールへ保存 |
| 戦闘用凍結 | サーバー | 正準プロフィール、選択policy、対峙context | battle-scopedな`DecisionProfile`。公開文や相手の非公開情報を使わない |
| 計画・選択 | 各キャラAgent | 自己プロフィール、凍結価値、私的継続状態、observer別frame、利用可能行動 | 有界な現在目的・方針と次の1行動。結果確定権限なし |
| 自由行動調停 | server-side調停LLM | 凍結intent、正準world/semantic状態、能力anchor、根拠候補 | 汎用promotion・operation・成功/失敗候補。未確定提案のみ |
| 実行 | エンジン | 調停提案、bucket開始snapshot、因果context | 成否、競合、ペナルティ、確定event、原子的transition |
| 観測 | サーバー | 確定event、確定後worldState | observer別frameと知覚根拠 |
| 表示 | ナレータ | 視点別view、確定receipt | 表層表現のみ。計画・object・結果を正準化しない |

自由行動調停LLMは両Sideのprivate Agentとは別ロールである。server-onlyの正準状態を読めるが、
その情報をキャラのintentや認知へ戻さない。LLMが`possible`と提案しても、server validatorと
エンジンが受理しなければ状態は変化しない。

## 4. 価値優先順位と行動計画

### 4.1 `DecisionProfile`

キャラクターごとに次のbattle-scoped profileを凍結する。

```ts
type DecisionProfile = {
  defaultObjective: {
    id: "victory";
    statement: string;       // サーバー既定: この対戦に勝つ
    priority: number;        // 0..100、既定値あり
  };
  principles: Array<{
    id: string;
    statement: string;       // 例: 勝負より相手への人情を大事にする
    priority: number;        // 0..100
    force: "preference" | "commitment" | "constraint";
    guard?: ConsequenceGuard;
    provenance: string;      // profile内の正準な由来
  }>;
};
```

`statement`は開いた自然文とし、価値内容をenum化しない。`force`だけは、単なる好み、
できる限り守る約束、違反してはならない制約をfallbackでも区別するために列挙する。
`victory`は削除せず、プロフィール調整でpriorityを下げられる。勝利優先度を下げても、
試合の終了条件や公式勝敗は変えない。

`guard`は`constraint`をサーバーが最低限守るための限定的な機械境界である。
価値観全体を機械分類せず、相手への直接危害の上限、不可逆な状態変更の禁止等、
エンジンが確実に検証できる保護だけを持つ。guardへ翻訳できない自然文制約は、
Agentの選択には使うが、provider失敗時のfallbackでは防御・休息・待機等の保守的行動へ落とす。

### 4.2 `ActivePlan`

キャラAgentは逐語的思考過程ではなく、次の有界な結論だけを更新する。

```ts
type ActivePlan = {
  objective: string;
  principleRefs: string[];
  approach: string;
  expectedProgress: string;
  reconsiderWhen: string[];
  horizonTurns: number; // 1..3
};
```

各ターン、Agentは既定勝利目的、価値優先順位、現在の計画、知覚できた結果、
利用可能な標準行動とscene affordanceから次行動を一つ予約する。計画は成功を事実化せず、
失敗、対象消失、距離変化、相手の苦境、価値上の衝突を観測した次のAgent更新で再計画する。

「勝負より人情」を高優先のcommitmentに持つキャラは、相手が苦境にあると知覚した場合、
追加ダメージよりも、武器を取り上げる、拘束する、距離を取る、危険物を排除する、
相手を助ける等を選択できる。これは勝利条件を変更するのではなく、勝利への手段と
価値衝突の評価を変える。

### 4.3 現在の戦術的必要性

価値profileだけでは「何を大事にするか」しか決まらない。Agentが「このまま素の攻撃を続けても
足りない」「次に無防備で同程度の衝撃を受けると危険」「一手準備してでも防具が必要」と判断する
ため、サーバーは正準mechanicsからobserver-safeな`TacticalNeedFrame`を導出する。

```ts
type QualitativeBand = "none" | "low" | "moderate" | "high" | "critical";

type CausalChannel =
  | "damage"
  | "defense"
  | "reach"
  | "control"
  | "mobility"
  | "vision"
  | "hearing"
  | "cover";

type TacticalNeedFrame = {
  survivalPressure: QualitativeBand;
  unprotectedIncomingRisk: QualitativeBand | "unknown";
  offenseAdequacy: "insufficient" | "marginal" | "adequate" | "unknown";
  defenseAdequacy: "insufficient" | "marginal" | "adequate" | "unknown";
  controlNeed: QualitativeBand;
  resourcePressure: QualitativeBand;
  timePressure: QualitativeBand;
  evidenceRefs: string[];
};
```

生HP、damage予測値、相手の未認知skillや正確な防御値は渡さない。自己のreserve、直近に知覚できた
衝撃、自己の攻撃が知覚可能な範囲で与えた効果、残りターン等から定性的に導出する。
対象へのaccessや結果知覚が不足する場合は`unknown`とし、server-onlyな相手状態から
「攻撃力不足」や「次の一撃」を断定しない。`unprotectedIncomingRisk`は相手が次に攻撃するという
予測ではなく、直近と同程度の衝撃を再び無防備で受けた場合の条件付き自己riskである。

### 4.4 潜在affordanceの知識

正準objectへのpromotionはserver内部の実装概念であり、キャラに「昇格できる」と教えない。
代わりに、キャラが現在知覚している、または自己プロフィールとして知っている物について、
observer-safeな`LatentAffordanceProjection`を渡す。

```ts
type LatentAffordanceProjection = {
  ref: string;                  // observer-localな不透明参照
  perceivedAs: string;          // 足元の小石、着ている上着等
  relation: string;             // 自分が着用、手の届く床、相手の手元等
  certainty: "clear" | "coarse" | "uncertain";
  possiblePreparations: Array<{
    description: string;        // 拾う、身に着ける、手に構える等の自然文
    setupTurns: number;
  }>;
  possibleUses: Array<{
    description: string;        // 打撃を補う、遮蔽に使う等の自然文
    compatibleActionKinds: Array<"basic_attack" | "skill" | "defend" | "free_action">;
    expectedCausalPotential: Partial<Record<CausalChannel, QualitativeBand>>;
  }>;
};
```

候補は、battle setupと各ターンの既存semantic reconciliationから同一応答内で提案できるが、
サーバーが正準profile、battlefield、semantic entity、確定eventへbindingできたものだけを
boundedなlatent affordance registryへ保存する。これは正準objectではなく、計画用の候補である。
observer projectionは、自己の服・所持品、実際に見える・触れられるscene候補だけを各Sideへ渡し、
未認知の物、他Sideだけの観測、幻覚、ナレーション由来の物を渡さない。

候補の`expectedCausalPotential`は計画用の予測であり、mechanical authorityではない。
実際にpromotion・取得・使用するときはfree-action adjudicationとengineが再検証する。

### 4.5 複数ターンの行動機会

Agentへ単体の候補だけを渡すと、「石が使える」と分かっても、取得してから攻撃するという
前提関係を安定して計画できない。サーバーは既存行動とlatent affordanceから、
observer-safeな短い`OpportunityChain`を導出する。

```ts
type OpportunityChain = {
  id: string;
  objectiveHint: string;
  prerequisites: Array<{
    kind: "free_action";
    description: string;
    subjectRef: string;
  }>;
  continuation: {
    actionKind: "basic_attack" | "skill" | "defend" | "free_action";
    instrumentRef?: string;
    description: string;
  };
  setupTurns: number;
  expectedProgress: string;
  expectedCausalPotential: Partial<Record<CausalChannel, QualitativeBand>>;
  risks: string[];
};
```

ここで列挙するのは既存action kindとエンジンが読む因果チャネルだけであり、具体的な行動動詞や
価値内容は自然文のままにする。例えば次を提示できる。

```text
足元の小石を拾う --1 turn--> basic_attackのinstrumentにする
床の板を構える --1 turn--> defendのcoverを補う
相手との距離を詰める --1 turn--> 次の接触可能なfree actionへつなぐ
```

Agentは`TacticalNeedFrame`、価値profile、setupTurns、riskを比較して選ぶ。次の無防備な衝撃が
critical相当なら、二手かかる攻撃準備より即時防御を選べる。offenseがinsufficientで時間に余裕が
あれば、小石を取得して次のbasic attackへinstrumentとして予約する計画を立てられる。
これは行動候補の提示であって成功保証ではなく、各ターンの開始snapshotで再検証する。

自由行動は未知の結果を含むため、Agent自身の`expectedProgress`は予測に留める。
正準の評価結果は実行後receiptでのみ確定する。

## 5. 自由行動intent

行動動詞を列挙せず、自然文とobserver-safeな参照を中心にする。

```ts
type FreeActionIntent = {
  kind: "free_action";
  description: string;       // 例: 素手で相手の腕をつかもうとする
  desiredOutcome?: string;   // 例: 相手の動きを止める
  subjectRefs: string[];     // 1件以上。そのAgentに開示済みの不透明参照だけ
};
```

`description`または`desiredOutcome`に「成功した」「相手を完全に無力化した」と書かれても、
それは要求された結果であって確定事実ではない。canonical entity ID、未認知対象、正確な位置、
相手の非公開状態をAgentへ渡さない。

`instrumentRef`は自由行動自身ではなく、準備済みobjectを使う後続の`basic_attack`、`skill`、
`defend`だけに付与する。`free_action`は、パラメータdamage/heal、戦闘不能、勝敗を直接発生させない。物体の取得、
配置、拘束、姿勢、露出、遮蔽、距離、場面状態等を変え、その結果が後続行動の可否・係数・
知覚へ影響することは許す。

## 6. 汎用調停提案と最小enum

調停LLMは、行動familyではなく、既存world/semantic primitiveに近い汎用proposalを返す。

```ts
type FreeActionAdjudicationProposal = {
  interpretation: string;
  feasibility: "impossible" | "possible" | "contested";
  evidenceRefs: string[];
  promotions: EntityPromotionProposal[];
  onSuccess: ProposedStateChange[];
  onFailure: ProposedStateChange[];
  causalEnvelope?: ProposedCausalEnvelope;
};
```

必要なenumは次に限定する。

- `free_action`というaction kind
- `preference / commitment / constraint`
- `impossible / possible / contested`
- `accepted / partial / failed / contested`
- promotionの有限statusとprovenance区分
- 既存のworld operation、placement、actor/object/area状態
- エンジンが実際に読める有限の因果チャネルと定性的band

「つかむ」「投げる」「脱ぐ」「開ける」等の動詞enumは作らない。LLMは望む変化を
`set_placement`、`set_pair_relation`、`set_actor_state`、`add_entity`等へ提案し、
validatorは動詞ではなく、actor authority、到達可能性、対象の存在、能力根拠、
変更前後の差、保護field、効果上限、競合を検証する。

ただし、汎用性を理由に全fieldを変更可能にしない。free actionからはHP・MP・能力値、
canFight、勝者、過去event、identity、agent private stateを編集できない。意識喪失、
完全なagency剥奪、entity消滅等の決定的変更も、専用の確定mechanicsなしには拒否する。
拘束・移動阻害等は一段階ずつの有界変更とし、相手へ作用する場合は競合解決を要求する。

## 7. 遅延オブジェクト昇格

### 7.1 根拠

操作対象がまだ正準objectでない場合、調停LLMはpromotionを提案できる。サーバーは、
次の正準根拠へbindingできる場合だけ受理する。

- キャラの正準appearance、equipment、所持品
- battlefieldの正準terrain、obstacle、condition、seed entity
- 既存semanticStateのentityまたは検証済みfact
- 過去の確定event
- 正準場面から導出できる、低価値で通常のscene affordance
- 成功した確定操作によって初めて生じる派生物

free action本文、公開ナレーション、表示専用第三者発話、private belief、幻覚、誤認だけを
根拠にしない。プロフィールの「炎のような髪」等、外見修辞を独立した炎objectへ昇格させない。

### 7.2 安定identityと重複防止

server-onlyのbounded latent affordance registryとpromotion registryに、根拠revision、
安定candidate key、計画用envelope、正準entity ID、結果を保存する。同じ帽子を
「帽子」「かぶっている物」と再表現しても一つのobjectへ結び、
同じbucketで双方が同じ潜在objectを操作した場合も、昇格を一度だけ行って操作claimを競合させる。

昇格時のobjectは根拠が示す最小性質だけを持つ。通常の帽子、小石、服を、LLMの提案だけで
防具、武器、魔法道具、鍵、回復物へ変えない。開いたsemantic factsは表示・同一性に利用できるが、
mechanicsは検証済みcausal envelopeだけを読む。

### 7.3 昇格と操作の分離

判定は次の順に行う。

1. 対象同定とpromotion可否
2. promotion後の仮snapshotを構築
3. そのsnapshotで操作可否・競合・失敗ペナルティを決定
4. promotion、成功operationまたは失敗penaltyを一つの検証済みtransitionとしてcommit

既に存在していた潜在objectは、昇格成功・操作失敗なら元配置のまま正準objectとして残す。
成功操作によって初めて生じる破片等は、元操作が失敗した場合は昇格しない。commit自体が
schema、revision、参照整合性等で失敗した場合は、部分適用せず全変更を棄却する。

## 8. 物体を武器・防具・足場として使う

物体の取得・着用・配置・準備は`free_action`で行える。直接ダメージを与える使用は、
free actionで既存damage authorityを迂回せず、次のように標準行動へ戻す。

- 攻撃: `basic_attack`または`skill` + 検証済み`instrumentRef`
- 防御: `defend`または防御skill + 検証済み`instrumentRef`
- 非damageの拘束・遮蔽・移動・操作: `free_action`

昇格または状態変化したobjectは、自由記述affordanceと、エンジンが読む小さな
`causalEnvelope`を分離して持つ。LLMは「硬く手頃な石」「幅のある板」等の適合を提案できるが、
実際のdamage、defense、reach、control、mobility、vision、hearing、cover等のチャネルと上限は
サーバーが根拠・保持状態・キャラ能力から検証し、エンジンが確定する。

即席物体は原則としてminorまたはmoderateな補正に制限する。キャラ固有の超常能力、
大きなdamage、回復、決定的な無力化は既存skill・equipment mechanicsを使う。

## 9. 時間解決と失敗

自由行動は通常actionと同じinitiative bucketへ入る。順次bucketでは、先行commit後の状態で
後続を再検証する。先に相手を拘束できれば後続行動へ作用できるが、到達不能・抵抗・状態変化で
不成立なら自由行動は失敗し、別の攻撃へ置換しない。同時bucketでは同じ開始snapshotから
proposalを評価し、同一objectの排他的取得は`contested`、一方の結果による他方の遡及取消しはしない。

失敗ペナルティはLLMが自由に確定せず、検証済み`onFailure`候補からエンジンが選ぶ。
初期実装では姿勢、露出、距離、保持物の落下、一時的な移動阻害等のworldState変更に限定し、
数値resourceの罰は専用ルールが追加されるまで発生させない。

## 10. LLM呼び出し予算

- 価値profile: キャラ生成・調整の既存応答へ同梱し、ターンごとの呼び出しを増やさない。
- latent affordance発見: battle setupと既存semantic reconciliationの応答へ同梱し、専用呼び出しを増やさない。
- 計画と行動選択: 既存のA/B Character Agent並列呼び出しへ同梱し、追加0回。
- 自由行動調停: どちらかが`free_action`を予約したターンだけ、A/Bを一つにまとめて最大1回。
- semantic reconciliation、Agent更新、narration: 既存呼び出しを維持する。
- operation、promotion、対象ごとの個別LLM呼び出しや、曖昧さを理由とした無制限retryをしない。

調停providerが全て失敗した場合、構造化根拠だけでサーバーが確定できる操作を除き、
`adjudication_unavailable`として状態を変更せず行動を消費する。provider失敗から、
都合のよい成功結果やobjectを捏造しない。

## 11. 監査receipt

turn recordには逐語的推論ではなく、次を有界に保存する。

```ts
type FreeActionResolutionReceipt = {
  actionId: string;
  intentText: string;
  activeObjective: string;
  principleRefs: string[];
  promotion: Array<{
    candidateKey: string;
    outcome: "not_needed" | "promoted" | "already_promoted" | "rejected";
    entityId: string | null;
    reason: string | null;
  }>;
  outcome: "accepted" | "partial" | "failed" | "contested";
  reason: string | null;
  committedEventIds: string[];
  worldOperationKinds: string[];
  penaltyOperationKinds: string[];
};
```

`activeObjective`と`principleRefs`は判断結論の監査用であり、chain-of-thoughtではない。
公開DTOへは、現在視点で知覚可能な確定結果だけを投影する。

## 12. 受け入れ条件

1. 価値profile未設定のlegacyキャラは、既定victory目的で現行行動を選べる。
2. 「勝負より人情」を高優先にしたfixtureが、相手の苦境を知覚したとき高damage行動以外を選べる。
3. 相手の苦境を知覚していないSideは、非公開状態だけを根拠に価値判断を変えない。
4. `free_action`は1行動を消費し、失敗後に攻撃・防御を追加実行しない。
5. 自然文がHP、勝者、identity、過去eventを変更しようとしても拒否される。
6. appearanceに根拠のある帽子は遅延昇格でき、拘束中の着脱失敗では着用状態のまま残る。
7. 行動成功で初めて生じる破片は、元行動失敗時には昇格しない。
8. ナレーションだけに登場した武器、幻覚、未認知objectは正準objectへ昇格しない。
9. 同時に同じ潜在objectを取得しようとした場合、一度だけ昇格して取得は`contested`となる。
10. 保持物による直接damageは`basic_attack`または`skill`を経由し、free actionから発生しない。
11. 石や板の攻防補正は検証済みcausal envelope内にclampされ、LLMの自由値を採用しない。
12. 通常行動だけのターンはLLM呼び出しが増えず、free actionを含むターンも追加は最大1回である。
13. provider失敗、invalid proposal、古いrevision、未確定event参照でsemantic/worldが部分commitされない。
14. deterministic replayは保存済みintent、調停proposal、engine receiptからLLM再呼び出しなしで再現できる。
15. Agentは生数値や未認知の相手能力なしに、自身の生存圧力、攻防充足度、時間圧力を定性的に判断できる。
16. 正準化前の帽子・服・小石等でも、正準根拠と現在の知覚があれば計画用affordanceとして提示できる。
17. 「小石を拾う→basic attackのinstrumentにする」のような準備と継続の連鎖を、setup turnと定性的効果付きで計画できる。
18. 次の無防備な被撃が危険なfixtureでは長い攻撃準備より即時防御を、攻撃不足かつ猶予があるfixtureではinstrument準備を選べる。
19. 帽子を脱いで床へ置くと、同じ正準objectの配置から「本人は未着用」と「帽子は場面内」の両方が導出され、かぶり直すとprofile側の一時overrideだけが消える。
20. `sceneStateFacts`は外部・全知視点では正準labelを、キャラ限定視点ではobserver-local labelだけを使い、未観測objectや「認知は石・現実はボール」の正準identityを漏らさない。
