import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { z } from "zod";
import {
  WorldProcessPocResultSchema,
  evaluateWorldProcessesPoc,
  type ActiveWorldProcess,
  type ConsistencyFactRow,
  type ConsistencySlice,
  type WorldProcessConcretization,
  type WorldProcessKind,
  type WorldProcessPocResult,
  type WorldTimelineCharacterProposal,
} from "@kshiai/shared";
import { config } from "../config.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaultFixturePath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-world-process-fixtures-v1.json",
);
const worldSourcePath = path.join(
  repositoryRoot,
  "packages/shared/src/battle-world-process-poc.ts",
);

const ThresholdsSchema = z.object({
  expectedProgressionRecallMinimum: z.number().min(0).max(1),
  triggerDecisionPrecisionMinimum: z.number().min(0).max(1),
  triggerDecisionRecallMinimum: z.number().min(0).max(1),
  propagationCoverageMinimum: z.number().min(0).max(1),
  conflictHandlingCorrectnessMinimum: z.number().min(0).max(1),
  causalTraceCompletenessMinimum: z.number().min(0).max(1),
  baselineProgressionGainMinimum: z.number().min(0).max(1),
  sideSwapSymmetryMinimum: z.number().min(0).max(1),
  sameBucketAtomicityMinimum: z.number().min(0).max(1),
  terminalBehaviorCorrectnessMinimum: z.number().min(0).max(1),
  unsupportedEnvironmentalInventionsMaximum: z.number().int().nonnegative(),
  blindActivePreferenceShareMinimum: z.number().min(0).max(1),
  blindPlausibilityScoreDeltaMinimum: z.number(),
  blindContinuityScoreDeltaMinimum: z.number(),
  blindJudgmentCoverageMinimum: z.number().min(0).max(1),
  blindOrderConsistencyMinimum: z.number().min(0).max(1),
  p95ShadowLatencyMsMaximum: z.number().positive(),
  worldSourceLinesMaximum: z.number().int().positive(),
  worldExportedDeclarationsMaximum: z.number().int().positive(),
  ordinaryTurnLlmCallsMaximum: z.number().int().nonnegative(),
  worldProcessAdditionalLlmCallsMaximum: z.number().int().nonnegative(),
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
  }).strict()).min(1),
}).strict();

const JudgeResponseSchema = z.object({
  preference: z.enum(["A", "B", "tie", "indeterminate"]),
  plausibilityA: z.number().int().min(1).max(5),
  plausibilityB: z.number().int().min(1).max(5),
  continuityA: z.number().int().min(1).max(5),
  continuityB: z.number().int().min(1).max(5),
  causalClarityA: z.number().int().min(1).max(5),
  causalClarityB: z.number().int().min(1).max(5),
  unsupportedInventionsA: z.number().int().nonnegative().max(20),
  unsupportedInventionsB: z.number().int().nonnegative().max(20),
  reason: z.string().min(1).max(800),
}).strict();
type JudgeResponse = z.infer<typeof JudgeResponseSchema>;

export const WORLD_PROCESS_JUDGE_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "world_process_blind_review",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "preference",
        "plausibilityA",
        "plausibilityB",
        "continuityA",
        "continuityB",
        "causalClarityA",
        "causalClarityB",
        "unsupportedInventionsA",
        "unsupportedInventionsB",
        "reason",
      ],
      properties: {
        preference: {
          type: "string",
          enum: ["A", "B", "tie", "indeterminate"],
        },
        plausibilityA: { type: "integer", minimum: 1, maximum: 5 },
        plausibilityB: { type: "integer", minimum: 1, maximum: 5 },
        continuityA: { type: "integer", minimum: 1, maximum: 5 },
        continuityB: { type: "integer", minimum: 1, maximum: 5 },
        causalClarityA: { type: "integer", minimum: 1, maximum: 5 },
        causalClarityB: { type: "integer", minimum: 1, maximum: 5 },
        unsupportedInventionsA: { type: "integer", minimum: 0, maximum: 20 },
        unsupportedInventionsB: { type: "integer", minimum: 0, maximum: 20 },
        reason: { type: "string" },
      },
    },
  },
};

const JUDGE_SYSTEM = `You are a blinded battle-world continuity reviewer. Candidate A and B are order-randomized. Use only the supplied process state, trigger facts, rules, targets, character claims, and temporal windows. Do not reward verbosity or the mere presence of a process. Prefer the candidate whose result is locally plausible, preserves environmental continuity, stops on genuine same-window conflicts, avoids unsupported inventions, and exposes a clear trigger-to-effect causal chain. A final battle result has no objective oracle, so tie or indeterminate is valid. Return only the required JSON.`;

