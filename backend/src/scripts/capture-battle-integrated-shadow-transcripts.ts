import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ActiveWorldProcessSchema,
  AdaptiveAdjudicationBudgetSchema,
  AdaptiveProposalCaseSchema,
  BattleStateSchema,
  CommittedMechanicalEvidenceSchema,
  ConsistencySliceSchema,
  DEFAULT_ADAPTIVE_ADJUDICATION_BUDGET,
  ResolvedBattleActionSchema,
  TurnEventSchema,
  WorldProcessConcretizationSchema,
  WorldTimelineCharacterProposalSchema,
  applyBattleWorldTransition,
  buildBattleStateProjectionGraphSnapshot,
  createBattleState,
  defaultParameters,
  resolveTurn,
  type AdaptiveActionKind,
  type AdaptiveActionProposal,
  type AdaptiveCharacterActionPlan,
  type AdaptiveEffect,
  type AdaptiveFact,
  type AdaptiveProposalCase,
  type BattleState,
  type CharacterSheet,
  type ConsistencyFactRow,
  type ConsistencySlice,
} from "@kshiai/shared";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaultFixturePath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-integrated-shadow-transcript-fixtures-v1.json",
);
const fixedTime = "2026-08-06T00:00:00.000Z";

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);

const ThresholdsSchema = z.object({
  schemaValidityMinimum: z.number().min(0).max(1),
  sourceMutationMaximum: z.number().int().nonnegative(),
  authoritativeOutcomeMismatchMaximum: z.number().int().nonnegative(),
  canonicalCommitMaximum: z.number().int().nonnegative(),
  dependencyResolutionMinimum: z.number().min(0).max(1),
  distinctOutcomeDigestsMaximumPerScenario: z.number().int().positive(),
}).strict();

const FixtureScenarioSchema = z.object({
  id: z.string().min(1).max(120),
  runner: z.string().min(1).max(120),
  stratum: z.enum([
    "ordinary_fast_action",
    "remote_rejection",
    "simultaneous_terminal_action",
    "interrupted_expanded_action",
    "active_world_process",
    "blocking_local_conflict",
    "exhausted_budget",
  ]),
  hypothesis: z.string().min(1).max(600),
  expectedEntityRefs: z.array(z.string().min(1)).min(1).max(64),
  expectedPredicates: z.array(z.string().min(1)).min(1).max(64),
  expectedRuleRefs: z.array(z.string().min(1)).min(1).max(32),
  expectedProcessRefs: z.array(z.string().min(1)).max(16),
  allowedFallbacks: z.array(z.enum([
    "defense",
    "intermediate",
    "weak",
    "unknown",
  ])).max(4),
}).strict();

const FixtureFileSchema = z.object({
  schemaVersion: z.literal(1),
  fixtureVersion: z.string().min(1),
  frozenAt: z.string().datetime(),
  deterministicRepetitions: z.number().int().min(1).max(100),
  thresholds: ThresholdsSchema,
  scenarios: z.array(FixtureScenarioSchema).length(7),
}).strict().superRefine((fixture, ctx) => {
  const ids = fixture.scenarios.map((scenario) => scenario.id);
  const runners = fixture.scenarios.map((scenario) => scenario.runner);
  const strata = fixture.scenarios.map((scenario) => scenario.stratum);
  for (const [pathName, values] of [
    ["id", ids],
    ["runner", runners],
    ["stratum", strata],
  ] as const) {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scenarios"],
        message: `scenario ${pathName} values must be unique`,
      });
    }
  }
});
type FixtureFile = z.infer<typeof FixtureFileSchema>;
type FixtureScenario = z.infer<typeof FixtureScenarioSchema>;

const CharacterInputsSchema = z.object({
  cases: z.array(AdaptiveProposalCaseSchema).max(8),
  budget: AdaptiveAdjudicationBudgetSchema,
  ruleRefs: z.array(z.string().min(1)).min(1).max(16),
  inputsPreAuthored: z.literal(true),
  generationCallsMeasured: z.literal(false),
}).strict();

const WorldInputsSchema = z.object({
  projection: ConsistencySliceSchema.nullable(),
  activeProcesses: z.array(ActiveWorldProcessSchema).max(16),
  characterProposals: z.array(WorldTimelineCharacterProposalSchema).max(16),
  concretizations: z.array(WorldProcessConcretizationSchema).max(8),
  inputsPreAuthored: z.literal(true),
  generationCallsMeasured: z.literal(false),
}).strict();

const AuthoritativeResultSchema = z.object({
  afterStateDigest: DigestSchema,
  normalizedOutcomeDigest: DigestSchema,
  normalizedOutcome: z.unknown(),
  actions: z.array(ResolvedBattleActionSchema).max(16),
  events: z.array(TurnEventSchema).max(64),
  mechanicalEvidence: z.array(CommittedMechanicalEvidenceSchema).max(128),
  temporalResolution: z.unknown().nullable(),
  worldRevision: z.number().int().nonnegative().nullable(),
}).strict();

const ExpectedDependenciesSchema = z.object({
  entityRefs: z.array(z.string().min(1)).min(1).max(128),
  sourceFactRefs: z.array(z.string().min(1)).max(256),
  inputFactRefs: z.array(z.string().min(1)).max(256),
  factRefs: z.array(z.string().min(1)).min(1).max(512),
  predicates: z.array(z.string().min(1)).min(1).max(64),
  ruleRefs: z.array(z.string().min(1)).min(1).max(64),
  processRefs: z.array(z.string().min(1)).max(32),
}).strict();

const TranscriptCheckSchema = z.object({
  id: z.string().min(1),
  passed: z.boolean(),
  detail: z.string().min(1),
}).strict();

