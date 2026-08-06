import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { z } from "zod";
import {
  DEFAULT_ADAPTIVE_ADJUDICATION_BUDGET,
  AdaptiveAdjudicationBatchResultSchema,
  adjudicateAdaptiveBattleProposals,
  type AdaptiveActionKind,
  type AdaptiveActionProposal,
  type AdaptiveAdjudicationBatchResult,
  type AdaptiveAdjudicationBudget,
  type AdaptiveCharacterActionPlan,
  type AdaptiveEffect,
  type AdaptiveFact,
  type AdaptiveProposalCase,
} from "@kshiai/shared";
import { config } from "../config.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaultFixturePath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-adaptive-adjudication-fixtures-v1.json",
);
const adaptiveSourcePath = path.join(
  repositoryRoot,
  "packages/shared/src/battle-adaptive-adjudication.ts",
);

const ThresholdsSchema = z.object({
  fastPathOutcomeParityMinimum: z.number().min(0).max(1),
  expansionTriggerPrecisionMinimum: z.number().min(0).max(1),
  expansionTriggerRecallMinimum: z.number().min(0).max(1),
  partialPrefixCorrectnessMinimum: z.number().min(0).max(1),
  causalTraceCompletenessMinimum: z.number().min(0).max(1),
  knownFactContradictionReductionMinimum: z.number().min(0).max(1),
  unsupportedAssertionReductionMinimum: z.number().min(0).max(1),
  budgetDegradationCorrectnessMinimum: z.number().min(0).max(1),
  blindPlausibilityPreferenceRateMinimum: z.number().min(0).max(1),
  blindExplanationScoreDeltaMinimum: z.number(),
  blindJudgmentCoverageMinimum: z.number().min(0).max(1),
  blindOrderConsistencyMinimum: z.number().min(0).max(1),
  p95ShadowLatencyMsMaximum: z.number().positive(),
  adaptiveSourceLinesMaximum: z.number().int().positive(),
  adaptiveExportedDeclarationsMaximum: z.number().int().positive(),
  ordinaryTurnLlmCallsMaximum: z.number().int().nonnegative(),
  expandedTurnAdditionalLlmCallsMaximum: z.number().int().nonnegative(),
}).strict();

const FixtureSchema = z.object({
  schemaVersion: z.literal(1),
  fixtureVersion: z.string().min(1),
  frozenAt: z.string().datetime(),
  deterministicRepetitions: z.number().int().min(1).max(100),
  blindComparisonsPerScenario: z.number().int().min(2).max(10),
  thresholds: ThresholdsSchema,
  scenarios: z.array(z.object({
    id: z.string().min(1),
    runner: z.string().min(1),
    hypothesis: z.string().min(1),
    blindReview: z.boolean(),
    expectedExpandedProposalRefs: z.array(z.string().min(1)),
  }).strict()).min(1),
}).strict();
type FixtureFile = z.infer<typeof FixtureSchema>;

const JudgeResponseSchema = z.object({
  preference: z.enum(["A", "B", "tie", "indeterminate"]),
  plausibilityA: z.number().int().min(1).max(5),
  plausibilityB: z.number().int().min(1).max(5),
  explanationA: z.number().int().min(1).max(5),
  explanationB: z.number().int().min(1).max(5),
  causalClarityA: z.number().int().min(1).max(5),
  causalClarityB: z.number().int().min(1).max(5),
  knownFactContradictionsA: z.number().int().nonnegative().max(20),
  knownFactContradictionsB: z.number().int().nonnegative().max(20),
  unsupportedAssertionsA: z.number().int().nonnegative().max(20),
  unsupportedAssertionsB: z.number().int().nonnegative().max(20),
  reason: z.string().min(1).max(800),
}).strict();
type JudgeResponse = z.infer<typeof JudgeResponseSchema>;

export const ADAPTIVE_ADJUDICATION_JUDGE_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "adaptive_adjudication_blind_review",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "preference", "plausibilityA", "plausibilityB", "explanationA",
        "explanationB", "causalClarityA", "causalClarityB",
        "knownFactContradictionsA", "knownFactContradictionsB",
        "unsupportedAssertionsA", "unsupportedAssertionsB", "reason",
      ],
      properties: {
        preference: { type: "string", enum: ["A", "B", "tie", "indeterminate"] },
        plausibilityA: { type: "integer", minimum: 1, maximum: 5 },
        plausibilityB: { type: "integer", minimum: 1, maximum: 5 },
        explanationA: { type: "integer", minimum: 1, maximum: 5 },
        explanationB: { type: "integer", minimum: 1, maximum: 5 },
        causalClarityA: { type: "integer", minimum: 1, maximum: 5 },
        causalClarityB: { type: "integer", minimum: 1, maximum: 5 },
        knownFactContradictionsA: { type: "integer", minimum: 0, maximum: 20 },
        knownFactContradictionsB: { type: "integer", minimum: 0, maximum: 20 },
        unsupportedAssertionsA: { type: "integer", minimum: 0, maximum: 20 },
        unsupportedAssertionsB: { type: "integer", minimum: 0, maximum: 20 },
        reason: { type: "string" },
      },
    },
  },
};