type Measurement = {
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type WorldProcessJudgeClient = {
  completeJson(input: {
    system: string;
    user: string;
    responseFormat: typeof WORLD_PROCESS_JUDGE_RESPONSE_FORMAT;
  }): Promise<{ data: unknown; measurement: Measurement }>;
};

type FactInput = {
  id: string;
  subjectRef: string;
  predicate: string;
  value?: unknown;
  unknown?: boolean;
};

type ScenarioExpectation = {
  proposedProcessRefs: string[];
  completedEffectSlots: string[];
  proposedEffectSlots: string[];
  propagationEffectSlots: string[];
  rejectedReasons: Record<string, string>;
  contestedClaimRefs: string[];
  conflictChecked: boolean;
  sameBucketChecked: boolean;
  terminalChecked: boolean;
  sideSwapChecked: boolean;
};

type ScenarioData = {
  context: string;
  slice: ConsistencySlice;
  activeProcesses: ActiveWorldProcess[];
  characterProposals: WorldTimelineCharacterProposal[];
  concretizations?: WorldProcessConcretization[];
  swappedCharacterProposals?: WorldTimelineCharacterProposal[];
  expected: ScenarioExpectation;
};

type NormalizedPreference =
  | "active"
  | "control"
  | "tie"
  | "indeterminate";

const turnWindow = {
  fromTurn: 4,
  toTurn: 4,
  phase: "execution" as const,
};

const rules: Record<WorldProcessKind, string> = {
  fire: "world-process.fire.v1",
  collapse: "world-process.collapse.v1",
  fall: "world-process.fall.v1",
  spread: "world-process.spread.v1",
  support_loss: "world-process.support-loss.v1",
};

function projection(
  facts: FactInput[],
  entityRefs: string[],
  applicableRuleRefs = Object.values(rules),
): ConsistencySlice {
  return {
    schemaVersion: 2,
    purpose: "world_process",
    scope: {
      anchorRefs: ["area.1"],
      entityRefs: [...new Set([
        ...facts.map((fact) => fact.subjectRef),
        ...entityRefs,
      ])],
      processRefs: [],
      traversedKinds: ["process_propagation", "causal_dependency"],
      temporalWindow: turnWindow,
      truncated: false,
      omitted: { entities: 0, facts: 0, rules: 0, historyTurns: 0 },
    },
    factGroups: facts.map((fact) => ({
      subjectRef: fact.subjectRef,
      facts: [(
        fact.unknown
          ? [fact.id, fact.predicate, null, 4, null, "world"]
          : [fact.id, fact.predicate, null, 4, null, "world", fact.value]
      ) as ConsistencyFactRow],
    })),
    causalLinks: [],
    issues: [],
    applicableRuleRefs,
  };
}

function worldProcess(input: {
  ref: string;
  kind: WorldProcessKind;
  targets: string[];
  triggerFactRefs: string[];
  active?: boolean;
}): ActiveWorldProcess {
  return {
    processRef: input.ref,
    processKind: input.kind,
    sourceRefs: [`source:${input.ref}`],
    targetRefs: input.targets,
    triggerFactRefs: input.triggerFactRefs,
    timing: turnWindow,
    active: input.active ?? true,
  };
}

function character(
  actorRef: string,
  exclusiveClaimRefs: string[],
  timing = turnWindow,
): WorldTimelineCharacterProposal {
  return {
    proposalRef: `character-proposal:${actorRef}:${timing.fromTurn}`,
    actorRef,
    timing,
    exclusiveClaimRefs,
  };
}

function effectSlot(
  targetRef: string,
  predicate: string,
  value: unknown,
): string {
  return `${targetRef}|${predicate}|${JSON.stringify(canonicalize(value))}`;
}

function emptyExpectation(
  input: Partial<ScenarioExpectation> = {},
): ScenarioExpectation {
  return {
    proposedProcessRefs: [],
    completedEffectSlots: [],
    proposedEffectSlots: [],
    propagationEffectSlots: [],
    rejectedReasons: {},
    contestedClaimRefs: [],
    conflictChecked: false,
    sameBucketChecked: false,
    terminalChecked: false,
    sideSwapChecked: false,
    ...input,
  };
}

function buildScenario(runner: string): ScenarioData {
  if (runner === "active_fire_progression") {
    const slot = effectSlot("area.1", "area.fire", "burning");
    return {
      context: "Turn 4 execution. fire.1 is active because fact.fire.active says fire.state=active. Rule world-process.fire.v1 changes only area.1 area.fire to burning. area.1 was previously safe.",
      slice: projection([{
        id: "fact.fire.active",
        subjectRef: "source.fire",
        predicate: "fire.state",
        value: "active",
      }, {
        id: "fact.area.safe",
        subjectRef: "area.1",
        predicate: "area.fire",
        value: "safe",
      }], ["area.1"]),
      activeProcesses: [worldProcess({
        ref: "fire.1",
        kind: "fire",
        targets: ["area.1"],
        triggerFactRefs: ["fact.fire.active"],
      })],
      characterProposals: [],
      expected: emptyExpectation({
        proposedProcessRefs: ["fire.1"],
        completedEffectSlots: [slot],
        proposedEffectSlots: [slot],
      }),
    };
  }
  if (runner === "support_loss_progression") {
    const slot = effectSlot(
      "bridge.1",
      "structure.stability",
      "unstable",
    );
    return {
      context: "Turn 4 execution. support.1 has recorded support.state=lost for bridge.1. Rule world-process.support-loss.v1 changes only bridge.1 structure.stability to unstable. The bridge was stable.",
      slice: projection([{
        id: "fact.support.lost",
        subjectRef: "support.1",
        predicate: "support.state",
        value: "lost",
      }, {
        id: "fact.bridge.stable",
        subjectRef: "bridge.1",
        predicate: "structure.stability",
        value: "stable",
      }], ["bridge.1"]),
      activeProcesses: [worldProcess({
        ref: "support-loss.1",
        kind: "support_loss",
        targets: ["bridge.1"],
        triggerFactRefs: ["fact.support.lost"],
      })],
      characterProposals: [],
      expected: emptyExpectation({
        proposedProcessRefs: ["support-loss.1"],
        completedEffectSlots: [slot],
        proposedEffectSlots: [slot],
      }),
    };
  }
  if (runner === "multi_target_smoke_propagation") {
    const slots = [
      effectSlot("area.2", "area.smoke", "spreading"),
      effectSlot("area.3", "area.smoke", "spreading"),
    ];
    return {
      context: "Turn 4 execution. spread.1 is active from fact.spread.active and has exactly two reachable targets, area.2 and area.3. Rule world-process.spread.v1 changes area.smoke to spreading for those targets only.",
      slice: projection([{
        id: "fact.spread.active",
        subjectRef: "source.spread",
        predicate: "spread.state",
        value: "active",
      }], ["area.2", "area.3"]),
      activeProcesses: [worldProcess({
        ref: "spread.1",
        kind: "spread",
        targets: ["area.2", "area.3"],
        triggerFactRefs: ["fact.spread.active"],
      })],
      characterProposals: [],
      expected: emptyExpectation({
        proposedProcessRefs: ["spread.1"],
        completedEffectSlots: slots,
        proposedEffectSlots: slots,
        propagationEffectSlots: slots,
      }),
    };
  }
  if (
    runner === "same_window_character_conflict" ||
    runner === "side_swap_symmetry"
  ) {
    const claim = "state:character.a:actor.posture";
    const slot = effectSlot("character.a", "actor.posture", "fallen");
    const primary = character("character.a", [claim]);
    return {
      context: "Turn 4 execution. fall.1 is active and would make character.a fallen. A character proposal in the same execution bucket claims the same character.a actor.posture state. No side or array-position priority is supplied.",
      slice: projection([{
        id: "fact.fall.active",
        subjectRef: "source.fall",
        predicate: "fall.state",
        value: "active",
      }], ["character.a", "character.b"]),
      activeProcesses: [worldProcess({
        ref: "fall.1",
        kind: "fall",
        targets: ["character.a"],
        triggerFactRefs: ["fact.fall.active"],
      })],
      characterProposals: [primary],
      ...(runner === "side_swap_symmetry"
        ? { swappedCharacterProposals: [character("character.b", [claim])] }
        : {}),
      expected: emptyExpectation({
        proposedProcessRefs: ["fall.1"],
        proposedEffectSlots: [slot],
        contestedClaimRefs: [claim],
        conflictChecked: true,
        sameBucketChecked: true,
        sideSwapChecked: runner === "side_swap_symmetry",
      }),
    };
  }
  if (runner === "different_window_independence") {
    const claim = "state:character.a:actor.posture";
    const slot = effectSlot("character.a", "actor.posture", "fallen");
    return {
      context: "fall.1 acts in turn 4 execution. The character posture claim is not until turn 5 execution, so it is not simultaneous.",
      slice: projection([{
        id: "fact.fall.active",
        subjectRef: "source.fall",
        predicate: "fall.state",
        value: "active",
      }], ["character.a"]),
      activeProcesses: [worldProcess({
        ref: "fall.1",
        kind: "fall",
        targets: ["character.a"],
        triggerFactRefs: ["fact.fall.active"],
      })],
      characterProposals: [character("character.a", [claim], {
        fromTurn: 5,
        toTurn: 5,
        phase: "execution",
      })],
      expected: emptyExpectation({
        proposedProcessRefs: ["fall.1"],
        completedEffectSlots: [slot],
        proposedEffectSlots: [slot],
        conflictChecked: true,
      }),
    };
  }
  if (runner === "bounded_smoke_concretization") {
    const slot = effectSlot("area.2", "area.smoke", "spreading");
    return {
      context: "Turn 4 execution. fact.spread.unknown has no known value. evidence.airflow is in the projection and the frozen concretization refines that same fact to active. Rule world-process.spread.v1 affects only area.2.",
      slice: projection([{
        id: "fact.spread.unknown",
        subjectRef: "source.spread",
        predicate: "spread.state",
        unknown: true,
      }, {
        id: "evidence.airflow",
        subjectRef: "area.1",
        predicate: "airflow.observed",
        value: true,
      }], ["area.2"]),
      activeProcesses: [worldProcess({
        ref: "spread.unknown.1",
        kind: "spread",
        targets: ["area.2"],
        triggerFactRefs: ["fact.spread.unknown"],
      })],
      characterProposals: [],
      concretizations: [{
        processRef: "spread.unknown.1",
        baseFactRef: "fact.spread.unknown",
        value: "active",
        evidenceRefs: ["evidence.airflow"],
      }],
      expected: emptyExpectation({
        proposedProcessRefs: ["spread.unknown.1"],
        completedEffectSlots: [slot],
        proposedEffectSlots: [slot],
      }),
    };
  }
  if (runner === "terminal_and_missing_trigger") {
    return {
      context: "fire.inactive is explicitly inactive. collapse.untriggered is active but its required trigger fact is absent. Both must terminate without proposals or effects.",
      slice: projection([], ["area.1", "bridge.1"]),
      activeProcesses: [worldProcess({
        ref: "fire.inactive",
        kind: "fire",
        targets: ["area.1"],
        triggerFactRefs: ["fact.fire.absent"],
        active: false,
      }), worldProcess({
        ref: "collapse.untriggered",
        kind: "collapse",
        targets: ["bridge.1"],
        triggerFactRefs: ["fact.collapse.absent"],
      })],
      characterProposals: [],
      expected: emptyExpectation({
        rejectedReasons: {
          "fire.inactive": "inactive_process",
          "collapse.untriggered": "missing_trigger",
        },
        terminalChecked: true,
      }),
    };
  }
  if (runner === "invalid_scope_rule_and_concretization") {
    return {
      context: "fire.no-rule lacks its applicable rule, fall.outside targets an entity outside the slice, and spread.invalid tries to use evidence outside the projection. All must fail closed.",
      slice: projection([{
        id: "fact.fire.active",
        subjectRef: "source.fire",
        predicate: "fire.state",
        value: "active",
      }, {
        id: "fact.fall.active",
        subjectRef: "source.fall",
        predicate: "fall.state",
        value: "active",
      }, {
        id: "fact.spread.unknown",
        subjectRef: "source.spread",
        predicate: "spread.state",
        unknown: true,
      }], ["area.1", "area.2"], Object.values(rules).filter(
        (rule) => rule !== rules.fire,
      )),
      activeProcesses: [worldProcess({
        ref: "fire.no-rule",
        kind: "fire",
        targets: ["area.1"],
        triggerFactRefs: ["fact.fire.active"],
      }), worldProcess({
        ref: "fall.outside",
        kind: "fall",
        targets: ["character.outside"],
        triggerFactRefs: ["fact.fall.active"],
      }), worldProcess({
        ref: "spread.invalid",
        kind: "spread",
        targets: ["area.2"],
        triggerFactRefs: ["fact.spread.unknown"],
      })],
      characterProposals: [],
      concretizations: [{
        processRef: "spread.invalid",
        baseFactRef: "fact.spread.unknown",
        value: "active",
        evidenceRefs: ["evidence.outside"],
      }],
      expected: emptyExpectation({
        rejectedReasons: {
          "fire.no-rule": "missing_rule",
          "fall.outside": "out_of_scope",
          "spread.invalid": "invalid_concretization",
        },
        terminalChecked: true,
      }),
    };
  }
  throw new Error(`unknown world-process scenario runner ${runner}`);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : round(numerator / denominator);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return round(sorted[Math.ceil((p / 100) * sorted.length) - 1]!);
}

function resultEffectSlots(
  result: WorldProcessPocResult,
  patchesOnly: boolean,
): string[] {
  return result.receipts.flatMap((receipt) => {
    if (patchesOnly && !receipt.patch) return [];
    return receipt.effects.map((effect) => effectSlot(
      effect.targetRef,
      effect.predicate,
      effect.value,
    ));
  }).sort();
}

function sameSet(left: string[], right: string[]): boolean {
  return [...left].sort().join("\n") === [...right].sort().join("\n");
}

function normalizedWorldResult(result: WorldProcessPocResult): unknown {
  return {
    proposals: result.proposals,
    receipts: result.receipts,
    contestedClaimRefs: result.contestedClaimRefs,
    ruleRefsUsed: result.ruleRefsUsed,
  };
}

function semanticSummary(result: WorldProcessPocResult): string {
  return JSON.stringify({
    timeline: result.timeline.map((item) => ({
      sourceKind: item.sourceKind,
      timing: item.timing,
      exclusiveClaimRefs: item.exclusiveClaimRefs,
      status: item.status,
    })),
    worldReceipts: result.receipts.map((receipt) => ({
      processRef: receipt.processRef,
      outcome: receipt.outcome,
      reason: receipt.reason,
      effects: receipt.effects.map((effect) => ({
        targetRef: effect.targetRef,
        predicate: effect.predicate,
        value: effect.value,
      })),
      patchEmitted: Boolean(receipt.patch),
      causalLinks: receipt.patch?.causalLinks.map((link) => ({
        sourceRef: link.sourceRef,
        relation: link.relation,
      })) ?? [],
    })),
    contestedClaimRefs: result.contestedClaimRefs,
  }, null, 2);
}

function normalizePreference(
  preference: JudgeResponse["preference"],
  activeIsA: boolean,
): NormalizedPreference {
  if (preference === "tie" || preference === "indeterminate") return preference;
  return (preference === "A") === activeIsA ? "active" : "control";
}

function causalCoverage(result: WorldProcessPocResult): {
  traced: number;
  total: number;
} {
  let traced = 0;
  let total = 0;
  for (const receipt of result.receipts) {
    if (!receipt.patch) continue;
    for (const assertion of receipt.patch.assertions) {
      const effect = receipt.effects.find((candidate) =>
        candidate.targetRef === assertion.subjectRef &&
        candidate.predicate === assertion.predicate
      );
      if (!effect) continue;
      const links = receipt.patch.causalLinks.filter((link) =>
        link.targetFactRef === assertion.id
      );
      total += 1 + receipt.projectionFactRefsUsed.length;
      if (links.some((link) =>
        link.sourceRef === receipt.processRef &&
        (link.relation === "created" || link.relation === "modified")
      )) traced += 1;
      for (const triggerRef of receipt.projectionFactRefsUsed) {
        if (links.some((link) =>
          link.sourceRef === triggerRef && link.relation === "triggered"
        )) traced += 1;
      }
    }
  }
  return { traced, total };
}

function unsupportedInventions(
  result: WorldProcessPocResult,
  expectation: ScenarioExpectation,
): number {
  const expected = new Set(expectation.proposedEffectSlots);
  let unsupported = resultEffectSlots(result, false)
    .filter((slot) => !expected.has(slot)).length;
  for (const receipt of result.receipts) {
    if (!receipt.patch) continue;
    for (const assertion of receipt.patch.assertions) {
      const slot = effectSlot(
        assertion.subjectRef,
        assertion.predicate,
        assertion.value,
      );
      if (!expected.has(slot)) unsupported += 1;
    }
  }
  return unsupported;
}

function exactRejectedReasons(
  result: WorldProcessPocResult,
  expected: Record<string, string>,
): boolean {
  const actual = Object.fromEntries(result.receipts
    .filter((receipt) => receipt.outcome === "rejected")
    .map((receipt) => [receipt.processRef, receipt.reason]));
  return JSON.stringify(canonicalize(actual)) ===
    JSON.stringify(canonicalize(expected));
}

export async function evaluateBattleWorldProcessPoc(input: {
  fixturePath?: string;
  repetitions?: number;
  judgeClient?: WorldProcessJudgeClient;
  provider?: string;
  model?: string;
  now?: () => Date;
} = {}): Promise<Record<string, unknown>> {
  const fixturePath = input.fixturePath ?? defaultFixturePath;
  const fixtureText = await fs.readFile(fixturePath, "utf8");
  const fixture = FixtureSchema.parse(JSON.parse(fixtureText));
  const repetitions = input.repetitions ?? fixture.deterministicRepetitions;

  let schemaFailureCount = 0;
  let sourceMutationCount = 0;
  let canonicalCommitCount = 0;
  let shadowExternalLlmCalls = 0;
  let unsupportedInventionCount = 0;
  let expectedProgression = 0;
  let observedProgression = 0;
  let baselineProgression = 0;
  let proposalTruePositive = 0;
  let proposalFalsePositive = 0;
  let proposalFalseNegative = 0;
  let propagationExpected = 0;
  let propagationObserved = 0;
  let conflictChecks = 0;
  let conflictMatches = 0;
  let causalTraced = 0;
  let causalTotal = 0;
  let sideSwapChecks = 0;
  let sideSwapMatches = 0;
  let sameBucketChecks = 0;
  let sameBucketMatches = 0;
  let terminalChecks = 0;
  let terminalMatches = 0;
  const allLatencies: number[] = [];
  const blindPackets: Array<{
    scenarioId: string;
    context: string;
    active: string;
    control: string;
  }> = [];
  const scenarioReports: Array<{
    id: string;
    hypothesis: string;
    runs: Array<{
      repetition: number;
      latencyMs: number;
      result: WorldProcessPocResult;
      baseline: WorldProcessPocResult;
    }>;
    distinctResultDigests: number;
    distinctBaselineDigests: number;
  }> = [];

  for (const fixtureScenario of fixture.scenarios) {
    const scenario = buildScenario(fixtureScenario.runner);
    const runs: typeof scenarioReports[number]["runs"] = [];
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const sourceDigest = digest({
        slice: scenario.slice,
        activeProcesses: scenario.activeProcesses,
        characterProposals: scenario.characterProposals,
        concretizations: scenario.concretizations,
      });
      const started = performance.now();
      let result: WorldProcessPocResult;
      try {
        result = evaluateWorldProcessesPoc({
          slice: scenario.slice,
          activeProcesses: scenario.activeProcesses,
          characterProposals: scenario.characterProposals,
          ...(scenario.concretizations
            ? { concretizations: scenario.concretizations }
            : {}),
        });
        WorldProcessPocResultSchema.parse(result);
      } catch (error) {
        schemaFailureCount += 1;
        throw error;
      }
      const latencyMs = performance.now() - started;
      const baseline = evaluateWorldProcessesPoc({
        slice: scenario.slice,
        activeProcesses: [],
        characterProposals: scenario.characterProposals,
      });
      allLatencies.push(latencyMs);
      if (sourceDigest !== digest({
        slice: scenario.slice,
        activeProcesses: scenario.activeProcesses,
        characterProposals: scenario.characterProposals,
        concretizations: scenario.concretizations,
      }) || result.sourceMutated) sourceMutationCount += 1;
      if (result.canonicalCommitPerformed) canonicalCommitCount += 1;
      shadowExternalLlmCalls = Math.max(
        shadowExternalLlmCalls,
        result.externalLlmCalls,
      );

      if (repetition === 1) {
        const expectedProposals = new Set(scenario.expected.proposedProcessRefs);
        const actualProposals = new Set(result.proposals.map((proposal) =>
          proposal.processRef
        ));
        for (const processRef of new Set([
          ...scenario.activeProcesses.map((process) => process.processRef),
          ...expectedProposals,
          ...actualProposals,
        ])) {
          const expected = expectedProposals.has(processRef);
          const actual = actualProposals.has(processRef);
          if (expected && actual) proposalTruePositive += 1;
          else if (!expected && actual) proposalFalsePositive += 1;
          else if (expected) proposalFalseNegative += 1;
        }

        const actualCompletedSlots = resultEffectSlots(result, true);
        expectedProgression += scenario.expected.completedEffectSlots.length;
        observedProgression += scenario.expected.completedEffectSlots.filter(
          (slot) => actualCompletedSlots.includes(slot),
        ).length;
        baselineProgression += scenario.expected.completedEffectSlots.filter(
          (slot) => resultEffectSlots(baseline, true).includes(slot),
        ).length;
        propagationExpected += scenario.expected.propagationEffectSlots.length;
        propagationObserved += scenario.expected.propagationEffectSlots.filter(
          (slot) => actualCompletedSlots.includes(slot),
        ).length;
        unsupportedInventionCount += unsupportedInventions(
          result,
          scenario.expected,
        );

        const causal = causalCoverage(result);
        causalTraced += causal.traced;
        causalTotal += causal.total;

        if (scenario.expected.conflictChecked) {
          conflictChecks += 1;
          const shouldContest = scenario.expected.contestedClaimRefs.length > 0;
          const conflictReceipt = result.receipts.find((receipt) =>
            scenario.expected.proposedProcessRefs.includes(receipt.processRef)
          );
          const matched = shouldContest
            ? Boolean(
              conflictReceipt?.outcome === "requires_adjudication" &&
              !conflictReceipt.patch &&
              sameSet(
                result.contestedClaimRefs,
                scenario.expected.contestedClaimRefs,
              ),
            )
            : Boolean(
              conflictReceipt?.outcome === "completed" &&
              conflictReceipt.patch &&
              result.contestedClaimRefs.length === 0,
            );
          if (matched) conflictMatches += 1;
        }

        if (scenario.expected.sameBucketChecked) {
          sameBucketChecks += 1;
          const receipt = result.receipts.find((candidate) =>
            scenario.expected.proposedProcessRefs.includes(candidate.processRef)
          );
          const contestedTimeline = result.timeline.filter((item) =>
            item.exclusiveClaimRefs.some((claim) =>
              scenario.expected.contestedClaimRefs.includes(claim)
            )
          );
          if (
            receipt?.outcome === "requires_adjudication" &&
            !receipt.patch &&
            contestedTimeline.length === 2 &&
            contestedTimeline.every((item) => item.status === "contested")
          ) sameBucketMatches += 1;
        }

        if (scenario.expected.terminalChecked) {
          terminalChecks += 1;
          if (
            result.proposals.length === 0 &&
            result.receipts.every((receipt) =>
              receipt.outcome === "rejected" && receipt.effects.length === 0 &&
              !receipt.patch
            ) &&
            exactRejectedReasons(result, scenario.expected.rejectedReasons)
          ) terminalMatches += 1;
        }

        if (
          scenario.expected.sideSwapChecked &&
          scenario.swappedCharacterProposals
        ) {
          sideSwapChecks += 1;
          const swapped = evaluateWorldProcessesPoc({
            slice: scenario.slice,
            activeProcesses: scenario.activeProcesses,
            characterProposals: scenario.swappedCharacterProposals,
            ...(scenario.concretizations
              ? { concretizations: scenario.concretizations }
              : {}),
          });
          if (
            digest(normalizedWorldResult(result)) ===
              digest(normalizedWorldResult(swapped))
          ) sideSwapMatches += 1;
        }

        if (fixtureScenario.blindReview) {
          blindPackets.push({
            scenarioId: fixtureScenario.id,
            context: scenario.context,
            active: semanticSummary(result),
            control: semanticSummary(baseline),
          });
        }
      }
      runs.push({ repetition, latencyMs, result, baseline });
    }
    scenarioReports.push({
      id: fixtureScenario.id,
      hypothesis: fixtureScenario.hypothesis,
      runs,
      distinctResultDigests: new Set(runs.map((run) => digest(run.result))).size,
      distinctBaselineDigests: new Set(runs.map((run) =>
        digest(run.baseline)
      )).size,
    });
  }

  const judgeSamples: Array<{
    scenarioId: string;
    repetition: number;
    activeIsA: boolean;
    response: JudgeResponse | null;
    normalizedPreference: NormalizedPreference;
    measurement: Measurement;
    error: string | null;
  }> = [];
  if (input.judgeClient) {
    const jobs = blindPackets.flatMap((packet) => Array.from(
      { length: fixture.blindComparisonsPerScenario },
      (_, index) => ({
        packet,
        repetition: index + 1,
        activeIsA: index % 2 === 0,
      }),
    ));
    for (let offset = 0; offset < jobs.length; offset += 4) {
      const batch = jobs.slice(offset, offset + 4);
      judgeSamples.push(...await Promise.all(batch.map(async ({
        packet,
        repetition,
        activeIsA,
      }) => {
        const user = [
          `Context:\n${packet.context}`,
          `Candidate A:\n${activeIsA ? packet.active : packet.control}`,
          `Candidate B:\n${activeIsA ? packet.control : packet.active}`,
        ].join("\n\n");
        const started = Date.now();
        try {
          const completed = await input.judgeClient!.completeJson({
            system: JUDGE_SYSTEM,
            user,
            responseFormat: WORLD_PROCESS_JUDGE_RESPONSE_FORMAT,
          });
          const response = JudgeResponseSchema.parse(completed.data);
          return {
            scenarioId: packet.scenarioId,
            repetition,
            activeIsA,
            response,
            normalizedPreference: normalizePreference(
              response.preference,
              activeIsA,
            ),
            measurement: completed.measurement,
            error: null,
          };
        } catch (error) {
          return {
            scenarioId: packet.scenarioId,
            repetition,
            activeIsA,
            response: null,
            normalizedPreference: "indeterminate" as const,
            measurement: {
              latencyMs: Date.now() - started,
              inputTokens: null,
              outputTokens: null,
              totalTokens: null,
            },
            error: (error instanceof Error ? error.message : String(error))
              .slice(0, 500),
          };
        }
      })));
    }
  }

  const validJudgments = judgeSamples.filter((sample) =>
    sample.response && sample.normalizedPreference !== "indeterminate"
  );
  const activeWins = validJudgments.filter((sample) =>
    sample.normalizedPreference === "active"
  ).length;
  const ties = validJudgments.filter((sample) =>
    sample.normalizedPreference === "tie"
  ).length;
  const preferenceShare = validJudgments.length === 0
    ? null
    : round((activeWins + ties * 0.5) / validJudgments.length);
  const score = (
    sample: typeof judgeSamples[number],
    keyA: "plausibilityA" | "continuityA",
    keyB: "plausibilityB" | "continuityB",
    active: boolean,
  ): number | null => sample.response
    ? sample.response[active === sample.activeIsA ? keyA : keyB]
    : null;
  const scoreDelta = (
    keyA: "plausibilityA" | "continuityA",
    keyB: "plausibilityB" | "continuityB",
  ): number | null => {
    if (validJudgments.length === 0) return null;
    const activeScore = validJudgments.reduce((sum, sample) =>
      sum + score(sample, keyA, keyB, true)!, 0
    );
    const controlScore = validJudgments.reduce((sum, sample) =>
      sum + score(sample, keyA, keyB, false)!, 0
    );
    return round((activeScore - controlScore) / validJudgments.length);
  };
  const plausibilityDelta = scoreDelta("plausibilityA", "plausibilityB");
  const continuityDelta = scoreDelta("continuityA", "continuityB");
  let orderPairs = 0;
  let consistentPairs = 0;
  for (const packet of blindPackets) {
    const rows = judgeSamples.filter((sample) =>
      sample.scenarioId === packet.scenarioId
    ).sort((a, b) => a.repetition - b.repetition);
    for (let index = 0; index + 1 < rows.length; index += 2) {
      orderPairs += 1;
      if (
        rows[index]!.normalizedPreference ===
          rows[index + 1]!.normalizedPreference
      ) consistentPairs += 1;
    }
  }

  const thresholds = fixture.thresholds;
  const progressionRecall = ratio(observedProgression, expectedProgression);
  const triggerPrecision = ratio(
    proposalTruePositive,
    proposalTruePositive + proposalFalsePositive,
  );
  const triggerRecall = ratio(
    proposalTruePositive,
    proposalTruePositive + proposalFalseNegative,
  );
  const propagationCoverage = ratio(
    propagationObserved,
    propagationExpected,
  );
  const conflictCorrectness = ratio(conflictMatches, conflictChecks);
  const causalCompleteness = ratio(causalTraced, causalTotal);
  const progressionGain = expectedProgression === 0
    ? 0
    : round((observedProgression - baselineProgression) / expectedProgression);
  const sideSwapSymmetry = ratio(sideSwapMatches, sideSwapChecks);
  const sameBucketAtomicity = ratio(sameBucketMatches, sameBucketChecks);
  const terminalCorrectness = ratio(terminalMatches, terminalChecks);
  const judgeCoverage = ratio(
    validJudgments.length,
    blindPackets.length * fixture.blindComparisonsPerScenario,
  );
  const orderConsistency = ratio(consistentPairs, orderPairs);
  const worldSourceText = await fs.readFile(worldSourcePath, "utf8");
  const worldSourceLines = worldSourceText.split("\n").length;
  const worldExportedDeclarations = (
    worldSourceText.match(
      /^export (?:const|type|function|class|interface) /gm,
    ) ?? []
  ).length;
  const runtimeIntegrationRefCount = [
    "backend/src/services",
    "frontend/src",
    "infra",
  ].reduce((sum, target) => {
    try {
      const output = execFileSync(
        "rg",
        ["-l", "evaluateWorldProcessesPoc", target],
        { cwd: repositoryRoot, encoding: "utf8" },
      ).trim();
      return sum + (output ? output.split("\n").length : 0);
    } catch {
      return sum;
    }
  }, 0);
  const allResultsStable = scenarioReports.every((scenario) =>
    scenario.distinctResultDigests === 1 &&
    scenario.distinctBaselineDigests === 1
  );
  const hardPass = schemaFailureCount === 0 &&
    sourceMutationCount === 0 && canonicalCommitCount === 0 &&
    runtimeIntegrationRefCount === 0 &&
    unsupportedInventionCount <=
      thresholds.unsupportedEnvironmentalInventionsMaximum &&
    sideSwapSymmetry >= thresholds.sideSwapSymmetryMinimum &&
    sameBucketAtomicity >= thresholds.sameBucketAtomicityMinimum &&
    terminalCorrectness >= thresholds.terminalBehaviorCorrectnessMinimum &&
    allResultsStable;
  const deterministicPass =
    progressionRecall >= thresholds.expectedProgressionRecallMinimum &&
    triggerPrecision >= thresholds.triggerDecisionPrecisionMinimum &&
    triggerRecall >= thresholds.triggerDecisionRecallMinimum &&
    propagationCoverage >= thresholds.propagationCoverageMinimum &&
    conflictCorrectness >= thresholds.conflictHandlingCorrectnessMinimum &&
    causalCompleteness >= thresholds.causalTraceCompletenessMinimum &&
    progressionGain >= thresholds.baselineProgressionGainMinimum;
  const semanticMeasured = Boolean(input.judgeClient);
  const semanticPass = semanticMeasured && preferenceShare !== null &&
    plausibilityDelta !== null && continuityDelta !== null &&
    preferenceShare >= thresholds.blindActivePreferenceShareMinimum &&
    plausibilityDelta >= thresholds.blindPlausibilityScoreDeltaMinimum &&
    continuityDelta >= thresholds.blindContinuityScoreDeltaMinimum &&
    judgeCoverage >= thresholds.blindJudgmentCoverageMinimum &&
    orderConsistency >= thresholds.blindOrderConsistencyMinimum;
  const costPass = percentile(allLatencies, 95) <=
      thresholds.p95ShadowLatencyMsMaximum &&
    worldSourceLines <= thresholds.worldSourceLinesMaximum &&
    worldExportedDeclarations <= thresholds.worldExportedDeclarationsMaximum &&
    3 <= thresholds.ordinaryTurnLlmCallsMaximum &&
    shadowExternalLlmCalls <=
      thresholds.worldProcessAdditionalLlmCallsMaximum;
  const decision = !hardPass
    ? "unsupported"
    : !semanticMeasured || judgeCoverage < thresholds.blindJudgmentCoverageMinimum
    ? "indeterminate"
    : deterministicPass && semanticPass && costPass
    ? "supported"
    : "revise";

  return {
    schemaVersion: 1,
    fixtureVersion: fixture.fixtureVersion,
    generatedAt: (input.now?.() ?? new Date()).toISOString(),
    mode: "world_process_shadow_evaluation",
    provenance: {
      gitHead: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }).trim(),
      workingTreeDirty: execFileSync("git", ["status", "--porcelain"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }).trim().length > 0,
      nodeVersion: process.version,
      fixturePath: path.relative(repositoryRoot, fixturePath),
      fixtureSha256: createHash("sha256").update(fixtureText).digest("hex"),
      evaluatorPath: path.relative(
        repositoryRoot,
        fileURLToPath(import.meta.url),
      ),
      evaluatorSha256: createHash("sha256")
        .update(await fs.readFile(fileURLToPath(import.meta.url)))
        .digest("hex"),
      worldSourceSha256: createHash("sha256")
        .update(worldSourceText)
        .digest("hex"),
    },
    execution: {
      deterministicRepetitions: repetitions,
      scenarioCount: fixture.scenarios.length,
      shadowExternalLlmCalls,
      modeledOrdinaryTurnLlmCalls: 3,
      modeledWorldProcessAdditionalLlmCalls: 0,
      judgeProvider: input.provider ?? null,
      judgeModel: input.model ?? null,
      judgeCalls: judgeSamples.length,
      judgeCallErrors: judgeSamples.filter((sample) => sample.error).length,
      judgeInputTokens: judgeSamples.reduce((sum, sample) =>
        sum + (sample.measurement.inputTokens ?? 0), 0
      ),
      judgeOutputTokens: judgeSamples.reduce((sum, sample) =>
        sum + (sample.measurement.outputTokens ?? 0), 0
      ),
      judgeTotalTokens: judgeSamples.reduce((sum, sample) =>
        sum + (sample.measurement.totalTokens ?? 0), 0
      ),
      judgeLatencyMs: {
        mean: judgeSamples.length
          ? round(judgeSamples.reduce((sum, sample) =>
            sum + sample.measurement.latencyMs, 0
          ) / judgeSamples.length)
          : null,
        p95: judgeSamples.length
          ? percentile(judgeSamples.map((sample) =>
            sample.measurement.latencyMs
          ), 95)
          : null,
      },
    },
    thresholds,
    scenarios: scenarioReports,
    judgeSamples,
    aggregate: {
      schemaFailureCount,
      sourceMutationCount,
      canonicalCommitCount,
      runtimeIntegrationRefCount,
      unsupportedEnvironmentalInventionCount: unsupportedInventionCount,
      expectedProcessProgressionRecall: progressionRecall,
      triggerDecisionPrecision: triggerPrecision,
      triggerDecisionRecall: triggerRecall,
      propagationTargetCoverage: propagationCoverage,
      characterProcessConflictHandling: conflictCorrectness,
      causalTraceCompleteness: causalCompleteness,
      expectedProgressionGainOverBaseline: progressionGain,
      sideSwapSymmetry,
      sameBucketAtomicity,
      terminalBehaviorCorrectness: terminalCorrectness,
      blindActivePreferenceShare: preferenceShare,
      blindPlausibilityScoreDelta: plausibilityDelta,
      blindContinuityScoreDelta: continuityDelta,
      blindJudgmentCoverage: judgeCoverage,
      blindOrderConsistency: orderConsistency,
      p95ShadowLatencyMs: percentile(allLatencies, 95),
      worldSourceLines,
      worldExportedDeclarations,
      allResultsStable,
      hardInvariantsPass: hardPass,
      deterministicEffectivenessPass: deterministicPass,
      semanticProxyPass: semanticPass,
      costAndComplexityPass: costPass,
    },
    decision: {
      label: decision,
      scope: "frozen shadow active-world-process mechanism only",
      reasons: [
        hardPass
          ? "All frozen hard invariants passed."
          : "At least one hard invariant failed.",
        deterministicPass
          ? "Deterministic effectiveness thresholds passed."
          : "A deterministic effectiveness threshold missed.",
        semanticPass
          ? "The blinded semantic proxy passed."
          : semanticMeasured
          ? "The blinded semantic proxy missed or lacked stable coverage."
          : "Blinded semantic evidence was not executed.",
        costPass
          ? "Shadow cost and complexity ceilings passed."
          : "A cost or complexity ceiling missed.",
      ],
      boundedRevisionHypotheses: decision === "revise"
        ? [
          "Inspect scenario-level judge disagreement before changing any fixture or threshold.",
          "Separate proposal generation from simultaneous conflict adjudication if conflict semantics remain unclear.",
        ]
        : [],
    },
    limitations: [
      "The semantic judge is a proxy and cannot establish an objectively correct final battle result.",
      "Rules, triggers, targets, character claims, and the one concretization are pre-authored fixtures.",
      "Local latency excludes persistence, concurrency, provider, and production load.",
      "No runtime, canonical commit, persistence, provider ordering, release, or deployment behavior is changed.",
    ],
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
    if (arg === "--execute") {
      execute = true;
      continue;
    }
    const value = args[index + 1];
    if (!value) throw new Error(`missing value for ${arg}`);
    if (arg === "--provider") provider = value;
    else if (arg === "--model") model = value;
    else if (arg === "--output") output = value;
    else throw new Error(`unknown argument ${arg}`);
    index += 1;
  }

  let judgeClient: WorldProcessJudgeClient | undefined;
  if (execute) {
    if (provider !== "xai") {
      throw new Error("this frozen evaluation permits only --provider xai");
    }
    if (!config.xai.apiKey) throw new Error("XAI_API_KEY is not configured");
    model ||= config.xai.modelFast;
    const client = new OpenAI({
      apiKey: config.xai.apiKey,
      baseURL: config.xai.baseUrl,
      timeout: 45_000,
      maxRetries: 0,
    });
    judgeClient = {
      async completeJson(request) {
        const started = Date.now();
        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          temperature: 0,
          response_format: request.responseFormat,
        });
        return {
          data: JSON.parse(response.choices[0]?.message?.content ?? "{}"),
          measurement: {
            latencyMs: Date.now() - started,
            inputTokens: response.usage?.prompt_tokens ?? null,
            outputTokens: response.usage?.completion_tokens ?? null,
            totalTokens: response.usage?.total_tokens ?? null,
          },
        };
      },
    };
  }

  const report = await evaluateBattleWorldProcessPoc({
    ...(judgeClient ? { judgeClient, provider, model } : {}),
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output) {
    await fs.writeFile(path.resolve(repositoryRoot, output), serialized, {
      encoding: "utf8",
      flag: "wx",
    });
  } else {
    process.stdout.write(serialized);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