const TranscriptScenarioSchema = z.object({
  id: z.string().min(1),
  stratum: FixtureScenarioSchema.shape.stratum,
  hypothesis: z.string().min(1),
  sourceBattleState: BattleStateSchema,
  sourceBattleStateDigest: DigestSchema,
  authoritativeResult: AuthoritativeResultSchema,
  characterInputs: CharacterInputsSchema,
  worldInputs: WorldInputsSchema,
  consistencyInputs: z.array(ConsistencySliceSchema).max(8),
  expectedDependencies: ExpectedDependenciesSchema,
  expectedBoundaries: z.object({
    forbiddenObserverIdentifiers: z.array(z.string().min(1)).min(1).max(16),
    sourceMutationAllowed: z.literal(false),
    authoritativeOutcomeChangeAllowed: z.literal(false),
    canonicalCommitAllowed: z.literal(false),
    allowedFallbacks: FixtureScenarioSchema.shape.allowedFallbacks,
  }).strict(),
  callModel: z.object({
    currentAuthoritativeTopology: z.object({
      semanticWorldSensoryCalls: z.literal(1),
      characterACalls: z.literal(1),
      characterBCalls: z.literal(1),
      narratorCalls: z.literal(1),
      minimumCalls: z.literal(4),
    }).strict(),
    localCaptureExternalLlmCalls: z.literal(0),
    shadowModeledOrdinaryCalls: z.literal(3),
    generationTokensMeasured: z.literal(false),
    generationLatencyMeasured: z.literal(false),
  }).strict(),
  repetitions: z.number().int().positive(),
  sourceMutationCount: z.number().int().nonnegative(),
  distinctAuthoritativeOutcomeDigests: z.number().int().positive(),
  checks: z.array(TranscriptCheckSchema).min(1).max(32),
}).strict();

const TranscriptReportWithoutIntegritySchema = z.object({
  schemaVersion: z.literal(1),
  fixtureVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
  mode: z.literal("integrated_shadow_transcript_baseline"),
  provenance: z.object({
    gitHead: z.string().min(1),
    workingTreeDirty: z.boolean(),
    nodeVersion: z.string().min(1),
    fixturePath: z.string().min(1),
    fixtureSha256: DigestSchema,
    evaluatorPath: z.string().min(1),
    evaluatorSha256: DigestSchema,
    sourceArtifacts: z.array(z.object({
      path: z.string().min(1),
      sha256: DigestSchema,
    }).strict()).min(1),
  }).strict(),
  execution: z.object({
    deterministicRepetitions: z.number().int().positive(),
    scenarioCount: z.literal(7),
    externalLlmCallsMade: z.literal(0),
    sourceMutationCount: z.number().int().nonnegative(),
    authoritativeOutcomeMismatchCount: z.number().int().nonnegative(),
    canonicalCommitCount: z.literal(0),
  }).strict(),
  thresholds: ThresholdsSchema,
  scenarios: z.array(TranscriptScenarioSchema).length(7),
  aggregate: z.object({
    schemaValidityRate: z.number().min(0).max(1),
    dependencyResolutionRate: z.number().min(0).max(1),
    allAuthoritativeOutcomesStable: z.boolean(),
    hardInvariantsPass: z.boolean(),
  }).strict(),
  limitations: z.array(z.string().min(1)).min(1),
}).strict();

const TranscriptReportSchema = TranscriptReportWithoutIntegritySchema.extend({
  integrity: z.object({
    algorithm: z.literal("sha256"),
    basis: z.literal("canonical report excluding integrity"),
    contentDigest: DigestSchema,
  }).strict(),
}).strict();
export const IntegratedShadowTranscriptReportSchema = TranscriptReportSchema;
export type IntegratedShadowTranscriptReport = z.infer<
  typeof TranscriptReportSchema
>;

type ResolveResult = ReturnType<typeof resolveTurn>;
type ResolveInput = Parameters<typeof resolveTurn>[0];
type CharacterInputs = z.infer<typeof CharacterInputsSchema>;
type WorldInputs = z.infer<typeof WorldInputsSchema>;

type BuiltScenario = {
  sourceBattleState: BattleState;
  authoritativeResult: ResolveResult;
  sourceMutated: boolean;
  characterInputs: CharacterInputs;
  worldInputs: WorldInputs;
  consistencyInputs: ConsistencySlice[];
};

const sourceArtifactPaths = [
  "docs/evidence/battle-pipeline-poc-baseline-2026-08-06.json",
  "docs/evidence/battle-pipeline-adaptive-adjudication-fixtures-v1.json",
  "docs/evidence/battle-pipeline-world-process-fixtures-v1.json",
  "docs/battle-pipeline-integrated-shadow-protocol.md",
] as const;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function digest(value: unknown): string {
  return sha256(JSON.stringify(canonicalize(value)));
}

export function verifyIntegratedShadowTranscriptContentDigest(
  raw: unknown,
): boolean {
  const report = TranscriptReportSchema.parse(raw);
  const { integrity, ...basis } = report;
  return digest(basis) === integrity.contentDigest;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function gitOutput(args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unavailable";
  }
}

function makeSheet(
  id: string,
  displayName: string,
  input: {
    hp?: number;
    atk?: number;
    def?: number;
    spd?: number;
  } = {},
): CharacterSheet {
  const hp = input.hp ?? 100;
  const parameters = defaultParameters({ hp, maxHp: hp });
  parameters.atk = input.atk ?? parameters.atk;
  parameters.def = input.def ?? parameters.def;
  parameters.spd = input.spd ?? parameters.spd;
  return {
    id,
    ownerUserId: "integrated-shadow-owner",
    displayName,
    tags: ["integrated-shadow-transcript"],
    createdAt: fixedTime,
    updatedAt: fixedTime,
    appearance: {
      summary: `${displayName}の固定transcript外見`,
      visualPrompt: "integrated shadow transcript fixture",
    },
    traits: ["慎重"],
    parameters,
    skills: [{
      id: "slash",
      name: "斬撃",
      description: "間合い内の相手へ切り込む。",
      costMp: 0,
      costStamina: 5,
      power: 1.2,
      kind: "attack",
      constraints: {
        reach: "near",
        requiresSight: true,
        mobility: "limited",
        requiresSpeech: false,
        requiresUsableHeldObject: false,
      },
    }],
    weapon: null,
    armor: null,
    combatFlags: {
      canFight: true,
      irreversibleIncapacitated: false,
    },
    narrativeBlurb: "Integrated shadow-turn PoC用固定キャラクター。",
  };
}

function makeState(
  id: string,
  sideA = makeSheet("fighter-a", "アオ"),
  sideB = makeSheet("fighter-b", "クロ"),
): BattleState {
  const state = createBattleState({
    id,
    sideA,
    sideB,
    turnLimit: 20,
    prologuePending: false,
  });
  state.createdAt = fixedTime;
  state.updatedAt = fixedTime;
  return BattleStateSchema.parse(state);
}