const JUDGE_SYSTEM = `You are a blinded battle-adjudication reviewer. Candidate A and B are order-randomized. Use only the supplied known facts, timing, rules, action, and outputs. Do not reward verbosity. Prefer the candidate whose result is locally plausible, preserves uncertainty, avoids unsupported claims, and explains action-to-effect and execution-derived costs. A final battle result has no objective oracle, so tie or indeterminate is valid. Return only the required JSON.`;

type Measurement = {
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type AdaptiveAdjudicationJudgeClient = {
  completeJson(input: {
    system: string;
    user: string;
    responseFormat: typeof ADAPTIVE_ADJUDICATION_JUDGE_RESPONSE_FORMAT;
  }): Promise<{ data: unknown; measurement: Measurement }>;
};

type ControlClaim = {
  subjectRef: string;
  predicate: string;
  value?: unknown;
  causalSourceRef?: string;
};

type ControlCandidate = {
  outcome: string;
  explanation: string;
  claims: ControlClaim[];
  costs: Array<{ description: string; sourceStepRef?: string }>;
};

type ExpectedReceipt = {
  proposalRef: string;
  level: 0 | 1 | 2;
  resolution: string;
  outcome: string;
  completedSteps?: string[];
  failedStep?: string;
  failureReason?: string;
  fallbackStrength?: string;
};

type ScenarioData = {
  context: string;
  cases: AdaptiveProposalCase[];
  budget?: AdaptiveAdjudicationBudget;
  control: ControlCandidate;
  expectedReceipts: ExpectedReceipt[];
};

type NormalizedPreference = "adaptive" | "control" | "tie" | "indeterminate";

function fact(input: {
  id: string;
  subjectRef?: string;
  predicate: string;
  value?: unknown;
  strength?: AdaptiveFact["strength"];
  provenance?: AdaptiveFact["provenance"];
}): AdaptiveFact {
  return {
    id: input.id,
    subjectRef: input.subjectRef ?? "character.a",
    predicate: input.predicate,
    ...(Object.prototype.hasOwnProperty.call(input, "value") ? { value: input.value } : {}),
    strength: input.strength ?? "known",
    provenance: input.provenance ?? "canonical",
  };
}

function assertion(id: string, stepRef: string | null, asserted: AdaptiveFact): AdaptiveEffect {
  return {
    id,
    operation: "assert",
    fact: asserted,
    irreversible: true,
    causalSourceRef: stepRef ?? "control:fixture",
    ...(stepRef ? { sourceStepRef: stepRef } : {}),
  };
}

function proposal(input: {
  ref: string;
  actorRef?: string;
  kind: AdaptiveActionKind;
  reasons?: AdaptiveActionProposal["expansionReasons"];
  characterPlan?: boolean;
  worldDetail?: boolean;
}): AdaptiveActionProposal {
  const actorRef = input.actorRef ?? "character.a";
  return {
    proposalRef: input.ref,
    actorRef,
    actionKind: input.kind,
    method: "観測できる手段で対象へ働きかける",
    targetRefs: [actorRef === "character.a" ? "character.b" : "character.a"],
    intent: {
      objective: "現在の不利を増やさず目的を達成する",
      targetRefs: ["subject.counterpart"],
      priorities: ["観測済み状態を優先する"],
      mustPreserve: ["行動可能性"],
      mustAvoid: ["未知能力への依存"],
    },
    characterBasis: {
      observationRefs: [`observation:${input.ref}`],
      psychologyRefs: [`psychology:${actorRef}`],
      experienceRefs: [`experience:${actorRef}`],
    },
    latentPlanHints: { fallback: "成立した地点で停止する" },
    expansionReasons: input.reasons ?? [],
    expansionNeeds: {
      characterPlan: input.characterPlan ?? false,
      worldDetail: input.worldDetail ?? false,
    },
  };
}

function proposalCase(action: AdaptiveActionProposal, facts: AdaptiveFact[] = []): AdaptiveProposalCase {
  return {
    proposal: action,
    facts,
    scopeRefs: ["character.a", "character.b", "object.rope", "object.token", "bridge.1", "area.1"],
    worldExpansions: [],
    fallbackClaims: [],
  };
}

function basis(action: AdaptiveActionProposal): string[] {
  return [
    action.characterBasis.observationRefs[0]!,
    action.characterBasis.psychologyRefs[0]!,
    action.characterBasis.experienceRefs[0]!,
  ];
}

function plan(action: AdaptiveActionProposal, steps: AdaptiveCharacterActionPlan["steps"]): AdaptiveCharacterActionPlan {
  return { proposalRef: action.proposalRef, steps, branches: [], abortConditions: [] };
}

function buildScenario(runner: string): ScenarioData {
  if (runner === "fast_path_parity") {
    const action = proposal({ ref: "proposal.fast", kind: "basic_attack" });
    const c = proposalCase(action);
    const effect = assertion("effect.fast", null, fact({
      id: "fact.fast", subjectRef: "character.b", predicate: "hp.change", value: "minor_loss",
    }));
    c.controlResolution = { source: "control", outcome: "completed", effects: [effect], costs: [] };
    return {
      context: "Aの定義済み通常攻撃。Bは射程内。既存mechanical controlを変更してはならない。",
      cases: [c],
      control: { outcome: "completed", explanation: "既存通常攻撃をそのまま適用", claims: [{ subjectRef: "character.b", predicate: "hp.change", value: "minor_loss", causalSourceRef: "control:fixture" }], costs: [] },
      expectedReceipts: [{ proposalRef: action.proposalRef, level: 0, resolution: "fast", outcome: "completed" }],
    };
  }
  if (runner === "coarse_bounded_resolution") {
    const action = proposal({ ref: "proposal.coarse", kind: "free_action" });
    const c = proposalCase(action);
    c.coarseResolution = { source: "coarse", outcome: "partial", effects: [], costs: [] };
    return {
      context: "単純な自由行動。中間状態も不可逆効果も結果へ影響しない。",
      cases: [c],
      control: { outcome: "partial", explanation: "概要状態のまま部分成功", claims: [], costs: [] },
      expectedReceipts: [{ proposalRef: action.proposalRef, level: 1, resolution: "coarse", outcome: "partial" }],
    };
  }
  if (runner === "partial_prefix_cost") {
    const action = proposal({ ref: "proposal.partial-prefix", kind: "custom", reasons: ["partial_stop_matters", "stage_dependent_cost"], characterPlan: true });
    const reachable = fact({ id: "fact.reachable", predicate: "target.reachable", value: true });
    const grip = fact({ id: "fact.grip", predicate: "target.grip_available", value: false });
    const c = proposalCase(action, [reachable, grip]);
    c.characterPlan = plan(action, [{
      id: "step.approach", description: "対象へ接近", origin: "character_expansion", basisRefs: basis(action),
      preconditions: [{ factRef: reachable.id, operator: "equals", value: true }],
      effects: [assertion("effect.approached", "step.approach", fact({ id: "fact.approached", predicate: "position.approached", value: true, provenance: "character_step" }))],
      costs: [{ id: "cost.exposure", channel: "exposure", description: "接近で露見", sourceStepRef: "step.approach" }], exclusiveClaimRefs: [],
    }, {
      id: "step.grip", description: "対象を掴む", origin: "character_expansion", basisRefs: basis(action),
      preconditions: [{ factRef: grip.id, operator: "equals", value: true }],
      effects: [assertion("effect.held", "step.grip", fact({ id: "fact.held", predicate: "target.held", value: true, provenance: "character_step" }))],
      costs: [{ id: "cost.stamina", channel: "stamina", description: "把持の消耗", sourceStepRef: "step.grip" }], exclusiveClaimRefs: [],
    }]);
    return {
      context: "対象には接近できるが現在は掴めない。接近は露見を伴い、把持だけがstaminaを消費する。",
      cases: [c],
      control: { outcome: "failure", explanation: "掴めなかったので何も起きなかった", claims: [], costs: [] },
      expectedReceipts: [{ proposalRef: action.proposalRef, level: 2, resolution: "expanded", outcome: "partial", completedSteps: ["step.approach"], failedStep: "step.grip", failureReason: "precondition_failed" }],
    };
  }
  if (runner === "simultaneous_exclusive_claim") {
    const make = (side: "a" | "b") => {
      const action = proposal({ ref: `proposal.claim.${side}`, actorRef: `character.${side}`, kind: "custom", reasons: ["simultaneous_conflict"], characterPlan: true });
      const c = proposalCase(action);
      c.characterPlan = plan(action, [{
        id: `step.claim.${side}`, description: "同じtokenを取る", origin: "character_expansion", basisRefs: basis(action), preconditions: [],
        effects: [assertion(`effect.claim.${side}`, `step.claim.${side}`, fact({ id: `fact.claim.${side}`, subjectRef: "object.token", predicate: "held_by", value: `character.${side}`, provenance: "character_step" }))],
        costs: [], exclusiveClaimRefs: ["claim:object.token"],
      }]);
      return c;
    };
    return {
      context: "AとBは同じ時間窓に一つのtokenへ手を伸ばす。速度差や優先ruleはない。",
      cases: [make("a"), make("b")],
      control: { outcome: "A success / B failure", explanation: "根拠なくAを優先", claims: [{ subjectRef: "object.token", predicate: "held_by", value: "character.a" }], costs: [] },
      expectedReceipts: ["a", "b"].map((side) => ({ proposalRef: `proposal.claim.${side}`, level: 2 as const, resolution: "expanded", outcome: "indeterminate", completedSteps: [], failedStep: `step.claim.${side}`, failureReason: "simultaneous_conflict", fallbackStrength: "unknown" })),
    };
  }
  if (runner === "unknown_world_refinement") {
    const action = proposal({ ref: "proposal.world-refine", kind: "custom", reasons: ["unknown_world_state"], worldDetail: true });
    const unknown = fact({ id: "fact.capacity.unknown", subjectRef: "bridge.1", predicate: "load_capacity", value: null, strength: "unknown" });
    const damaged = fact({ id: "fact.integrity", subjectRef: "bridge.1", predicate: "integrity", value: "damaged" });
    const c = proposalCase(action, [unknown, damaged]);
    c.worldExpansions = [{ requestRef: "world.request.capacity", baseFactRef: unknown.id, refinedFact: fact({ id: "fact.capacity.low", subjectRef: "bridge.1", predicate: "load_capacity", value: "low", provenance: "world_expansion" }) }];
    c.coarseResolution = { source: "coarse", outcome: "partial", effects: [], costs: [] };
    return {
      context: "橋のintegrityはdamaged。load_capacityはunknown。局所的なたわみ evidenceからcapacity=lowへ具体化できる。",
      cases: [c],
      control: { outcome: "success", explanation: "橋は無傷で安全なので渡り切る", claims: [{ subjectRef: "bridge.1", predicate: "integrity", value: "intact" }], costs: [] },
      expectedReceipts: [{ proposalRef: action.proposalRef, level: 2, resolution: "expanded", outcome: "partial" }],
    };
  }
  if (runner === "invented_tactic_rejection") {
    const action = proposal({ ref: "proposal.invented", kind: "custom", reasons: ["irreversible_effect"], characterPlan: true });
    const c = proposalCase(action, [fact({ id: "fact.machine.off", subjectRef: "machine.outside", predicate: "powered", value: false })]);
    c.characterPlan = plan(action, [{
      id: "step.invented", description: "未観測machineを起動", origin: "character_expansion", basisRefs: basis(action), preconditions: [],
      effects: [assertion("effect.invented", "step.invented", fact({ id: "fact.machine.on", subjectRef: "machine.outside", predicate: "powered", value: true, provenance: "character_step" }))], costs: [], exclusiveClaimRefs: [],
    }]);
    return {
      context: "machine.outsideはinteraction scope外でpowered=false。キャラクターはその装置を観測していない。",
      cases: [c],
      control: { outcome: "success", explanation: "都合よく外部machineを起動して勝つ", claims: [{ subjectRef: "machine.outside", predicate: "powered", value: true }], costs: [] },
      expectedReceipts: [{ proposalRef: action.proposalRef, level: 2, resolution: "degraded", outcome: "indeterminate", failureReason: "invalid_character_plan", fallbackStrength: "unknown" }],
    };
  }
  if (runner === "budget_degradation") {
    const action = proposal({ ref: "proposal.budget", kind: "custom", reasons: ["partial_stop_matters"], characterPlan: true });
    const restrained = fact({ id: "fact.restrained", subjectRef: "character.a", predicate: "restrained", value: true });
    const c = proposalCase(action, [restrained]);
    c.fallbackClaims = [fact({ id: "fact.escape.partial", subjectRef: "character.a", predicate: "escape_progress", value: "partial", strength: "intermediate", provenance: "intermediate_fallback" })];
    c.characterPlan = plan(action, [{ id: "step.escape", description: "拘束から抜ける", origin: "character_expansion", basisRefs: basis(action), preconditions: [], effects: [], costs: [], exclusiveClaimRefs: [] }]);
    return {
      context: "Aはrestrained=true。詳細化予算は0。勝敗を確定せず最も強い安全なfallbackを使う。",
      cases: [c], budget: { ...DEFAULT_ADAPTIVE_ADJUDICATION_BUDGET, maxPlanningExpansions: 0 },
      control: { outcome: "success", explanation: "詳細なしに完全脱出を確定", claims: [{ subjectRef: "character.a", predicate: "restrained", value: false }], costs: [] },
      expectedReceipts: [{ proposalRef: action.proposalRef, level: 2, resolution: "degraded", outcome: "indeterminate", failureReason: "budget_exhausted", fallbackStrength: "intermediate" }],
    };
  }
  throw new Error(`unknown adaptive evaluation runner: ${runner}`);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonicalize(nested)]));
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : round(numerator / denominator);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return round(sorted[Math.max(0, Math.ceil(sorted.length * p / 100) - 1)]!);
}

