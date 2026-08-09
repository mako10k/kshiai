import {
  CATEGORY_LABELS,
  SYSTEM_PRESET_SEEDS,
  BattlefieldSemanticSeedSchema,
  clampCoefficientMap,
  composeNarratorTurn,
  canonicalSelfReference,
  defaultParameters,
  defaultRecord,
  type BattlefieldInstance,
  type BattlefieldPreset,
  type BattleSemanticState,
  type SemanticObservationState,
  type BattlePolicyOption,
  type BattleEncounterProposal,
  type CharacterSheet,
  type CharacterIdentity,
} from "@kshiai/shared";
import type {
  AdjustBattlefieldResult,
  AdjustCharacterResult,
  AnalyzeCharacterImprovementInput,
  AnalyzeCharacterImprovementResult,
  GenerateBattlefieldResult,
  GenerateCharacterResult,
  GenerateCharacterInput,
  GenerateImprovementPromptInput,
  GenerateImprovementPromptResult,
  JudgmentNarrationResult,
  LlmProvider,
  NarrationResult,
  RefereeResult,
  RefereeTurnFact,
  SituationProposal,
} from "./types.js";
import { newId } from "../id.js";
import { makeUniqueCharacterName } from "../character-name-uniqueness.js";

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  readonly models = { engine: "mock-v1", fast: "mock-v1" };

  async generateCharacter(input: GenerateCharacterInput): Promise<GenerateCharacterResult> {
    const prompt = input.prompt;
    const displayName = makeUniqueCharacterName(
      prompt.trim().slice(0, 24) || "無名の挑戦者",
      [...(input.reservedNames ?? []), ...(input.rejectedNames ?? [])],
    );
    const sheet: GenerateCharacterResult["sheet"] = {
      displayName,
      identity: {
        realName: displayName === "無名の挑戦者" ? null : displayName,
        nicknames: [],
        selfNames: [],
        epithets: [],
        gender: null,
        age: null,
      },
      tags: ["mock", "generated"],
      appearance: {
        summary: `${displayName}らしさが伝わる、依頼内容に沿った外見。`,
        visualPrompt: `anime character portrait bust, detailed face, ${displayName}, ${prompt.slice(0, 180)}, expressive eyes, soft lighting, single character, no text`,
        imageUrl: null,
      },
      traits: ["不屈", "機知"],
      parameters: defaultParameters(),
      basicAttack: {
        name: "自分らしい働きかけ",
        description: "得意なやり方で相手の集中と持久力を揺さぶる。",
        targetParameter: "stamina",
        scalingParameter: "atk",
        resistanceParameter: "def",
        power: 0.75,
        element: "personal",
        constraints: {
          reach: "same_area",
          requiresSight: false,
          mobility: "limited",
          requiresSpeech: false,
          requiresUsableHeldObject: false,
        },
      },
      skills: [
        {
          id: newId("sk"),
          name: "先手のひらめき",
          description: "自分らしい発想で場の流れを引き寄せる",
          costMp: 0,
          costStamina: 8,
          power: 1.3,
          kind: "attack",
          element: "personal",
          constraints: {
            reach: "same_area",
            requiresSight: false,
            mobility: "limited",
            requiresSpeech: false,
            requiresUsableHeldObject: false,
          },
        },
        {
          id: newId("sk"),
          name: "ペース調整",
          description: "無理をせず、自分の調子を整える",
          costMp: 5,
          costStamina: 0,
          power: 1,
          kind: "defend",
          effects: [
            { target: "self", parameter: "def", delta: 4 },
            { target: "self", parameter: "spd", delta: -2 },
          ],
          constraints: {
            reach: "same_area",
            requiresSight: false,
            mobility: "none",
            requiresSpeech: false,
            requiresUsableHeldObject: false,
          },
        },
        {
          id: newId("sk"),
          name: "気分転換",
          description: "気持ちを切り替えて状態を持ち直す",
          costMp: 10,
          costStamina: 0,
          power: 1.1,
          kind: "support",
          constraints: {
            reach: "same_area",
            requiresSight: false,
            mobility: "none",
            requiresSpeech: false,
            requiresUsableHeldObject: false,
          },
        },
      ],
      weapon: null,
      armor: {
        name: "いつもの装い",
        description: "そのキャラクターが落ち着ける装い",
        atkBonus: 0,
        defBonus: 2,
        magBonus: 0,
        effects: [{ parameter: "spd", delta: -1 }],
      },
      combatFlags: { canFight: true, irreversibleIncapacitated: false },
      narrativeBlurb: `${prompt.slice(0, 160)}という依頼をもとに作られた、${displayName}という挑戦者。`,
      record: defaultRecord(),
      deletedAt: null,
    };

    return {
      sheet,
      assistantMessage: `了解しました。${displayName} として整えました。対決の方法は元の依頼のジャンルに合わせています。さらに変えたい点があれば自然文でどうぞ。`,
    };
  }

  async inferCharacterIdentity(current: CharacterSheet): Promise<CharacterIdentity> {
    return {
      realName: null,
      nicknames: [current.displayName],
      selfNames: [],
      epithets: [],
      gender: null,
      age: null,
    };
  }

  async adjustCharacter(
    current: CharacterSheet,
    userMessage: string,
  ): Promise<AdjustCharacterResult> {
    const changesDecisionPriority =
      /優先|最優先|勝負より|勝利より|人情|傷つけたく|守りたい|救いたい/.test(
        userMessage,
      );
    return {
      sheetPatch: {
        narrativeBlurb: `${current.narrativeBlurb}\n（調整: ${userMessage.slice(0, 80)}）`,
        ...(changesDecisionPriority
          ? {
              decisionProfile: {
                defaultObjective: {
                  id: "victory" as const,
                  statement: "この対戦に勝つ",
                  priority: 70,
                },
                principles: [{
                  id: "user.priority.1",
                  statement: userMessage.slice(0, 240),
                  priority: 90,
                  force: "commitment" as const,
                }],
              },
            }
          : {}),
      },
      assistantMessage: `モック環境のため、依頼文をプロフィール注記へ反映しました。`,
    };
  }

  async prepareBattleEncounter(input: {
    sideA: {
      displayName: string;
      nicknames: string[];
      selfNames: string[];
      epithets: string[];
      traits: string[];
      narrativeBlurb: string;
    };
    sideB: {
      displayName: string;
      nicknames: string[];
      selfNames: string[];
      epithets: string[];
      traits: string[];
      narrativeBlurb: string;
    };
    field: {
      displayName: string;
      scene: string;
      terrain?: string;
      conditions: string[];
      narrativeSetup: string;
    };
    priorMatchSummary?: string | null;
  }): Promise<BattleEncounterProposal> {
    const labelA = input.sideA.nicknames[0] ?? input.sideA.displayName;
    const labelB = input.sideB.nicknames[0] ?? input.sideB.displayName;
    const relationship = input.priorMatchSummary
      ? "以前の対戦を知る相手"
      : "今回対峙する相手";
    return {
      participants: {
        a: { battleLabel: labelA },
        b: { battleLabel: labelB },
      },
      social: {
        a: {
          relationshipLabel: relationship,
          counterpartAddress: labelB,
          selfReference: input.sideA.selfNames[0] ?? null,
        },
        b: {
          relationshipLabel: relationship,
          counterpartAddress: labelA,
          selfReference: input.sideB.selfNames[0] ?? null,
        },
      },
      openingSummary: `${input.field.displayName}で、${labelA}と${labelB}が互いを認識して対峙する。`,
    };
  }

  async adjudicateFreeActions(
    input: Parameters<LlmProvider["adjudicateFreeActions"]>[0],
  ): ReturnType<LlmProvider["adjudicateFreeActions"]> {
    return {
      proposals: input.intents.map(({ actorSide, intent, perceivedAffordances }) => {
        const requestedRef = intent.subjectRefs?.[0] ?? null;
        const root = requestedRef
          ? input.canonicalRoots.find((candidate) => candidate.ref === requestedRef)
          : null;
        const perceived = requestedRef
          ? perceivedAffordances.find((candidate) => candidate.ref === requestedRef)
          : null;
        if (!root) {
          return {
            actorSide,
            outcome: "impossible" as const,
            interpretation: intent.description ?? "対象へ働きかける",
            changes: [],
            successSummary: `${intent.description ?? "試み"}が成立した。`,
            failureSummary: "認識していた対象は、現実の対象へ結び付かなかった。",
          };
        }
        const isCharacter = root.rootKind === "character";
        const distance = root.canonicalAccessByActor?.[actorSide];
        const outOfReach = ["far", "separate_area", "out_of_scene"].includes(
          distance ?? "out_of_scene",
        );
        return {
          actorSide,
          outcome: outOfReach ? "impossible" as const : "possible" as const,
          interpretation: intent.description ?? `${perceived?.perceivedAs ?? "対象"}を扱う`,
          subject: {
            rootRef: root.ref,
            candidateKey: root.ref.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80),
            canonicalLabel: root.canonicalLabel,
            description: root.description,
            portable: !isCharacter,
            usable: !isCharacter,
            knownOpenAspects: root.canonicalLabel ? [] : ["identity"],
            causalEnvelope:
              perceived?.possibleUses[0]?.expectedCausalPotential ?? {},
          },
          changes: outOfReach
            ? []
            : isCharacter
            ? [{
                target: "subject" as const,
                path: "/actorState/restraint",
                value: "partially_restrained",
              }]
            : [{
                target: "subject" as const,
                path: "/placement",
                value: { type: "held", holderId: `character.${actorSide}` },
              }],
          successSummary: isCharacter
            ? `${perceived?.perceivedAs ?? "相手"}へ現実的な範囲で働きかけた。`
            : `${perceived?.perceivedAs ?? root.canonicalLabel ?? "対象"}を手に取った。`,
          failureSummary: outOfReach
            ? `${perceived?.perceivedAs ?? "対象"}へ手を伸ばしたが、距離があり届かなかった。`
            : `${perceived?.perceivedAs ?? "対象"}へ手を伸ばしたが、扱えなかった。`,
        };
      }),
    };
  }

  async generateBattlefieldPreset(input: {
    prompt: string;
    category?: BattlefieldPreset["category"];
  }): Promise<GenerateBattlefieldResult> {
    const cat = input.category ?? "custom";
    const label = CATEGORY_LABELS[cat] ?? "戦場";
    const displayName = input.prompt.trim().slice(0, 24) || `${label}の一角`;
    return {
      preset: {
        displayName,
        category: cat,
        tags: ["generated", label],
        appearance: {
          summary: `${displayName} — ${input.prompt.slice(0, 100)}`,
          visualPrompt: `battlefield landscape, ${label}, ${input.prompt.slice(0, 160)}, anime`,
          imageUrl: null,
        },
        terrainHints: ["起伏", "足場", "見通し"],
        obstacleHints: ["瓦礫", "遮蔽物"],
        conditionHints: ["風", "光の差し込み"],
        baseCoefficients: clampCoefficientMap({ damage: 1, focus: 1 }),
        narrativeBlurb: `${displayName}。${input.prompt.slice(0, 140)}`,
      },
      assistantMessage: `${displayName} として戦場プリセットを整えました。地形や障害を自然文で調整できます。`,
    };
  }

  async adjustBattlefieldPreset(
    current: BattlefieldPreset,
    userMessage: string,
  ): Promise<AdjustBattlefieldResult> {
    return {
      presetPatch: {
        narrativeBlurb: `${current.narrativeBlurb}\n（調整: ${userMessage.slice(0, 80)}）`,
      },
      assistantMessage: `「${userMessage.slice(0, 40)}」を戦場に反映しました。`,
    };
  }

  async concretizeBattlefield(input: {
    preset: BattlefieldPreset | null;
    random: boolean;
  }): Promise<BattlefieldInstance> {
    let preset = input.preset;
    if (!preset || input.random) {
      const seed =
        SYSTEM_PRESET_SEEDS[Math.floor(Math.random() * SYSTEM_PRESET_SEEDS.length)]!;
      preset = {
        ...seed,
        id: "ephemeral",
        ownerUserId: null,
        isSystem: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    const detailTerrain =
      preset.terrainHints[Math.floor(Math.random() * Math.max(1, preset.terrainHints.length))] ??
      "平坦な地面";
    const obstacles = preset.obstacleHints.slice(0, 3);
    const conditions = [
      ...preset.conditionHints.slice(0, 2),
      ...(Math.random() > 0.5 ? ["風向きが不安定"] : []),
    ];
    const scene = `${preset.displayName}・${detailTerrain}`;
    const semanticSeed = BattlefieldSemanticSeedSchema.parse({
      sceneFacts: {
        terrain: detailTerrain,
        conditions,
      },
      entities: Object.fromEntries(obstacles.map((label, index) => [
        `obstacle.${index + 1}`,
        {
          kind: "object",
          label,
          location: { type: "scene", area: scene },
          active: true,
          facts: { source: "battlefield_obstacle" },
        },
      ])),
    });
    return {
      sourcePresetId: input.preset && !input.random ? input.preset.id : null,
      displayName: preset.displayName,
      category: preset.category,
      scene,
      terrain: detailTerrain,
      obstacles,
      conditions,
      coefficients: clampCoefficientMap({
        ...preset.baseCoefficients,
      }),
      narrativeSetup: `${preset.narrativeBlurb} いまは「${detailTerrain}」が主戦場で、${obstacles.join("・") || "目立った障害はなく"}、${conditions.join("・") || "静かな空気"}が支配している。`,
      semanticSeed,
      appearance: { ...preset.appearance },
    };
  }

  async proposeSituation(input: {
    scene: string;
    turn: number;
    eventsHint: string;
    battlefield?: BattlefieldInstance | null;
  }): Promise<SituationProposal> {
    const rain = input.turn % 5 === 0;
    const notes = rain
      ? "にわか雨が戦場を濡らし、足場が危うい。"
      : input.battlefield
        ? `${input.battlefield.terrain}の気配が攻防を揺さぶる。`
        : "場の空気が揺れ、互いの集中に変化をもたらす。";
    return {
      scene: input.scene,
      notes,
      coefficients: rain
        ? { damage: 0.9, wind: 1.2, fire: 0.8 }
        : { damage: 1.0 },
      tags: input.battlefield
        ? [...input.battlefield.obstacles, ...input.battlefield.conditions]
        : [],
    };
  }

  async reconcileTurnSemanticState(
    input: Parameters<LlmProvider["reconcileTurnSemanticState"]>[0],
  ): ReturnType<LlmProvider["reconcileTurnSemanticState"]> {
    const proposal = input.environmentProposal;
    return Promise.resolve({
      patch: {
        baseRevision: input.before.revision,
        turn: input.turn,
        sourceEventIds: [
          ...input.events.flatMap((event) => event.id ? [event.id] : []),
          ...(proposal ? [proposal.id] : []),
        ],
        operations: proposal
          ? [
              {
                op: "add" as const,
                path: `/entities/environment.effect.${input.turn}`,
                value: {
                  kind: "effect",
                  label: proposal.title,
                  location: {
                    type: "scene",
                    area: input.before.scene.summary,
                  },
                  active: true,
                  createdTurn: input.turn,
                  updatedTurn: input.turn,
                  facts: { summary: proposal.summary },
                },
              },
            ]
          : [],
      },
      environmentDecision: proposal
        ? { status: "accepted", reason: "field-grounded durable change" }
        : null,
      nextSituation: proposal
        ? { notes: proposal.notes, tags: proposal.tags ?? [], coefficients: {} }
        : undefined,
      worldPatchStatus: "valid",
      sensoryEvidence: [],
      sensoryEvidenceStatus: "valid",
    });
  }

  async proposeHappening(input: {
    scene: string;
    turn: number;
    sideAName: string;
    sideBName: string;
    stagnationHint: string;
    previousHappenings: Array<{ title: string; summary: string }>;
    battlefield?: BattlefieldInstance | null;
  }): Promise<{
    title: string;
    summary: string;
    notes: string;
    tags?: string[];
  }> {
    const fieldDetails = [
      input.battlefield?.terrain,
      ...(input.battlefield?.obstacles ?? []),
      ...(input.battlefield?.conditions ?? []),
    ].filter((value): value is string => Boolean(value));
    const detail = fieldDetails[
      (input.turn + input.previousHappenings.length) %
        Math.max(1, fieldDetails.length)
    ] ?? input.battlefield?.displayName ?? input.scene;
    return {
      title: `${detail.slice(0, 12)}の変化`,
      summary: `${detail}の様子が変わり、両者が新しい流れへ対応する。`,
      notes: `${detail}の変化は、どちらにも同じ条件と機会を与えている。`,
      tags: [detail.slice(0, 16)],
    };
  }

  async advanceCharacterPsyche(
    input: Parameters<LlmProvider["advanceCharacterPsyche"]>[0],
  ) {
    const counterpartLabel = input.counterpart?.displayName ??
      input.perception.counterpart.perceivedAs;
    const event = input.actionReaction.latestCommittedResult ??
      input.conversation.history.at(-1)?.text ??
      `${counterpartLabel}の気配をうかがっている。`;
    const ownReserveCritical = input.perception.reserveCues.some((cue) =>
      cue.subject.kind === "self" &&
      (cue.relativeBand === "critical" || cue.relativeBand === "empty")
    );
    const aftermath = input.phase === "aftermath";
    return {
      privateMemory: aftermath
        ? `${counterpartLabel}との対決を振り返った。${event}`.slice(0, 1200)
        : event.slice(0, 1200),
      currentGoal: input.phase === "prologue"
        ? `${counterpartLabel}との距離と出方を見極める`
        : aftermath
          ? "確定した結末を受け止める"
          : input.previous.currentGoal || `${counterpartLabel}との対決を自分らしく続ける`,
      emotion: aftermath ? "余韻" : ownReserveCritical ? "緊張" : "集中",
      beliefs: input.previous.beliefs.slice(-8),
      observations: [...input.previous.observations.slice(-7), event.slice(0, 240)],
      speechStyle: input.previous.speechStyle || "簡潔に話す",
      interior: {
        primaryEmotion: aftermath ? "余韻" : ownReserveCritical ? "緊張" : "集中",
        concealedEmotion: ownReserveCritical ? "焦り" : null,
        coreNeed: input.previous.interior?.coreNeed || "自分らしい距離と流れを守る",
        protectiveStance: ownReserveCritical ? "慎重に間合いを保つ" : "相手の出方を見極める",
        eventAppraisal: event.slice(0, 240),
        unspokenIntent: aftermath ? "" : `${counterpartLabel}の次の出方を見極める`,
        currentConcern: aftermath
          ? "確定した結末をどう受け止めるか"
          : ownReserveCritical ? "自分の余力" : "相手の次の動き",
        attitudeTowardCounterpart: input.social?.relationshipLabel ?? "対峙している",
        confidence: ownReserveCritical ? "low" as const : "steady" as const,
        relationshipTension: aftermath ? "対決後の余韻" : "対決の緊張",
        speechMode: input.actionReaction.latestCommittedResult
          ? "action_reaction" as const
          : "conversation_continuation" as const,
        speechAppraisal: {
          expectedImpact: `${counterpartLabel}の次の出方を見極める`,
          observedImpact: input.previous.lastSpeech
            ? "前の言葉の後に起きた変化を見定める"
            : "",
          nextApproach: input.previous.lastSpeech
            ? "相手の反応と状況に合わせて話し方を選び直す"
            : "まず相手の反応を測る",
        },
      },
    };
  }

  async advanceCharacterAgent(input: Parameters<LlmProvider["advanceCharacterAgent"]>[0]) {
    const selfReference = input.social?.selfReference ??
      canonicalSelfReference(input.character);
    const counterpartLabel = input.counterpart?.displayName ??
      input.perception.counterpart.perceivedAs;
    const event = [
      input.perception.self,
      input.perception.counterpart,
      ...input.perception.others,
    ].flatMap((slot) => slot.percepts).at(-1)?.phenomenon ??
      `${counterpartLabel}の気配をうかがっている。`;
    // Quiet traits get stage reactions; others speak briefly (speech never null).
    const quiet = input.character.traits.some((t) =>
      /無口|寡黙|無言|冷静|クール/.test(t),
    );
    const speech = quiet
      ? input.perception.turn === 0
        ? `（${counterpartLabel}の気配をうかがっている）`
        : "…"
      : input.perception.turn === 0
        ? selfReference
          ? `${selfReference}は、${counterpartLabel}と向き合おう。`
          : `${counterpartLabel}と向き合おう。`
        : selfReference
          ? `${selfReference}は、まだ続けられる。`
          : "まだ続けられる。";
    if (!input.decision) {
      const aftermathSpeech = quiet
        ? "…"
        : selfReference
          ? `${selfReference}は、この結末を受け止めよう。`
          : "この結末を受け止めよう。";
      return {
        state: {
          ...input.psyche,
          privateMemory: event.slice(0, 1200),
          currentGoal: "確定した結末を受け止める",
          emotion: "余韻",
          observations: [
            ...input.psyche.observations.slice(-6),
            event.slice(0, 240),
          ],
          speechStyle: input.psyche.speechStyle || "簡潔に話す",
          selfReference,
          lastSpeech: aftermathSpeech,
          interior: {
            primaryEmotion: "余韻",
            concealedEmotion: null,
            coreNeed: input.psyche.interior?.coreNeed ?? "",
            protectiveStance: input.psyche.interior?.protectiveStance ?? "",
            eventAppraisal: input.psyche.interior?.eventAppraisal ?? event.slice(0, 240),
            unspokenIntent: "",
            currentConcern: "確定した結末をどう受け止めるか",
            attitudeTowardCounterpart: input.social?.relationshipLabel ?? "対峙していた相手",
            confidence: "steady" as const,
            relationshipTension: "対決後の余韻",
            speechMode: "action_reaction" as const,
            speechAppraisal: {
              expectedImpact: "結末を自分なりに受け止める",
              observedImpact: input.psyche.lastSpeech
                ? "最後の言葉と結末を振り返っている"
                : "",
              nextApproach: "対決の余韻にふさわしい言葉を選ぶ",
            },
          },
        },
        speech: aftermathSpeech,
        proposedAction: null,
      };
    }
    const ownReserveCritical = input.perception.reserveCues.some((cue) =>
      cue.subject.kind === "self" &&
      (cue.relativeBand === "critical" || cue.relativeBand === "empty")
    );
    const shouldUseFinisher = Boolean(
      input.decision.finisher?.unlocked &&
      input.decision.finisher.remainingUses === 1 &&
      (input.counterpart?.condition === "critical" ||
        ownReserveCritical ||
        input.decision.finisher.turnsUntilMax === 0 ||
        input.decision.turnsRemaining <= 2),
    );
    const finisherAction = shouldUseFinisher
      ? input.decision.availableActions.find((action) =>
          action.kind === "skill" && action.finisherCandidate
        )
      : undefined;
    const last = input.decision.lastAction;
    const differsFromLast = (
      action: { kind: string; skillId?: string },
    ) =>
      !(
        last &&
        action.kind === last.kind &&
        (action.skillId ?? null) === (last.skillId ?? null)
      );
    const mustChange =
      input.decision.varietyPressure === "require_change" ||
      input.decision.varietyPressure === "prefer_change";
    const candidates = input.decision.availableActions.filter((action) =>
      mustChange ? differsFromLast(action) : true
    );
    const pool = candidates.length > 0
      ? candidates
      : input.decision.availableActions;
    const urgentDefense = ["high", "critical"].includes(
      input.decision.tacticalNeed?.unprotectedIncomingRisk ?? "unknown",
    );
    const readyDefense = input.decision.opportunityChains?.find((chain) =>
      chain.setupTurns === 0 && chain.continuation.actionKind === "defend"
    );
    const setupAttack = input.decision.tacticalNeed?.offenseAdequacy === "insufficient" &&
        input.decision.tacticalNeed?.timePressure !== "critical"
      ? input.decision.opportunityChains?.find((chain) =>
          chain.setupTurns > 0 && chain.continuation.actionKind === "basic_attack"
        )
      : undefined;
    const readyAttack = input.decision.opportunityChains?.find((chain) =>
      chain.setupTurns === 0 && chain.continuation.actionKind === "basic_attack"
    );
    const freeOption = pool.find((action) => action.kind === "free_action");
    const defendOption = pool.find((action) => action.kind === "defend");
    const decisionProfile = input.decision.decisionProfile;
    const overridingPrinciple = decisionProfile?.principles
      .filter((principle) =>
        principle.force !== "preference" &&
        principle.priority > decisionProfile.defaultObjective.priority
      )
      .sort((left, right) => right.priority - left.priority)[0];
    const humaneOverride = overridingPrinciple &&
      /人情|慈悲|助け|救|守|傷つけ|殺さ|勝負より|勝利より/.test(
        overridingPrinciple.statement,
      );
    const preferred = humaneOverride && defendOption
      ? defendOption
      : urgentDefense && defendOption
      ? defendOption
      : setupAttack && freeOption
        ? freeOption
        : finisherAction && differsFromLast(finisherAction)
      ? finisherAction
      : pool.find((action) => action.kind === "skill" && !action.finisherCandidate) ??
        pool.find((action) => action.kind === "basic_attack") ??
        pool.find((action) => action.kind !== "wait") ??
        pool[0]!;
    return {
      state: {
        ...input.psyche,
        privateMemory: event.slice(0, 1200),
        currentGoal: overridingPrinciple?.statement ??
          `${counterpartLabel}との対決を自分らしく続ける`,
        emotion: ownReserveCritical ? "緊張" : "集中",
        observations: [
          ...input.psyche.observations.slice(-6),
          event.slice(0, 240),
        ],
        speechStyle: input.psyche.speechStyle || "簡潔に話す",
        selfReference,
        lastSpeech: speech,
        interior: {
          primaryEmotion: ownReserveCritical ? "緊張" : "集中",
          concealedEmotion: ownReserveCritical ? "焦り" : null,
          coreNeed: input.psyche.interior?.coreNeed ?? "自分らしい距離と流れを守る",
          protectiveStance: input.psyche.interior?.protectiveStance ?? "相手の出方を見極める",
          eventAppraisal: input.psyche.interior?.eventAppraisal ?? event.slice(0, 240),
          unspokenIntent: `${counterpartLabel}との対決を自分らしく続ける`,
          currentConcern: ownReserveCritical ? "自分の余力" : "相手の次の動き",
          attitudeTowardCounterpart: input.social?.relationshipLabel ?? "対峙している",
          confidence: ownReserveCritical ? "low" as const : "steady" as const,
          relationshipTension: input.social?.relationshipLabel ?? "対決の緊張",
          speechMode: input.actionReaction.latestCommittedResult
            ? "action_reaction" as const
            : "conversation_continuation" as const,
          speechAppraisal: {
            expectedImpact: `${counterpartLabel}の次の出方を見極める`,
            observedImpact: input.psyche.lastSpeech
              ? "前の言葉の後に起きた変化を見定める"
              : "",
            nextApproach: input.psyche.lastSpeech
              ? "相手の反応と状況に合わせて話し方を選び直す"
              : "まず相手の反応を測る",
          },
        },
      },
      speech,
      proposedAction: setupAttack && preferred.kind === "free_action"
        ? {
            kind: "free_action" as const,
            description: setupAttack.prerequisites[0]?.description ??
              "使えそうな物を準備する",
            desiredOutcome: setupAttack.expectedProgress,
            subjectRefs: setupAttack.prerequisites.map((item) => item.subjectRef),
            opportunityId: setupAttack.id,
          }
        : {
            kind: preferred.kind,
            ...(preferred.skillId ? { skillId: preferred.skillId } : {}),
            ...(finisherAction && preferred.finisherCandidate
              ? { useFinisher: true }
              : {}),
            ...(urgentDefense && readyDefense && preferred.kind === "defend"
              ? { instrumentRef: readyDefense.continuation.instrumentRef }
              : !urgentDefense && readyAttack && preferred.kind === "basic_attack"
                ? { instrumentRef: readyAttack.continuation.instrumentRef }
                : {}),
          },
    };
  }

  private async emitNarratorProgress(
    lines: string[],
    onProgress?: (progress: { lines: string[]; draft?: string | null }) => void,
  ): Promise<void> {
    if (!onProgress) return;
    const acc: string[] = [];
    for (const line of lines) {
      acc.push(line);
      onProgress({ lines: [...acc], draft: null });
      await new Promise((r) => setTimeout(r, 12));
    }
  }

  async chooseNarrationFocus(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    events: { summary: string }[];
    summaryA: { emotion?: string; condition?: string };
    summaryB: { emotion?: string; condition?: string };
  }): Promise<{ focus: "self" | "foe" | "external" | "both" }> {
    if (input.summaryA.condition === "critical") return { focus: "self" };
    if (input.summaryB.condition === "critical") return { focus: "foe" };
    if (input.turn % 3 === 0) return { focus: "both" };
    return { focus: input.turn % 2 === 0 ? "self" : "foe" };
  }

  async narrateTurn(
    input: Parameters<LlmProvider["narrateTurn"]>[0],
  ): Promise<NarrationResult> {
    // Public log must stay narrator-shaped. Never dump engine event.summary or
    // raw action outcomes; compose prose through the shared narrator boundary.
    const composed = composeNarratorTurn({
      view: input.view,
      drama: input.drama,
      recentNarration: input.recentNarration,
    });
    await this.emitNarratorProgress(composed.narrator, input.onProgress);
    const speeches = (input.characterSpeeches ?? []).map((speech, index) => ({
      sourceSide: speech.side,
      speaker: speech.displayLabel ?? speech.speaker,
      text: speech.text,
      afterNarratorLine: composed.narrator.length <= 0
        ? -1
        : index === 0
          ? Math.max(0, Math.floor(composed.narrator.length / 2) - 1)
          : composed.narrator.length - 1,
    }));
    return { ...composed, speeches };
  }

  async narratePrologue(
    input: Parameters<LlmProvider["narratePrologue"]>[0],
  ): Promise<NarrationResult> {
    const place = input.battlefield?.displayName ?? input.scene;
    const styleNote = input.styleName ? `（${input.styleName}）` : "";
    const narrator = [
      `——開幕——${styleNote}`,
      ...(input.narratorContinuity?.reader.disclosedTerms ?? []),
      `${place}に、${input.sideAName} と ${input.sideBName} が向かい合う。`,
      input.battlefield?.narrativeSetup ||
        "場の空気が、両者の存在に応じてゆっくり変わっていく。",
      input.sideABlurb
        ? `${input.sideAName} — ${input.sideABlurb.slice(0, 80)}`
        : `${input.sideAName} の気配が場を支配する。`,
      input.sideBBlurb
        ? `${input.sideBName} — ${input.sideBBlurb.slice(0, 80)}`
        : `${input.sideBName} が相手の出方を静かに見つめる。`,
      input.priorMatchSummary
        ? `因縁 — ${input.priorMatchSummary}`
        : "今、両者の初めての対決が始まる。",
      input.policySummary
        ? `${input.sideAName} の心中に方針が灯る: ${input.policySummary}`
        : "",
    ].filter(Boolean);
    await this.emitNarratorProgress(narrator, input.onProgress);
    return {
      turn: 0,
      narrator,
      speeches: (input.characterSpeeches ?? []).map((speech, index) => ({
        sourceSide: speech.side,
        speaker: speech.displayLabel ?? speech.speaker,
        text: speech.text,
        afterNarratorLine: narrator.length <= 0
          ? -1
          : index === 0
            ? Math.max(0, Math.floor(narrator.length / 2) - 1)
            : narrator.length - 1,
      })),
    };
  }

  async narrateAftermath(
    input: Parameters<LlmProvider["narrateAftermath"]>[0],
  ): ReturnType<LlmProvider["narrateAftermath"]> {
    const place = input.battlefield?.displayName ?? input.scene;
    const fieldBit = input.battlefield?.conditions?.[0] || input.battlefield?.terrain;
    const styleNote = input.styleName ? `（${input.styleName}）` : "";
    const before = [
      `${place}に、対決の余韻が静かにほどけていく。`,
      fieldBit
        ? `${fieldBit}の気配が、静かに場へ残っている。`
        : `場の空気がゆっくり静まっていく。`,
    ];
    const after = [`幕は、そこで静かに下りた。${styleNote}`];
    await this.emitNarratorProgress([...before, ...after], input.onProgress);
    return {
      before,
      after,
      speeches: (input.characterSpeeches ?? []).map((speech, index) => ({
        sourceSide: speech.side,
        speaker: speech.displayLabel ?? speech.speaker,
        text: speech.text,
        afterNarratorLine: index === 0 ? 1 : before.length + after.length + 1,
      })),
    };
  }

  async narrateJudgment(input: {
    turn: number;
    scene: string;
    sideAName: string;
    sideBName: string;
    winnerSide: "a" | "b" | "draw";
    winnerName: string | null;
    adjudicationReason: string;
    recentPublicNarration: string[];
    styleInstruction?: string;
    styleName?: string;
  }): Promise<JudgmentNarrationResult> {
    void input;
    return {
      before: ["積み重ねられた働きかけを前に、場は判定を待つ静けさに包まれた。"],
      after: ["その宣告を受け、対決の余韻がゆっくりと場へ広がっていく。"],
    };
  }

  async generateNarrationStyle(prompt: string): Promise<{
    displayName: string;
    description: string;
    instruction: string;
    tags: string[];
    perspective?: "self" | "foe" | "external" | "omniscient" | "fluid";
  }> {
    return {
      displayName: prompt.slice(0, 12) || "カスタム",
      description: `「${prompt.slice(0, 40)}」風の語り`,
      instruction: `次の雰囲気・口調で語る: ${prompt}。数値は出さない。`,
      tags: ["custom", "mock"],
      perspective: /全知|群像/.test(prompt)
        ? "omniscient"
        : /主観|一人称/.test(prompt)
          ? "self"
          : /可変|カメラ/.test(prompt)
            ? "fluid"
            : "external",
    };
  }

  async generateBattlePolicies(input: {
    self: {
      displayName: string;
      traits: string[];
      skillNames: string[];
      narrativeBlurb: string;
      weaponName?: string | null;
    };
    foe?: {
      displayName: string;
      traits: string[];
      narrativeBlurb: string;
    } | null;
    field: {
      displayName: string;
      category: string;
      terrain?: string;
      obstacles?: string[];
      conditions?: string[];
      narrativeBlurb?: string;
    };
  }): Promise<{ options: BattlePolicyOption[]; rationale: string }> {
    const traits = input.self.traits.join("・") || "柔軟";

    // Three genre-neutral perspectives, each with two exclusive choices.
    const options: BattlePolicyOption[] = [
      {
        id: newId("pol"),
        perspectiveId: "initiative",
        perspectiveTitle: "働きかけ方",
        title: "自分から動く",
        when: "流れが定まる前",
        then: "先に展開を作る",
        bias: "attack",
        priority: 55,
        triggers: { earlyTurn: true },
        defaultSelected: true,
      },
      {
        id: newId("pol"),
        perspectiveId: "initiative",
        perspectiveTitle: "働きかけ方",
        title: "相手を観察",
        when: "流れが定まる前",
        then: "反応を見てから動く",
        bias: "wait",
        priority: 50,
        triggers: { earlyTurn: true },
        defaultSelected: false,
      },
      {
        id: newId("pol"),
        perspectiveId: "risk",
        perspectiveTitle: "リスクの取り方",
        title: "大胆に変える",
        when: "流れが停滞したとき",
        then: "変化を大きくする",
        bias: "attack",
        priority: 65,
        triggers: { lateTurn: true },
        defaultSelected: true,
      },
      {
        id: newId("pol"),
        perspectiveId: "risk",
        perspectiveTitle: "リスクの取り方",
        title: "慎重に保つ",
        when: "流れが停滞したとき",
        then: "崩さず機会を待つ",
        bias: "defend",
        priority: 60,
        triggers: { lateTurn: true },
        defaultSelected: false,
      },
      {
        id: newId("pol"),
        perspectiveId: "resources",
        perspectiveTitle: "力の配分",
        title: "早めに使う",
        when: "余力があるとき",
        then: "得意な力を活かす",
        bias: "support",
        priority: 45,
        triggers: { myHpAbove: 0.55 },
        defaultSelected: true,
      },
      {
        id: newId("pol"),
        perspectiveId: "resources",
        perspectiveTitle: "力の配分",
        title: "後半へ温存",
        when: "余力があるとき",
        then: "消耗を抑えて進める",
        bias: "mixed",
        priority: 40,
        triggers: { myHpAbove: 0.55 },
        defaultSelected: false,
      },
    ];

    return {
      options,
      rationale: `${input.self.displayName}向けのざっくり方針です（${traits}）。細部は試合中に任せます。`,
    };
  }

  async referee(input: {
    sideAName: string;
    sideBName: string;
    engineWinnerSide: "a" | "b" | "draw" | null;
    turnFacts: RefereeTurnFact[];
    finalState: import("./types.js").RefereeFinalState;
  }): Promise<RefereeResult> {
    const winnerSide = input.engineWinnerSide ?? "draw";
    const name =
      winnerSide === "a"
        ? input.sideAName
        : winnerSide === "b"
          ? input.sideBName
          : null;
    return {
      winnerSide,
      reason: name
        ? `${name}の確定した働きかけが、全体としてわずかに上回った。`
        : "双方の確定した働きかけが、全体として拮抗していた。",
      reasonFacts: [{
        factor: "overall_effectiveness",
        favoredSide: winnerSide,
        statement: name
          ? `${name}側の確定した効果と残力が優勢だった。`
          : "双方の確定した効果と残力が拮抗した。",
      }],
    };
  }

  async analyzeCharacterImprovement(
    input: AnalyzeCharacterImprovementInput,
  ): Promise<AnalyzeCharacterImprovementResult> {
    const recent = await input.battleTools.search("", 8);
    const wins = recent.filter((b) => b.result === "win").length;
    const losses = recent.filter((b) => b.result === "loss").length;
    const skills = [
      ...new Set(recent.flatMap((b) => b.skillMentions)),
    ].slice(0, 3);
    const strengths = [
      skills.length
        ? `${skills[0]} を軸にした展開が目立つ`
        : `${input.character.displayName} らしい戦い方が保たれている`,
      wins >= losses
        ? "直近は優位な試合が多い"
        : "不利な状況でも最後まで立ち回れている",
    ];
    const improvements = [
      losses > wins
        ? "終盤のペース配分をもう少し意識する"
        : "序盤の観察を少し厚くして無駄打ちを減らす",
      "得意な働きかけのタイミングを明確にする",
    ];
    return {
      strengths,
      improvements,
      summary: `直近 ${recent.length} 戦（勝${wins}/負${losses}）を踏まえたモック分析です。特徴は維持したまま微調整向けのメモです。`,
      assistantMessage: "戦績から良い点と改善点をメモに登録しました。",
    };
  }

  async generateImprovementPrompt(
    input: GenerateImprovementPromptInput,
  ): Promise<GenerateImprovementPromptResult> {
    const strengths = input.memo.strengths.slice(0, 4).join("、") || "現状の持ち味";
    const improvements =
      input.memo.improvements.slice(0, 4).join("、") || "細かな立ち回りの精度";
    const prompt = [
      `${input.character.displayName} のコンセプト・性格・見た目・世界観は変えず、特徴を壊さない範囲で微調整してください。`,
      `伸ばしたい良い点: ${strengths}。`,
      `キャラらしさに影響しない範囲で改善したい点: ${improvements}。`,
      "能力の大幅強化やジャンルの書き換えは不要です。戦い方の癖や技の使いどころ、消耗の仕方など実務的な部分だけ整えてください。",
    ].join("");
    return {
      prompt,
      assistantMessage: "会話での修正欄に使える改善プロンプトを用意しました。",
    };
  }
}