function normalizedOutcome(result: ResolveResult): unknown {
  return {
    turn: result.state.turn,
    status: result.state.status,
    winnerSide: result.state.winnerSide,
    finishReason: result.state.finishReason,
    aftermathPending: result.state.aftermathPending,
    sideA: {
      parameters: result.state.sideA.parameters,
      defending: result.state.sideA.defending,
      canFight: result.state.sideA.canFight,
    },
    sideB: {
      parameters: result.state.sideB.parameters,
      defending: result.state.sideB.defending,
      canFight: result.state.sideB.canFight,
    },
    actions: result.actions,
    events: result.events,
    mechanicalEvidence: result.mechanicalEvidence,
    temporalResolution: result.state.latestTemporalResolution ?? null,
    worldRevision: result.state.worldState?.revision ?? null,
  };
}

function resolveAuthoritative(input: ResolveInput): {
  sourceBattleState: BattleState;
  authoritativeResult: ResolveResult;
  sourceMutated: boolean;
} {
  const sourceBattleState = structuredClone(input.state);
  const beforeDigest = digest(input.state);
  const authoritativeResult = resolveTurn(input);
  const sourceMutated = digest(input.state) !== beforeDigest;
  BattleStateSchema.parse(sourceBattleState);
  BattleStateSchema.parse(authoritativeResult.state);
  return { sourceBattleState, authoritativeResult, sourceMutated };
}

function adaptiveFact(input: {
  id: string;
  subjectRef: string;
  predicate: string;
  value?: unknown;
  strength?: AdaptiveFact["strength"];
  provenance?: AdaptiveFact["provenance"];
}): AdaptiveFact {
  return {
    id: input.id,
    subjectRef: input.subjectRef,
    predicate: input.predicate,
    ...(Object.prototype.hasOwnProperty.call(input, "value")
      ? { value: input.value }
      : {}),
    strength: input.strength ?? "known",
    provenance: input.provenance ?? "canonical",
  };
}

function adaptiveAssertion(
  id: string,
  sourceRef: string,
  asserted: AdaptiveFact,
): AdaptiveEffect {
  return {
    id,
    operation: "assert",
    fact: asserted,
    irreversible: true,
    causalSourceRef: sourceRef,
    ...(sourceRef.startsWith("step.") ? { sourceStepRef: sourceRef } : {}),
  };
}

function adaptiveProposal(input: {
  ref: string;
  actorRef?: "character.a" | "character.b";
  kind: AdaptiveActionKind;
  targetRefs?: string[];
  expansionReasons?: AdaptiveActionProposal["expansionReasons"];
  characterPlan?: boolean;
}): AdaptiveActionProposal {
  const actorRef = input.actorRef ?? "character.a";
  return {
    proposalRef: input.ref,
    actorRef,
    actionKind: input.kind,
    method: "固定transcriptで観測済みの対象へ働きかける",
    targetRefs: input.targetRefs ?? [
      actorRef === "character.a" ? "character.b" : "character.a",
    ],
    intent: {
      objective: "現行resolverの意図をshadow入力として保持する",
      targetRefs: ["subject.counterpart"],
      priorities: ["観測可能な事実を優先する"],
      mustPreserve: ["authoritative outcome"],
      mustAvoid: ["未知状態の強制確定"],
    },
    characterBasis: {
      observationRefs: [`observation:${input.ref}`],
      psychologyRefs: [`psychology:${actorRef}`],
      experienceRefs: [`experience:${actorRef}`],
    },
    latentPlanHints: { fallback: "成立した地点で停止する" },
    expansionReasons: input.expansionReasons ?? [],
    expansionNeeds: {
      characterPlan: input.characterPlan ?? false,
      worldDetail: false,
    },
  };
}

function plan(
  proposal: AdaptiveActionProposal,
  steps: AdaptiveCharacterActionPlan["steps"],
): AdaptiveCharacterActionPlan {
  return {
    proposalRef: proposal.proposalRef,
    steps,
    branches: [],
    abortConditions: [],
  };
}

function proposalCase(input: {
  proposal: AdaptiveActionProposal;
  facts?: AdaptiveFact[];
  controlEffects?: AdaptiveEffect[];
  characterPlan?: AdaptiveCharacterActionPlan;
  fallbackClaims?: AdaptiveFact[];
  scopeRefs?: string[];
}): AdaptiveProposalCase {
  return AdaptiveProposalCaseSchema.parse({
    proposal: input.proposal,
    facts: input.facts ?? [],
    scopeRefs: input.scopeRefs ?? [
      "character.a",
      "character.b",
      "object.token",
      "area.1",
    ],
    controlResolution: input.controlEffects
      ? {
        source: "control",
        outcome: "completed",
        effects: input.controlEffects,
        costs: [],
      }
      : undefined,
    characterPlan: input.characterPlan,
    worldExpansions: [],
    fallbackClaims: input.fallbackClaims ?? [],
  });
}

function emptyWorldInputs(): WorldInputs {
  return {
    projection: null,
    activeProcesses: [],
    characterProposals: [],
    concretizations: [],
    inputsPreAuthored: true,
    generationCallsMeasured: false,
  };
}

function consistencySlice(input: {
  purpose: ConsistencySlice["purpose"];
  entityRefs: string[];
  facts: Array<{
    id: string;
    subjectRef: string;
    predicate: string;
    value: unknown;
  }>;
  ruleRefs: string[];
  processRefs?: string[];
  issue?: ConsistencySlice["issues"][number];
}): ConsistencySlice {
  const groups = new Map<string, ConsistencyFactRow[]>();
  for (const fact of input.facts) {
    const rows = groups.get(fact.subjectRef) ?? [];
    rows.push([
      fact.id,
      fact.predicate,
      null,
      0,
      null,
      "world",
      fact.value,
    ]);
    groups.set(fact.subjectRef, rows);
  }
  return ConsistencySliceSchema.parse({
    schemaVersion: 2,
    purpose: input.purpose,
    scope: {
      anchorRefs: input.entityRefs.slice(0, 2),
      entityRefs: uniqueSorted(input.entityRefs),
      processRefs: uniqueSorted(input.processRefs ?? []),
      traversedKinds: ["causal_dependency", "rule_dependency"],
      temporalWindow: {
        fromTurn: 1,
        toTurn: 1,
        phase: "execution",
      },
      truncated: false,
      omitted: { entities: 0, facts: 0, rules: 0, historyTurns: 0 },
    },
    factGroups: [...groups.entries()].map(([subjectRef, facts]) => ({
      subjectRef,
      facts,
    })),
    causalLinks: [],
    issues: input.issue ? [input.issue] : [],
    applicableRuleRefs: input.ruleRefs,
  });
}