function slot(value: { subjectRef: string; predicate: string }): string {
  return `${value.subjectRef}\u0000${value.predicate}`;
}

function knownContradictions(claims: ControlClaim[], facts: AdaptiveFact[]): number {
  const known = new Map(facts.filter((item) => item.strength === "known").map((item) => [slot(item), item.value]));
  return claims.filter((claim) => known.has(slot(claim)) && digest(known.get(slot(claim))) !== digest(claim.value)).length;
}

function unsupportedClaims(claims: ControlClaim[], scopeRefs: string[]): number {
  const scope = new Set(scopeRefs);
  return claims.filter((claim) => !scope.has(claim.subjectRef) || !claim.causalSourceRef).length;
}

function adaptiveClaims(result: AdaptiveAdjudicationBatchResult): ControlClaim[] {
  return result.receipts.flatMap((receipt) => [
    ...receipt.effects.flatMap((effect) => effect.fact ? [{ subjectRef: effect.fact.subjectRef, predicate: effect.fact.predicate, value: effect.fact.value, causalSourceRef: effect.causalSourceRef }] : []),
    ...receipt.refinedFacts.map((item) => ({ subjectRef: item.subjectRef, predicate: item.predicate, value: item.value, causalSourceRef: "world_expansion" })),
    ...(receipt.fallbackFact ? [{ subjectRef: receipt.fallbackFact.subjectRef, predicate: receipt.fallbackFact.predicate, value: receipt.fallbackFact.value, causalSourceRef: receipt.fallbackFact.provenance }] : []),
  ]);
}

function receiptMatches(receipt: AdaptiveAdjudicationBatchResult["receipts"][number], expected: ExpectedReceipt): boolean {
  return receipt.proposalRef === expected.proposalRef && receipt.level === expected.level && receipt.resolution === expected.resolution && receipt.outcome === expected.outcome &&
    (expected.completedSteps === undefined || digest(receipt.completedSteps) === digest(expected.completedSteps)) &&
    (expected.failedStep === undefined || receipt.failedStep === expected.failedStep) &&
    (expected.failureReason === undefined || receipt.failureReason === expected.failureReason) &&
    (expected.fallbackStrength === undefined || receipt.fallbackFact?.strength === expected.fallbackStrength);
}

function candidateSummary(result: AdaptiveAdjudicationBatchResult): string {
  return JSON.stringify(result.receipts.map((receipt) => ({
    proposal: receipt.proposalRef,
    outcome: receipt.outcome,
    completedSteps: receipt.completedSteps,
    failedStep: receipt.failedStep ?? null,
    effects: receipt.effects.map((effect) => effect.fact ? `${effect.fact.subjectRef}.${effect.fact.predicate}=${JSON.stringify(effect.fact.value)}` : `retract:${effect.factRef}`),
    costs: receipt.costs.map((cost) => `${cost.description} (from ${cost.sourceStepRef})`),
    refinedFacts: receipt.refinedFacts.map((item) => `${item.subjectRef}.${item.predicate}=${JSON.stringify(item.value)}`),
    fallback: receipt.fallbackFact ? `${receipt.fallbackFact.predicate}=${JSON.stringify(receipt.fallbackFact.value)} (${receipt.fallbackFact.strength})` : null,
    reason: receipt.failureReason ?? null,
  })), null, 2);
}