function characterInputs(
  cases: AdaptiveProposalCase[],
  ruleRefs: string[],
  budget = DEFAULT_ADAPTIVE_ADJUDICATION_BUDGET,
): CharacterInputs {
  return CharacterInputsSchema.parse({
    cases,
    budget,
    ruleRefs,
    inputsPreAuthored: true,
    generationCallsMeasured: false,
  });
}

function ordinaryFastAction(): BuiltScenario {
  const a = makeSheet("fighter-a", "アオ");
  const b = makeSheet("fighter-b", "クロ");
  const before = makeState("shadow-transcript-ordinary", a, b);
  before.plannedActionA = { kind: "skill", skillId: "slash" };
  before.plannedActionB = { kind: "wait" };
  const captured = resolveAuthoritative({
    state: before,
    sideASkills: a.skills,
    sideBSkills: b.skills,
  });
  const proposal = adaptiveProposal({
    ref: "proposal.ordinary.a",
    kind: "skill",
  });
  const effect = adaptiveAssertion(
    "effect.ordinary.hp-loss",
    "control:ordinary",
    adaptiveFact({
      id: "input-fact.ordinary.hp-loss",
      subjectRef: "character.b",
      predicate: "parameter.hp",
      value: "moderate_loss",
      provenance: "canonical",
    }),
  );
  return {
    ...captured,
    characterInputs: characterInputs([
      proposalCase({ proposal, controlEffects: [effect] }),
    ], ["battle.mechanical-resolution.v1"]),
    worldInputs: emptyWorldInputs(),
    consistencyInputs: [],
  };
}

function remoteRejection(): BuiltScenario {
  const a = makeSheet("fighter-a", "アオ");
  const b = makeSheet("fighter-b", "クロ");
  const before = makeState("shadow-transcript-remote", a, b);
  const moved = applyBattleWorldTransition({
    state: before.worldState!,
    turn: 0,
    transition: {
      baseRevision: before.worldState!.revision,
      turn: 0,
      operations: [{
        op: "add_area",
        areaId: "area.remote",
        area: {
          label: "遠隔区画",
          illumination: "normal",
          noise: "normal",
          space: "open",
          movement: "open",
        },
      }, {
        op: "set_placement",
        entityId: "character.b",
        placement: { type: "scene", areaId: "area.remote" },
      }, {
        op: "set_pair_relation",
        entityAId: "character.a",
        entityBId: "character.b",
        distance: "separate_area",
        sight: "blocked",
        sound: "partial",
        orientationA: "indeterminate",
        orientationB: "indeterminate",
      }],
    },
  });
  if (!moved.ok) throw new Error(moved.error.message);
  before.worldState = moved.state;
  before.plannedActionA = { kind: "basic_attack" };
  before.plannedActionB = { kind: "wait" };
  const captured = resolveAuthoritative({
    state: before,
    sideASkills: a.skills,
    sideBSkills: b.skills,
  });
  const fallback = adaptiveProposal({
    ref: "proposal.remote.fallback.a",
    actorRef: "character.a",
    kind: "defense",
    targetRefs: ["character.a"],
  });
  return {
    ...captured,
    characterInputs: characterInputs([
      proposalCase({ proposal: fallback, controlEffects: [] }),
    ], ["battle.action-feasibility.v1"]),
    worldInputs: emptyWorldInputs(),
    consistencyInputs: [],
  };
}

function simultaneousTerminalAction(): BuiltScenario {
  const a = makeSheet("fighter-a", "アオ", { hp: 1, spd: 10 });
  const b = makeSheet("fighter-b", "クロ", { hp: 1, spd: 10 });
  const before = makeState("shadow-transcript-mutual-ko", a, b);
  before.plannedActionA = { kind: "basic_attack" };
  before.plannedActionB = { kind: "basic_attack" };
  const captured = resolveAuthoritative({
    state: before,
    sideASkills: a.skills,
    sideBSkills: b.skills,
  });
  const cases = (["a", "b"] as const).map((side) => {
    const target = side === "a" ? "character.b" : "character.a";
    const proposal = adaptiveProposal({
      ref: `proposal.simultaneous.${side}`,
      actorRef: `character.${side}`,
      kind: "basic_attack",
      targetRefs: [target],
    });
    return proposalCase({
      proposal,
      controlEffects: [adaptiveAssertion(
        `effect.simultaneous.${side}`,
        `control:simultaneous:${side}`,
        adaptiveFact({
          id: `input-fact.simultaneous.${side}`,
          subjectRef: target,
          predicate: "parameter.hp",
          value: "incapacitated",
          provenance: "canonical",
        }),
      )],
    });
  });
  return {
    ...captured,
    characterInputs: characterInputs(
      cases,
      ["battle.temporal.initiative-window.v1"],
    ),
    worldInputs: emptyWorldInputs(),
    consistencyInputs: [],
  };
}