function controlSummary(control: ControlCandidate): string {
  return JSON.stringify(control, null, 2);
}

function normalizePreference(preference: JudgeResponse["preference"], adaptiveIsA: boolean): NormalizedPreference {
  if (preference === "tie" || preference === "indeterminate") return preference;
  return (preference === "A") === adaptiveIsA ? "adaptive" : "control";
}

export async function evaluateBattleAdaptiveAdjudicationPoc(input: {
  fixturePath?: string;
  repetitions?: number;
  judgeClient?: AdaptiveAdjudicationJudgeClient;
  provider?: string;
  model?: string;
  now?: () => Date;
} = {}) {
  const fixturePath = path.resolve(input.fixturePath ?? defaultFixturePath);
  const fixtureText = await fs.readFile(fixturePath, "utf8");
  const fixture = FixtureSchema.parse(JSON.parse(fixtureText));
  const repetitions = input.repetitions ?? fixture.deterministicRepetitions;
  const scenarioReports = [];
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  let prefixMatched = 0;
  let prefixTotal = 0;
  let fastMatched = 0;
  let fastTotal = 0;
  let budgetMatched = 0;
  let budgetTotal = 0;
  let sourceMutationCount = 0;
  let canonicalCommitCount = 0;
  let schemaFailureCount = 0;
  let inventedTacticCount = 0;
  let processDerivedCostViolationCount = 0;
  let controlContradictions = 0;
  let adaptiveContradictions = 0;
  let controlUnsupported = 0;
  let adaptiveUnsupported = 0;
  let causalClaims = 0;
  let tracedClaims = 0;
  const allLatencies: number[] = [];
  const blindPackets: Array<{ scenarioId: string; context: string; control: string; adaptive: string }> = [];

  for (const fixtureScenario of fixture.scenarios) {
    const scenario = buildScenario(fixtureScenario.runner);
    const originalDigest = digest({ cases: scenario.cases, budget: scenario.budget });
    const runs = [];
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const started = performance.now();
      let result: AdaptiveAdjudicationBatchResult;
      try {
        result = AdaptiveAdjudicationBatchResultSchema.parse(adjudicateAdaptiveBattleProposals({ cases: scenario.cases, ...(scenario.budget ? { budget: scenario.budget } : {}) }));
      } catch (error) {
        schemaFailureCount += 1;
        throw error;
      }
      const latencyMs = round(performance.now() - started);
      allLatencies.push(latencyMs);
      if (digest({ cases: scenario.cases, budget: scenario.budget }) !== originalDigest || result.sourceMutated) sourceMutationCount += 1;
      if (result.canonicalCommitPerformed) canonicalCommitCount += 1;
      const claims = adaptiveClaims(result);
      const facts = scenario.cases.flatMap((item) => item.facts);
      const scope = [...new Set(scenario.cases.flatMap((item) => item.scopeRefs))];
      if (repetition === 1) {
        controlContradictions += knownContradictions(scenario.control.claims, facts);
        adaptiveContradictions += knownContradictions(claims, facts);
        controlUnsupported += unsupportedClaims(scenario.control.claims, scope);
        adaptiveUnsupported += unsupportedClaims(claims, scope);
        inventedTacticCount += claims.filter((claim) => !scope.includes(claim.subjectRef)).length;
        causalClaims += result.receipts.reduce((sum, receipt) => sum + receipt.effects.length + receipt.costs.length + receipt.refinedFacts.length, 0);
        tracedClaims += result.receipts.reduce((sum, receipt) => sum + receipt.effects.filter((effect) => Boolean(effect.causalSourceRef)).length + receipt.costs.filter((cost) => receipt.completedSteps.includes(cost.sourceStepRef)).length + receipt.refinedFacts.filter((item) => item.provenance === "world_expansion").length, 0);
        processDerivedCostViolationCount += result.receipts.flatMap((receipt) => receipt.costs.filter((cost) => !receipt.completedSteps.includes(cost.sourceStepRef))).length;
        const actualExpanded = new Set(result.receipts.filter((receipt) => receipt.level === 2).map((receipt) => receipt.proposalRef));
        const expectedExpanded = new Set(fixtureScenario.expectedExpandedProposalRefs);
        for (const receipt of result.receipts) {
          const expected = expectedExpanded.has(receipt.proposalRef);
          const actual = actualExpanded.has(receipt.proposalRef);
          if (expected && actual) truePositive += 1;
          else if (!expected && actual) falsePositive += 1;
          else if (expected) falseNegative += 1;
          else trueNegative += 1;
        }
        for (const expected of scenario.expectedReceipts) {
          const receipt = result.receipts.find((item) => item.proposalRef === expected.proposalRef);
          if (expected.level === 0) {
            fastTotal += 1;
            if (receipt && receiptMatches(receipt, expected)) fastMatched += 1;
          }
          if (fixtureScenario.id === "partial_prefix_cost") {
            prefixTotal += 1;
            if (receipt && receiptMatches(receipt, expected) && receipt.costs.map((cost) => cost.id).join() === "cost.exposure") prefixMatched += 1;
          }
          if (fixtureScenario.id === "budget_degradation") {
            budgetTotal += 1;
            if (receipt && receiptMatches(receipt, expected)) budgetMatched += 1;
          }
        }
        if (fixtureScenario.blindReview) blindPackets.push({ scenarioId: fixtureScenario.id, context: scenario.context, control: controlSummary(scenario.control), adaptive: candidateSummary(result) });
      }
      runs.push({ repetition, latencyMs, result });
    }
    scenarioReports.push({ id: fixtureScenario.id, hypothesis: fixtureScenario.hypothesis, runs, distinctResultDigests: new Set(runs.map((run) => digest(run.result))).size });
  }

  const judgeSamples: Array<{ scenarioId: string; repetition: number; adaptiveIsA: boolean; response: JudgeResponse | null; normalizedPreference: NormalizedPreference; measurement: Measurement; error: string | null }> = [];
  if (input.judgeClient) {
    const jobs = blindPackets.flatMap((packet) => Array.from({ length: fixture.blindComparisonsPerScenario }, (_, index) => ({ packet, repetition: index + 1, adaptiveIsA: index % 2 === 0 })));
    for (let offset = 0; offset < jobs.length; offset += 4) {
      const batch = jobs.slice(offset, offset + 4);
      judgeSamples.push(...await Promise.all(batch.map(async ({ packet, repetition, adaptiveIsA }) => {
        const user = [`Context:\n${packet.context}`, `Candidate A:\n${adaptiveIsA ? packet.adaptive : packet.control}`, `Candidate B:\n${adaptiveIsA ? packet.control : packet.adaptive}`].join("\n\n");
        const started = Date.now();
        try {
          const completed = await input.judgeClient!.completeJson({ system: JUDGE_SYSTEM, user, responseFormat: ADAPTIVE_ADJUDICATION_JUDGE_RESPONSE_FORMAT });
          const response = JudgeResponseSchema.parse(completed.data);
          return { scenarioId: packet.scenarioId, repetition, adaptiveIsA, response, normalizedPreference: normalizePreference(response.preference, adaptiveIsA), measurement: completed.measurement, error: null };
        } catch (error) {
          return { scenarioId: packet.scenarioId, repetition, adaptiveIsA, response: null, normalizedPreference: "indeterminate" as const, measurement: { latencyMs: Date.now() - started, inputTokens: null, outputTokens: null, totalTokens: null }, error: (error instanceof Error ? error.message : String(error)).slice(0, 500) };
        }
      })));
    }
  }

  const validJudgments = judgeSamples.filter((sample) => sample.response && sample.normalizedPreference !== "indeterminate");
  const adaptiveWins = validJudgments.filter((sample) => sample.normalizedPreference === "adaptive").length;
  const controlWins = validJudgments.filter((sample) => sample.normalizedPreference === "control").length;
  const ties = validJudgments.filter((sample) => sample.normalizedPreference === "tie").length;
  const preferenceShare = validJudgments.length === 0 ? null : round((adaptiveWins + ties * 0.5) / validJudgments.length);
  const score = (sample: typeof judgeSamples[number], keyA: "explanationA", keyB: "explanationB", adaptive: boolean) => sample.response ? sample.response[adaptive === sample.adaptiveIsA ? keyA : keyB] : null;
  const adaptiveExplanation = validJudgments.map((sample) => score(sample, "explanationA", "explanationB", true)!).reduce((a, b) => a + b, 0);
  const controlExplanation = validJudgments.map((sample) => score(sample, "explanationA", "explanationB", false)!).reduce((a, b) => a + b, 0);
  const explanationDelta = validJudgments.length === 0 ? null : round((adaptiveExplanation - controlExplanation) / validJudgments.length);
  let orderPairs = 0;
  let consistentPairs = 0;
  for (const packet of blindPackets) {
    const rows = judgeSamples.filter((sample) => sample.scenarioId === packet.scenarioId).sort((a, b) => a.repetition - b.repetition);
    for (let index = 0; index + 1 < rows.length; index += 2) {
      orderPairs += 1;
      if (rows[index]!.normalizedPreference === rows[index + 1]!.normalizedPreference) consistentPairs += 1;
    }
  }
  const thresholds = fixture.thresholds;
  const precision = ratio(truePositive, truePositive + falsePositive);
  const recall = ratio(truePositive, truePositive + falseNegative);
  const contradictionReduction = controlContradictions === 0 ? (adaptiveContradictions === 0 ? 1 : 0) : round((controlContradictions - adaptiveContradictions) / controlContradictions);
  const unsupportedReduction = controlUnsupported === 0 ? (adaptiveUnsupported === 0 ? 1 : 0) : round((controlUnsupported - adaptiveUnsupported) / controlUnsupported);
  const sourceText = await fs.readFile(adaptiveSourcePath, "utf8");
  const sourceLines = sourceText.split("\n").length;
  const exportedDeclarations = (sourceText.match(/^export (?:const|type|function|class|interface) /gm) ?? []).length;
  const runtimeIntegrationRefCount = ["backend/src/services", "frontend/src", "infra"].reduce((sum, target) => {
    try {
      const output = execFileSync("rg", ["-l", "adjudicateAdaptiveBattleProposals", target], { cwd: repositoryRoot, encoding: "utf8" }).trim();
      return sum + (output ? output.split("\n").length : 0);
    } catch { return sum; }
  }, 0);
  const hardPass = schemaFailureCount === 0 && sourceMutationCount === 0 && canonicalCommitCount === 0 && inventedTacticCount === 0 && processDerivedCostViolationCount === 0 && runtimeIntegrationRefCount === 0 && ratio(fastMatched, fastTotal) >= thresholds.fastPathOutcomeParityMinimum;
  const deterministicPass = precision >= thresholds.expansionTriggerPrecisionMinimum && recall >= thresholds.expansionTriggerRecallMinimum && ratio(prefixMatched, prefixTotal) >= thresholds.partialPrefixCorrectnessMinimum && ratio(tracedClaims, causalClaims) >= thresholds.causalTraceCompletenessMinimum && contradictionReduction >= thresholds.knownFactContradictionReductionMinimum && unsupportedReduction >= thresholds.unsupportedAssertionReductionMinimum && ratio(budgetMatched, budgetTotal) >= thresholds.budgetDegradationCorrectnessMinimum;
  const judgeCoverage = ratio(validJudgments.length, blindPackets.length * fixture.blindComparisonsPerScenario);
  const orderConsistency = ratio(consistentPairs, orderPairs);
  const semanticMeasured = Boolean(input.judgeClient);
  const semanticPass = semanticMeasured && preferenceShare !== null && explanationDelta !== null && preferenceShare >= thresholds.blindPlausibilityPreferenceRateMinimum && explanationDelta >= thresholds.blindExplanationScoreDeltaMinimum && judgeCoverage >= thresholds.blindJudgmentCoverageMinimum && orderConsistency >= thresholds.blindOrderConsistencyMinimum;
  const costPass = percentile(allLatencies, 95) <= thresholds.p95ShadowLatencyMsMaximum && sourceLines <= thresholds.adaptiveSourceLinesMaximum && exportedDeclarations <= thresholds.adaptiveExportedDeclarationsMaximum;
  const label = !hardPass ? "unsupported" : !semanticMeasured || judgeCoverage < thresholds.blindJudgmentCoverageMinimum ? "indeterminate" : deterministicPass && semanticPass && costPass ? "supported" : "revise";
  return {
    schemaVersion: 1,
    fixtureVersion: fixture.fixtureVersion,
    generatedAt: (input.now?.() ?? new Date()).toISOString(),
    mode: "adaptive_adjudication_shadow_evaluation",
    provenance: { gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim(), workingTreeDirty: execFileSync("git", ["status", "--porcelain"], { cwd: repositoryRoot, encoding: "utf8" }).trim().length > 0, nodeVersion: process.version, fixturePath: path.relative(repositoryRoot, fixturePath), fixtureSha256: createHash("sha256").update(fixtureText).digest("hex"), evaluatorPath: path.relative(repositoryRoot, fileURLToPath(import.meta.url)), evaluatorSha256: createHash("sha256").update(await fs.readFile(fileURLToPath(import.meta.url))).digest("hex"), adaptiveSourceSha256: createHash("sha256").update(sourceText).digest("hex") },
    execution: { deterministicRepetitions: repetitions, scenarioCount: fixture.scenarios.length, shadowExternalLlmCalls: 0, modeledOrdinaryTurnLlmCalls: 3, modeledExpandedTurnAdditionalLlmCallsMaximum: 2, generationTokensMeasured: false, generationLatencyMeasured: false, judgeProvider: input.provider ?? null, judgeModel: input.model ?? null, judgeCalls: judgeSamples.length, judgeCallErrors: judgeSamples.filter((sample) => sample.error).length, judgeInputTokens: judgeSamples.reduce((sum, sample) => sum + (sample.measurement.inputTokens ?? 0), 0), judgeOutputTokens: judgeSamples.reduce((sum, sample) => sum + (sample.measurement.outputTokens ?? 0), 0), judgeTotalTokens: judgeSamples.reduce((sum, sample) => sum + (sample.measurement.totalTokens ?? 0), 0), judgeLatencyMs: { mean: judgeSamples.length ? round(judgeSamples.reduce((sum, sample) => sum + sample.measurement.latencyMs, 0) / judgeSamples.length) : null, p95: judgeSamples.length ? percentile(judgeSamples.map((sample) => sample.measurement.latencyMs), 95) : null } },
    thresholds,
    scenarios: scenarioReports,
    judgeSamples,
    aggregate: { schemaFailureCount, sourceMutationCount, canonicalCommitCount, runtimeIntegrationRefCount, inventedTacticCount, processDerivedCostViolationCount, fastPathOutcomeParity: ratio(fastMatched, fastTotal), expansionTriggerPrecision: precision, expansionTriggerRecall: recall, partialPrefixCorrectness: ratio(prefixMatched, prefixTotal), causalTraceCompleteness: ratio(tracedClaims, causalClaims), controlKnownFactContradictions: controlContradictions, adaptiveKnownFactContradictions: adaptiveContradictions, knownFactContradictionReduction: contradictionReduction, controlUnsupportedAssertions: controlUnsupported, adaptiveUnsupportedAssertions: adaptiveUnsupported, unsupportedAssertionReduction: unsupportedReduction, budgetDegradationCorrectness: ratio(budgetMatched, budgetTotal), blindAdaptivePreferenceShare: preferenceShare, blindExplanationScoreDelta: explanationDelta, blindJudgmentCoverage: judgeCoverage, blindOrderConsistency: orderConsistency, p95ShadowLatencyMs: percentile(allLatencies, 95), adaptiveSourceLines: sourceLines, adaptiveExportedDeclarations: exportedDeclarations, allResultsStable: scenarioReports.every((scenario) => scenario.distinctResultDigests === 1), hardInvariantsPass: hardPass, deterministicEffectivenessPass: deterministicPass, semanticProxyPass: semanticPass, costAndComplexityPass: costPass },
    decision: { label, scope: "frozen shadow adaptive mechanism only", reasons: [hardPass ? "All frozen hard invariants passed." : "At least one hard invariant failed.", deterministicPass ? "Deterministic effectiveness thresholds passed." : "A deterministic effectiveness threshold missed.", semanticPass ? "The blinded semantic proxy passed." : semanticMeasured ? "The blinded semantic proxy missed or lacked stable coverage." : "Blinded semantic evidence was not executed.", costPass ? "Shadow cost and complexity ceilings passed." : "A cost or complexity ceiling missed."], boundedRevisionHypotheses: label === "revise" ? ["Inspect scenario-level judge disagreement before changing any fixture or threshold.", "Add a separately frozen character-plan generation experiment before runtime integration."] : [] },
    limitations: ["The judge is a semantic proxy and cannot establish an objectively correct final battle result.", "Character plans, coarse outcomes, and world refinements are pre-authored fixtures.", "Generation tokens and expanded-path production latency are not measured; judge cost is reported separately.", "No runtime, canonical commit, persistence, provider ordering, release, or deployment behavior is changed."],
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let provider = "";
  let model = "";
  let output = "";
  let execute = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--execute") { execute = true; continue; }
    const value = args[index + 1];
    if (!value) throw new Error(`missing value for ${arg}`);
    if (arg === "--provider") provider = value;
    else if (arg === "--model") model = value;
    else if (arg === "--output") output = value;
    else throw new Error(`unknown argument ${arg}`);
    index += 1;
  }
  let judgeClient: AdaptiveAdjudicationJudgeClient | undefined;
  if (execute) {
    if (provider !== "xai") throw new Error("this frozen evaluation permits only --provider xai");
    if (!config.xai.apiKey) throw new Error("XAI_API_KEY is not configured");
    model ||= config.xai.modelFast;
    const client = new OpenAI({ apiKey: config.xai.apiKey, baseURL: config.xai.baseUrl, timeout: 45_000, maxRetries: 0 });
    judgeClient = { async completeJson(request) {
      const started = Date.now();
      const response = await client.chat.completions.create({ model, messages: [{ role: "system", content: request.system }, { role: "user", content: request.user }], temperature: 0, response_format: request.responseFormat });
      return { data: JSON.parse(response.choices[0]?.message?.content ?? "{}"), measurement: { latencyMs: Date.now() - started, inputTokens: response.usage?.prompt_tokens ?? null, outputTokens: response.usage?.completion_tokens ?? null, totalTokens: response.usage?.total_tokens ?? null } };
    } };
  }
  const report = await evaluateBattleAdaptiveAdjudicationPoc({ ...(judgeClient ? { judgeClient, provider, model } : {}) });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output) await fs.writeFile(path.resolve(repositoryRoot, output), serialized, { encoding: "utf8", flag: "wx" });
  else process.stdout.write(serialized);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