function interruptedExpandedAction(): BuiltScenario {
  const a = makeSheet("fighter-a", "遅い側", { hp: 1, spd: 5 });
  const b = makeSheet("fighter-b", "速い側", { hp: 100, spd: 20 });
  const before = makeState("shadow-transcript-interrupted", a, b);
  before.plannedActionA = { kind: "basic_attack" };
  before.plannedActionB = { kind: "basic_attack" };
  const captured = resolveAuthoritative({
    state: before,
    sideASkills: a.skills,
    sideBSkills: b.skills,
  });
  const proposal = adaptiveProposal({
    ref: "proposal.interrupted.a",
    actorRef: "character.a",
    kind: "custom",
    expansionReasons: ["partial_stop_matters", "stage_dependent_cost"],
    characterPlan: true,
  });
  const reachable = adaptiveFact({
    id: "input-fact.interrupted.reachable",
    subjectRef: "character.a",
    predicate: "target.reachable",
    value: true,
  });
  const stillAble = adaptiveFact({
    id: "input-fact.interrupted.can-fight",
    subjectRef: "character.a",
    predicate: "combat.can_fight",
    value: false,
  });
  const actionPlan = plan(proposal, [{
    id: "step.interrupted.approach",
    description: "攻撃前の踏み込みを開始する",
    origin: "character_expansion",
    basisRefs: proposal.characterBasis.observationRefs,
    preconditions: [{
      factRef: reachable.id,
      operator: "equals",
      value: true,
    }],
    effects: [adaptiveAssertion(
      "effect.interrupted.approached",
      "step.interrupted.approach",
      adaptiveFact({
        id: "input-fact.interrupted.approached",
        subjectRef: "character.a",
        predicate: "position.approached",
        value: true,
        provenance: "character_step",
      }),
    )],
    costs: [{
      id: "cost.interrupted.exposure",
      channel: "exposure",
      description: "踏み込みによって露見する",
      sourceStepRef: "step.interrupted.approach",
    }],
    exclusiveClaimRefs: [],
  }, {
    id: "step.interrupted.strike",
    description: "行動可能なら攻撃を完了する",
    origin: "character_expansion",
    basisRefs: proposal.characterBasis.observationRefs,
    preconditions: [{
      factRef: stillAble.id,
      operator: "equals",
      value: true,
    }],
    effects: [adaptiveAssertion(
      "effect.interrupted.strike",
      "step.interrupted.strike",
      adaptiveFact({
        id: "input-fact.interrupted.strike",
        subjectRef: "character.b",
        predicate: "parameter.hp",
        value: "loss",
        provenance: "character_step",
      }),
    )],
    costs: [],
    exclusiveClaimRefs: [],
  }]);
  return {
    ...captured,
    characterInputs: characterInputs([
      proposalCase({
        proposal,
        facts: [reachable, stillAble],
        characterPlan: actionPlan,
      }),
    ], ["battle.temporal.revalidation.v1"]),
    worldInputs: emptyWorldInputs(),
    consistencyInputs: [],
  };
}

function activeWorldProcess(): BuiltScenario {
  const a = makeSheet("fighter-a", "アオ");
  const b = makeSheet("fighter-b", "クロ");
  const before = makeState("shadow-transcript-world", a, b);
  before.plannedActionA = { kind: "wait" };
  before.plannedActionB = { kind: "wait" };
  const captured = resolveAuthoritative({
    state: before,
    sideASkills: a.skills,
    sideBSkills: b.skills,
    envHits: [{ target: "both", kind: "damage", intensity: "minor" }],
  });
  const projection = consistencySlice({
    purpose: "world_process",
    entityRefs: ["source.fire", "area.1", "character.a", "character.b"],
    processRefs: ["process.fire.1"],
    facts: [{
      id: "input-fact.fire.active",
      subjectRef: "source.fire",
      predicate: "fire.state",
      value: "active",
    }, {
      id: "input-fact.area.fire-safe",
      subjectRef: "area.1",
      predicate: "area.fire",
      value: "safe",
    }],
    ruleRefs: ["world-process.fire.v1"],
  });
  return {
    ...captured,
    characterInputs: characterInputs([], ["world-process.fire.v1"]),
    worldInputs: WorldInputsSchema.parse({
      projection,
      activeProcesses: [{
        processRef: "process.fire.1",
        processKind: "fire",
        sourceRefs: ["source.fire"],
        targetRefs: ["area.1"],
        triggerFactRefs: ["input-fact.fire.active"],
        timing: { fromTurn: 1, toTurn: 1, phase: "execution" },
        active: true,
      }],
      characterProposals: [],
      concretizations: [],
      inputsPreAuthored: true,
      generationCallsMeasured: false,
    }),
    consistencyInputs: [projection],
  };
}

function blockingLocalConflict(): BuiltScenario {
  const a = makeSheet("fighter-a", "アオ");
  const b = makeSheet("fighter-b", "クロ");
  const before = makeState("shadow-transcript-conflict", a, b);
  before.plannedActionA = {
    kind: "free_action",
    description: "中央の印へ手を伸ばす",
    subjectRefs: ["subject.counterpart"],
  };
  before.plannedActionB = {
    kind: "free_action",
    description: "中央の印へ手を伸ばす",
    subjectRefs: ["subject.counterpart"],
  };
  const captured = resolveAuthoritative({
    state: before,
    sideASkills: a.skills,
    sideBSkills: b.skills,
  });
  const cases = (["a", "b"] as const).map((side) => {
    const proposal = adaptiveProposal({
      ref: `proposal.conflict.${side}`,
      actorRef: `character.${side}`,
      kind: "custom",
      targetRefs: ["object.token"],
      expansionReasons: ["simultaneous_conflict"],
      characterPlan: true,
    });
    const actionPlan = plan(proposal, [{
      id: `step.conflict.claim.${side}`,
      description: "同じ印を確保する",
      origin: "character_expansion",
      basisRefs: proposal.characterBasis.observationRefs,
      preconditions: [],
      effects: [adaptiveAssertion(
        `effect.conflict.claim.${side}`,
        `step.conflict.claim.${side}`,
        adaptiveFact({
          id: `input-fact.conflict.claim.${side}`,
          subjectRef: "object.token",
          predicate: "held_by",
          value: `character.${side}`,
          provenance: "character_step",
        }),
      )],
      costs: [],
      exclusiveClaimRefs: ["claim:object.token"],
    }]);
    return proposalCase({
      proposal,
      characterPlan: actionPlan,
      scopeRefs: ["character.a", "character.b", "object.token"],
    });
  });
  const slice = consistencySlice({
    purpose: "adjudication",
    entityRefs: ["character.a", "character.b", "object.token"],
    facts: [{
      id: "input-fact.conflict.held-a",
      subjectRef: "object.token",
      predicate: "held_by",
      value: "character.a",
    }, {
      id: "input-fact.conflict.held-b",
      subjectRef: "object.token",
      predicate: "held_by",
      value: "character.b",
    }],
    ruleRefs: ["battle.exclusive-claim.v1"],
    issue: {
      id: "issue.token-holder-conflict",
      involvedFactRefs: [
        "input-fact.conflict.held-a",
        "input-fact.conflict.held-b",
      ],
      involvedEntityRefs: ["object.token", "character.a", "character.b"],
      blocksPurposes: ["adjudication"],
      status: "open",
    },
  });
  return {
    ...captured,
    characterInputs: characterInputs(cases, ["battle.exclusive-claim.v1"]),
    worldInputs: WorldInputsSchema.parse({
      ...emptyWorldInputs(),
      characterProposals: (["a", "b"] as const).map((side) => ({
        proposalRef: `proposal.conflict.${side}`,
        actorRef: `character.${side}`,
        timing: { fromTurn: 1, toTurn: 1, phase: "execution" },
        exclusiveClaimRefs: ["claim:object.token"],
      })),
    }),
    consistencyInputs: [slice],
  };
}

function exhaustedBudget(): BuiltScenario {
  const a = makeSheet("fighter-a", "アオ");
  const b = makeSheet("fighter-b", "クロ");
  const before = makeState("shadow-transcript-budget", a, b);
  const restrained = applyBattleWorldTransition({
    state: before.worldState!,
    turn: 0,
    transition: {
      baseRevision: before.worldState!.revision,
      turn: 0,
      operations: [{
        op: "set_actor_state",
        entityId: "character.a",
        changes: {
          mobility: "immobilized",
          restraint: "restrained",
        },
      }],
    },
  });
  if (!restrained.ok) throw new Error(restrained.error.message);
  before.worldState = restrained.state;
  before.plannedActionA = {
    kind: "free_action",
    description: "拘束から抜け出そうとする",
    desiredOutcome: "動ける状態へ戻る",
    subjectRefs: ["self"],
  };
  before.plannedActionB = { kind: "wait" };
  const captured = resolveAuthoritative({
    state: before,
    sideASkills: a.skills,
    sideBSkills: b.skills,
  });
  const proposal = adaptiveProposal({
    ref: "proposal.budget.escape",
    actorRef: "character.a",
    kind: "custom",
    targetRefs: ["character.a"],
    expansionReasons: ["partial_stop_matters"],
    characterPlan: true,
  });
  const restraintFact = adaptiveFact({
    id: "input-fact.budget.restrained",
    subjectRef: "character.a",
    predicate: "restrained",
    value: true,
  });
  const fallback = adaptiveFact({
    id: "input-fact.budget.escape-progress",
    subjectRef: "character.a",
    predicate: "escape_progress",
    value: "partial",
    strength: "intermediate",
    provenance: "intermediate_fallback",
  });
  const actionPlan = plan(proposal, [{
    id: "step.budget.escape",
    description: "拘束を緩める",
    origin: "character_expansion",
    basisRefs: proposal.characterBasis.observationRefs,
    preconditions: [],
    effects: [],
    costs: [],
    exclusiveClaimRefs: [],
  }]);
  return {
    ...captured,
    characterInputs: characterInputs([
      proposalCase({
        proposal,
        facts: [restraintFact],
        characterPlan: actionPlan,
        fallbackClaims: [fallback],
      }),
    ], ["battle.adaptive-budget.v1"], {
      ...DEFAULT_ADAPTIVE_ADJUDICATION_BUDGET,
      maxPlanningExpansions: 0,
    }),
    worldInputs: emptyWorldInputs(),
    consistencyInputs: [],
  };
}

const scenarioBuilders: Record<string, () => BuiltScenario> = {
  ordinary_fast_action: ordinaryFastAction,
  remote_rejection: remoteRejection,
  simultaneous_terminal_action: simultaneousTerminalAction,
  interrupted_expanded_action: interruptedExpandedAction,
  active_world_process: activeWorldProcess,
  blocking_local_conflict: blockingLocalConflict,
  exhausted_budget: exhaustedBudget,
};

function inputFacts(built: BuiltScenario): Array<{
  id: string;
  predicate: string;
}> {
  const adaptiveFacts = built.characterInputs.cases.flatMap((item) => [
    ...item.facts,
    ...item.fallbackClaims,
    ...item.characterPlan?.steps.flatMap((step) =>
      step.effects.flatMap((effect) => effect.fact ? [effect.fact] : [])
    ) ?? [],
    ...item.controlResolution?.effects.flatMap((effect) =>
      effect.fact ? [effect.fact] : []
    ) ?? [],
  ]).map((fact) => ({ id: fact.id, predicate: fact.predicate }));
  const consistencyFacts = [
    ...built.consistencyInputs,
    ...(built.worldInputs.projection ? [built.worldInputs.projection] : []),
  ].flatMap((slice) => slice.factGroups.flatMap((group) =>
    group.facts.map((fact) => ({ id: fact[0], predicate: fact[1] }))
  ));
  return [...new Map(
    [...adaptiveFacts, ...consistencyFacts].map((fact) => [fact.id, fact]),
  ).values()];
}

function buildTranscriptScenario(input: {
  fixture: FixtureScenario;
  repetitions: number;
}): z.infer<typeof TranscriptScenarioSchema> {
  const builder = scenarioBuilders[input.fixture.runner];
  if (!builder) throw new Error(`unknown transcript runner ${input.fixture.runner}`);
  const runs = Array.from({ length: input.repetitions }, () => builder());
  const first = runs[0]!;
  const authoritativeDigests = runs.map((run) =>
    digest(normalizedOutcome(run.authoritativeResult))
  );
  const graph = buildBattleStateProjectionGraphSnapshot(
    first.sourceBattleState,
  );
  const providedFacts = inputFacts(first);
  const sourceMatches = graph.facts.filter((fact) =>
    input.fixture.expectedPredicates.includes(fact.predicate)
  );
  const inputMatches = providedFacts.filter((fact) =>
    input.fixture.expectedPredicates.includes(fact.predicate)
  );
  const resolvedPredicates = new Set([
    ...sourceMatches.map((fact) => fact.predicate),
    ...inputMatches.map((fact) => fact.predicate),
  ]);
  const inputEntityRefs = uniqueSorted([
    ...first.characterInputs.cases.flatMap((item) => item.scopeRefs),
    ...first.consistencyInputs.flatMap((slice) => slice.scope.entityRefs),
    ...(first.worldInputs.projection?.scope.entityRefs ?? []),
    ...first.worldInputs.activeProcesses.flatMap((process) => [
      process.processRef,
      ...process.sourceRefs,
      ...process.targetRefs,
    ]),
  ]);
  const availableEntityRefs = new Set([
    ...graph.entityRefs,
    ...inputEntityRefs,
  ]);
  const missingEntities = input.fixture.expectedEntityRefs.filter(
    (ref) => !availableEntityRefs.has(ref),
  );
  const missingPredicates = input.fixture.expectedPredicates.filter(
    (predicate) => !resolvedPredicates.has(predicate),
  );
  const availableRuleRefs = new Set([
    ...graph.ruleRefs,
    ...first.characterInputs.ruleRefs,
    ...first.consistencyInputs.flatMap((slice) => slice.applicableRuleRefs),
    ...(first.worldInputs.projection?.applicableRuleRefs ?? []),
  ]);
  const missingRules = input.fixture.expectedRuleRefs.filter(
    (ref) => !availableRuleRefs.has(ref),
  );
  const processRefs = first.worldInputs.activeProcesses.map(
    (process) => process.processRef,
  );
  const missingProcesses = input.fixture.expectedProcessRefs.filter(
    (ref) => !processRefs.includes(ref),
  );
  const sourceMutationCount = runs.filter((run) => run.sourceMutated).length;
  const sourceStateDigest = digest(first.sourceBattleState);
  const checks = [
    {
      id: "source_battle_state_schema_valid",
      passed: runs.every((run) =>
        BattleStateSchema.safeParse(run.sourceBattleState).success
      ),
      detail: "every captured before-state passes BattleStateSchema",
    },
    {
      id: "authoritative_result_schema_valid",
      passed: runs.every((run) =>
        BattleStateSchema.safeParse(run.authoritativeResult.state).success &&
        ResolvedBattleActionSchema.array().safeParse(
          run.authoritativeResult.actions,
        ).success &&
        TurnEventSchema.array().safeParse(run.authoritativeResult.events).success &&
        CommittedMechanicalEvidenceSchema.array().safeParse(
          run.authoritativeResult.mechanicalEvidence,
        ).success
      ),
      detail: "every authoritative result passes its shared schemas",
    },
    {
      id: "source_not_mutated",
      passed: sourceMutationCount === 0,
      detail: `source mutation count: ${sourceMutationCount}`,
    },
    {
      id: "authoritative_outcome_stable",
      passed: new Set(authoritativeDigests).size === 1,
      detail: `distinct authoritative outcome digests: ${new Set(authoritativeDigests).size}`,
    },
    {
      id: "expected_entities_resolved",
      passed: missingEntities.length === 0,
      detail: missingEntities.length === 0
        ? "all expected entity refs resolve"
        : `missing entity refs: ${missingEntities.join(", ")}`,
    },
    {
      id: "expected_predicates_resolved",
      passed: missingPredicates.length === 0,
      detail: missingPredicates.length === 0
        ? "all expected predicates resolve to exact fact refs"
        : `missing predicates: ${missingPredicates.join(", ")}`,
    },
    {
      id: "expected_rules_resolved",
      passed: missingRules.length === 0,
      detail: missingRules.length === 0
        ? "all expected rule refs resolve"
        : `missing rule refs: ${missingRules.join(", ")}`,
    },
    {
      id: "expected_processes_resolved",
      passed: missingProcesses.length === 0,
      detail: missingProcesses.length === 0
        ? "all expected process refs resolve"
        : `missing process refs: ${missingProcesses.join(", ")}`,
    },
    {
      id: "shadow_inputs_schema_valid",
      passed: CharacterInputsSchema.safeParse(first.characterInputs).success &&
        WorldInputsSchema.safeParse(first.worldInputs).success &&
        ConsistencySliceSchema.array().safeParse(
          first.consistencyInputs,
        ).success,
      detail: "all pre-authored shadow inputs pass their strict schemas",
    },
  ];
  const normalized = normalizedOutcome(first.authoritativeResult);
  return TranscriptScenarioSchema.parse({
    id: input.fixture.id,
    stratum: input.fixture.stratum,
    hypothesis: input.fixture.hypothesis,
    sourceBattleState: first.sourceBattleState,
    sourceBattleStateDigest: sourceStateDigest,
    authoritativeResult: {
      afterStateDigest: digest(first.authoritativeResult.state),
      normalizedOutcomeDigest: digest(normalized),
      normalizedOutcome: normalized,
      actions: first.authoritativeResult.actions,
      events: first.authoritativeResult.events,
      mechanicalEvidence: first.authoritativeResult.mechanicalEvidence,
      temporalResolution:
        first.authoritativeResult.state.latestTemporalResolution ?? null,
      worldRevision: first.authoritativeResult.state.worldState?.revision ?? null,
    },
    characterInputs: first.characterInputs,
    worldInputs: first.worldInputs,
    consistencyInputs: first.consistencyInputs,
    expectedDependencies: {
      entityRefs: input.fixture.expectedEntityRefs,
      sourceFactRefs: uniqueSorted(sourceMatches.map((fact) => fact.id)),
      inputFactRefs: uniqueSorted(inputMatches.map((fact) => fact.id)),
      factRefs: uniqueSorted([
        ...sourceMatches.map((fact) => fact.id),
        ...inputMatches.map((fact) => fact.id),
      ]),
      predicates: input.fixture.expectedPredicates,
      ruleRefs: input.fixture.expectedRuleRefs,
      processRefs: input.fixture.expectedProcessRefs,
    },
    expectedBoundaries: {
      forbiddenObserverIdentifiers: ["character.a", "character.b"],
      sourceMutationAllowed: false,
      authoritativeOutcomeChangeAllowed: false,
      canonicalCommitAllowed: false,
      allowedFallbacks: input.fixture.allowedFallbacks,
    },
    callModel: {
      currentAuthoritativeTopology: {
        semanticWorldSensoryCalls: 1,
        characterACalls: 1,
        characterBCalls: 1,
        narratorCalls: 1,
        minimumCalls: 4,
      },
      localCaptureExternalLlmCalls: 0,
      shadowModeledOrdinaryCalls: 3,
      generationTokensMeasured: false,
      generationLatencyMeasured: false,
    },
    repetitions: input.repetitions,
    sourceMutationCount,
    distinctAuthoritativeOutcomeDigests: new Set(authoritativeDigests).size,
    checks,
  });
}

export async function captureBattleIntegratedShadowTranscripts(input: {
  fixturePath?: string;
  repetitions?: number;
  now?: () => Date;
} = {}): Promise<IntegratedShadowTranscriptReport> {
  const fixturePath = path.resolve(input.fixturePath ?? defaultFixturePath);
  const fixtureText = await fs.readFile(fixturePath, "utf8");
  const fixture = FixtureFileSchema.parse(JSON.parse(fixtureText));
  const repetitions = input.repetitions ?? fixture.deterministicRepetitions;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new Error("repetitions must be an integer from 1 through 100");
  }
  const scenarios = fixture.scenarios.map((scenario) =>
    buildTranscriptScenario({ fixture: scenario, repetitions })
  );
  const allChecks = scenarios.flatMap((scenario) => scenario.checks);
  const sourceMutationCount = scenarios.reduce(
    (sum, scenario) => sum + scenario.sourceMutationCount,
    0,
  );
  const authoritativeOutcomeMismatchCount = scenarios.filter(
    (scenario) =>
      scenario.distinctAuthoritativeOutcomeDigests >
        fixture.thresholds.distinctOutcomeDigestsMaximumPerScenario,
  ).length;
  const schemaChecks = allChecks.filter((check) =>
    check.id.includes("schema_valid")
  );
  const dependencyChecks = allChecks.filter((check) =>
    check.id.startsWith("expected_")
  );
  const schemaValidityRate = schemaChecks.filter((check) => check.passed).length /
    schemaChecks.length;
  const dependencyResolutionRate = dependencyChecks.filter((check) =>
    check.passed
  ).length / dependencyChecks.length;
  const evaluatorPath = fileURLToPath(import.meta.url);
  const evaluatorText = await fs.readFile(evaluatorPath, "utf8");
  const sourceArtifacts = await Promise.all(sourceArtifactPaths.map(
    async (relativePath) => ({
      path: relativePath,
      sha256: sha256(await fs.readFile(
        path.join(repositoryRoot, relativePath),
      )),
    }),
  ));
  const reportWithoutIntegrity = TranscriptReportWithoutIntegritySchema.parse({
    schemaVersion: 1,
    fixtureVersion: fixture.fixtureVersion,
    generatedAt: (input.now?.() ?? new Date()).toISOString(),
    mode: "integrated_shadow_transcript_baseline",
    provenance: {
      gitHead: gitOutput(["rev-parse", "HEAD"]),
      workingTreeDirty: gitOutput(["status", "--porcelain"]) !== "",
      nodeVersion: process.version,
      fixturePath: path.relative(repositoryRoot, fixturePath),
      fixtureSha256: sha256(fixtureText),
      evaluatorPath: path.relative(repositoryRoot, evaluatorPath),
      evaluatorSha256: sha256(evaluatorText),
      sourceArtifacts,
    },
    execution: {
      deterministicRepetitions: repetitions,
      scenarioCount: 7,
      externalLlmCallsMade: 0,
      sourceMutationCount,
      authoritativeOutcomeMismatchCount,
      canonicalCommitCount: 0,
    },
    thresholds: fixture.thresholds,
    scenarios,
    aggregate: {
      schemaValidityRate,
      dependencyResolutionRate,
      allAuthoritativeOutcomesStable: scenarios.every((scenario) =>
        scenario.distinctAuthoritativeOutcomeDigests <=
          fixture.thresholds.distinctOutcomeDigestsMaximumPerScenario
      ),
      hardInvariantsPass:
        schemaValidityRate >= fixture.thresholds.schemaValidityMinimum &&
        sourceMutationCount <= fixture.thresholds.sourceMutationMaximum &&
        authoritativeOutcomeMismatchCount <=
          fixture.thresholds.authoritativeOutcomeMismatchMaximum &&
        dependencyResolutionRate >=
          fixture.thresholds.dependencyResolutionMinimum &&
        allChecks.every((check) => check.passed),
    },
    limitations: [
      "Character plans and world inputs are pre-authored transcript data, not live LLM generations.",
      "The current four-call topology is modeled from the frozen baseline; this local capture makes no provider calls.",
      "The artifact freezes server-side inputs and authoritative controls but does not build the integrated receipt.",
      "Passing transcript checks cannot prove objective battle correctness, global consistency, or production readiness.",
      "No runtime service, canonical commit, database, provider ordering, release, or deployment behavior is changed.",
    ],
  });
  const report = TranscriptReportSchema.parse({
    ...reportWithoutIntegrity,
    integrity: {
      algorithm: "sha256",
      basis: "canonical report excluding integrity",
      contentDigest: digest(reportWithoutIntegrity),
    },
  });
  if (!verifyIntegratedShadowTranscriptContentDigest(report)) {
    throw new Error("integrated shadow transcript content digest mismatch");
  }
  return report;
}

function parseArgs(args: string[]): {
  fixturePath?: string;
  repetitions?: number;
  outputPath?: string;
} {
  const parsed: {
    fixturePath?: string;
    repetitions?: number;
    outputPath?: string;
  } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`missing value for ${arg}`);
    if (arg === "--fixtures") {
      parsed.fixturePath = path.resolve(repositoryRoot, value);
    } else if (arg === "--repetitions") {
      parsed.repetitions = Number(value);
    } else if (arg === "--output") {
      parsed.outputPath = path.resolve(repositoryRoot, value);
    } else {
      throw new Error(`unknown argument ${arg}`);
    }
    index += 1;
  }
  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await captureBattleIntegratedShadowTranscripts({
    fixturePath: args.fixturePath,
    repetitions: args.repetitions,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
    await fs.writeFile(args.outputPath, serialized, {
      encoding: "utf8",
      flag: "wx",
    });
    console.error(`[integrated-shadow-transcripts] wrote ${args.outputPath}`);
    return;
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
