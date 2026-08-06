import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_PATCH_POC_LIMITS,
  ShadowCanonicalFactSchema,
  ShadowCanonicalPatchSchema,
  ShadowPatchConversionResultSchema,
  applyBattleWorldTransition,
  applyTurnSemanticPatch,
  auditShadowCanonicalPatch,
  canonicalFactSlotKey,
  convertFreeActionToShadowPatch,
  convertMechanicalEvidenceToShadowPatch,
  convertSemanticTransitionToShadowPatch,
  convertWorldTransitionToShadowPatch,
  createBattleState,
  defaultParameters,
  readBattleWorldPair,
  resolveTurn,
  type BattleWorldTransition,
  type CanonicalFactAuthority,
  type CanonicalFactRefLookup,
  type CanonicalFactSubsystem,
  type CharacterSheet,
  type PatchAuditIssueCode,
  type SemanticValue,
  type ShadowCanonicalFact,
  type ShadowCanonicalPatch,
  type ShadowPatchAuditContext,
  type ShadowPatchConversionResult,
} from "@kshiai/shared";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaultFixturePath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-patch-fixtures-v1.json",
);
const fixedTime = "2026-08-06T00:00:00.000Z";

type ConversionStatus = "converted" | "indeterminate";
type ExpectedClaim = {
  subjectRef: string;
  predicate: string;
  objectRef?: string;
  value?: SemanticValue;
  causalSourceRef: string;
  priorFactRef?: string;
};

type ConversionFixture = {
  id: string;
  runner: string;
  expectedStatus: ConversionStatus;
};

type DefectMutation =
  | "invalid_schema"
  | "patch_too_large"
  | "unknown_entity_reference"
  | "missing_retraction"
  | "direct_conflict"
  | "forbidden_state"
  | "missing_causal_link"
  | "invalid_causal_target"
  | "incomplete_touched_refs"
  | "authority_mismatch"
  | "incomplete_context";

type DefectSeed = {
  id: string;
  mutation: DefectMutation;
  expectedIssueCode: PatchAuditIssueCode;
  expectedVerdict: "issue_found" | "indeterminate";
};

type Thresholds = {
  conversionClassificationAccuracyMinimum: number;
  reconstructedPostStateParityMinimum: number;
  causalSourceParityMinimum: number;
  seededDefectRecallMinimum: number;
  falseRejectionCountMaximum: number;
  unexplainedStateChangeCountMaximum: number;
  authorityRegressionCountMaximum: number;
  sourceMutationCountMaximum: number;
  schemaFailureCountMaximum: number;
  patchLimitViolationCountMaximum: number;
  auditScopeByteReductionMinimum: number;
};

type PatchFixtureFile = {
  schemaVersion: 1;
  fixtureVersion: string;
  frozenAt: string;
  repetitions: number;
  byteComparison: Record<string, string>;
  thresholds: Thresholds;
  fixtures: ConversionFixture[];
  defectSeeds: DefectSeed[];
};

type FixtureRun = {
  conversion: ShadowPatchConversionResult;
  conversionLatencyMs: number;
  sourceMutated: boolean;
  knownEntityRefs: string[];
  existingFacts: ShadowCanonicalFact[];
  expectedClaims: ExpectedClaim[];
  expectedSubsystem?: CanonicalFactSubsystem;
  expectedAuthority?: CanonicalFactAuthority;
  fullAuthorityInput: unknown;
};

type FixtureAggregate = {
  id: string;
  expectedStatus: ConversionStatus;
  repetitions: number;
  classificationMatches: number;
  classificationAccuracy: number;
  expectedClaimCount: number;
  matchedAssertionCount: number;
  assertionParity: number;
  expectedRetractionCount: number;
  matchedRetractionCount: number;
  retractionParity: number;
  reconstructedPostStateMatches: number;
  reconstructedPostStateParity: number;
  expectedCausalLinkCount: number;
  matchedCausalLinkCount: number;
  causalSourceParity: number;
  falseRejectionCount: number;
  unexplainedStateChangeCount: number;
  authorityRegressionCount: number;
  sourceMutationCount: number;
  schemaFailureCount: number;
  patchLimitViolationCount: number;
  fullAuthorityInputBytes: number;
  boundedAuditInputBytes: number;
  auditScopeByteReduction: number;
  conversionLatencyMs: {
    mean: number;
    p95: number;
    minimum: number;
    maximum: number;
  };
};

type DefectAggregate = {
  id: string;
  mutation: DefectMutation;
  expectedIssueCode: PatchAuditIssueCode;
  expectedVerdict: DefectSeed["expectedVerdict"];
  repetitions: number;
  detections: number;
  recall: number;
  observedIssueCodes: PatchAuditIssueCode[];
  observedVerdicts: Array<"no_issue_found" | "issue_found" | "indeterminate">;
};

export type PatchEvaluationReport = {
  schemaVersion: 1;
  fixtureVersion: string;
  generatedAt: string;
  mode: "canonical_patch_poc_evaluation";
  provenance: {
    gitHead: string;
    workingTreeDirty: boolean;
    nodeVersion: string;
    fixturePath: string;
    fixtureSha256: string;
    evaluatorPath: string;
    evaluatorSha256: string;
    patchSourcePath: string;
    patchSourceSha256: string;
  };
  execution: {
    repetitionsPerCase: number;
    conversionFixtureCount: number;
    conversionAttempts: number;
    defectSeedCount: number;
    defectAudits: number;
    externalLlmCallsMade: 0;
    xaiUsed: false;
    xaiReason: string;
  };
  thresholds: Thresholds;
  fixtures: FixtureAggregate[];
  defectSeeds: DefectAggregate[];
  staticAuthorityCheck: {
    runtimeIntegrationFileRefs: string[];
    exportedCommitFunctionCount: number;
  };
  aggregate: {
    conversionClassificationAccuracy: number;
    reconstructedPostStateParity: number;
    causalSourceParity: number;
    seededDefectRecall: number;
    falseRejectionCount: number;
    unexplainedStateChangeCount: number;
    authorityRegressionCount: number;
    sourceMutationCount: number;
    schemaFailureCount: number;
    patchLimitViolationCount: number;
    auditScopeByteReduction: number;
    hardInvariantsPass: boolean;
    seededDefectRecallPass: boolean;
    falseRejectionPass: boolean;
    auditScopeByteReductionPass: boolean;
  };
  decision: {
    label: "supported" | "revise" | "unsupported" | "indeterminate";
    reasons: string[];
    boundedRevisionHypotheses: string[];
  };
  limitations: string[];
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

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

function digest(value: unknown): string {
  return sha256(JSON.stringify(canonicalize(value)));
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], value: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((value / 100) * sorted.length) - 1);
  return sorted[index]!;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function gitOutput(args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

function gitLines(args: string[]): string[] {
  try {
    const output = gitOutput(args);
    return output ? output.split("\n") : [];
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 1
    ) {
      return [];
    }
    throw error;
  }
}

function makeSheet(id: string, displayName: string): CharacterSheet {
  return {
    id,
    ownerUserId: "patch-eval-owner",
    displayName,
    tags: ["patch-eval"],
    createdAt: fixedTime,
    updatedAt: fixedTime,
    appearance: {
      summary: `${displayName}の固定fixture外見`,
      visualPrompt: "canonical patch evaluation fixture",
    },
    traits: [],
    parameters: defaultParameters({
      hp: 100,
      maxHp: 100,
      mp: 40,
      maxMp: 40,
      stamina: 50,
      maxStamina: 50,
      atk: 12,
      def: 10,
      spd: 10,
    }),
    basicAttack: {
      name: "固定攻撃",
      description: "近距離の相手へ働きかける。",
      targetParameter: "hp",
      scalingParameter: "atk",
      resistanceParameter: "def",
      power: 0.75,
      constraints: {
        reach: "near",
        requiresSight: false,
        mobility: "limited",
        requiresSpeech: false,
        requiresUsableHeldObject: false,
      },
    },
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: {
      canFight: true,
      irreversibleIncapacitated: false,
    },
    narrativeBlurb: `${displayName}のPatch評価fixture`,
  };
}

function makeState(id: string) {
  return createBattleState({
    id,
    sideA: makeSheet(`${id}-a`, "シロ"),
    sideB: makeSheet(`${id}-b`, "クロ"),
    turnLimit: 20,
    prologuePending: false,
  });
}

function oldFact(input: {
  id: string;
  subjectRef: string;
  predicate: string;
  objectRef?: string;
  value?: SemanticValue;
  subsystem: CanonicalFactSubsystem;
  authority: CanonicalFactAuthority;
}): ShadowCanonicalFact {
  return ShadowCanonicalFactSchema.parse({
    id: input.id,
    subjectRef: input.subjectRef,
    predicate: input.predicate,
    ...(input.objectRef ? { objectRef: input.objectRef } : {}),
    ...(Object.hasOwn(input, "value") ? { value: input.value } : {}),
    validFrom: { turn: 0, revision: 0 },
    provenance: {
      subsystem: input.subsystem,
      authority: input.authority,
      sourceRef: `seed:${input.id}`,
      sourceEventRefs: [],
    },
  });
}

function lookup(facts: ShadowCanonicalFact[]): CanonicalFactRefLookup {
  return Object.fromEntries(facts.map((fact) => [
    canonicalFactSlotKey(fact),
    fact.id,
  ]));
}

function measuredConversion(input: {
  sourceInputs: unknown;
  convert: () => ShadowPatchConversionResult;
}): {
  conversion: ShadowPatchConversionResult;
  conversionLatencyMs: number;
  sourceMutated: boolean;
} {
  const before = digest(input.sourceInputs);
  const start = performance.now();
  const conversion = input.convert();
  const conversionLatencyMs = performance.now() - start;
  return {
    conversion,
    conversionLatencyMs,
    sourceMutated: digest(input.sourceInputs) !== before,
  };
}

function mechanicalParameterChange(): FixtureRun {
  const before = makeState("patch-eval-mechanical");
  const resolved = resolveTurn({
    state: before,
    playerAction: { actorSide: "a", kind: "basic_attack" },
    sideASkills: [],
    sideBSkills: [],
  });
  const changed = resolved.mechanicalEvidence.filter((item) => item.delta !== 0);
  const existingFacts = changed.map((item, index) => oldFact({
    id: `fact.mechanical.${index + 1}`,
    subjectRef: item.target.entityId,
    predicate: `parameter.${item.parameterKey}`,
    value: item.beforeValue,
    subsystem: "mechanical",
    authority: "deterministic_resolver",
  }));
  const existingFactRefs = lookup(existingFacts);
  const sourceInputs = {
    evidence: resolved.mechanicalEvidence,
    existingFactRefs,
  };
  const measured = measuredConversion({
    sourceInputs,
    convert: () => convertMechanicalEvidenceToShadowPatch(sourceInputs),
  });
  return {
    ...measured,
    knownEntityRefs: ["character.a", "character.b"],
    existingFacts,
    expectedClaims: changed.map((item, index) => ({
      subjectRef: item.target.entityId,
      predicate: `parameter.${item.parameterKey}`,
      value: item.afterValue,
      causalSourceRef:
        item.sourceActionId ?? item.basisEventIds[0] ?? item.evidenceId,
      priorFactRef: existingFacts[index]!.id,
    })),
    expectedSubsystem: "mechanical",
    expectedAuthority: "deterministic_resolver",
    fullAuthorityInput: {
      before,
      after: resolved.state,
      acceptedMechanicalEvidence: resolved.mechanicalEvidence,
      existingFacts,
    },
  };
}

function semanticVisibleCondition(): FixtureRun {
  const battle = makeState("patch-eval-semantic");
  const before = structuredClone(battle.semanticState!);
  const patch = {
    baseRevision: before.revision,
    turn: 1,
    sourceEventIds: ["event.semantic"],
    operations: [{
      op: "replace" as const,
      path: "/entities/character.a/facts/visible_conditions",
      value: { bruised: "light" },
    }],
  };
  const applied = applyTurnSemanticPatch({
    state: before,
    patch,
    turn: 1,
    allowedSourceEventIds: new Set(["event.semantic"]),
  });
  if (!applied.ok) throw new Error("semantic evaluation fixture did not apply");
  const existingFacts = [oldFact({
    id: "fact.semantic.visible-conditions",
    subjectRef: "character.a",
    predicate: "semantic.visible_conditions",
    value: {},
    subsystem: "semantic",
    authority: "validated_semantic_transition",
  })];
  const sourceInputs = {
    before,
    after: applied.state,
    patch,
    existingFactRefs: lookup(existingFacts),
  };
  const measured = measuredConversion({
    sourceInputs,
    convert: () => convertSemanticTransitionToShadowPatch(sourceInputs),
  });
  return {
    ...measured,
    knownEntityRefs: Object.keys(before.entities),
    existingFacts,
    expectedClaims: [{
      subjectRef: "character.a",
      predicate: "semantic.visible_conditions",
      value: applied.state.entities["character.a"]!.facts.visible_conditions,
      causalSourceRef: "event.semantic",
      priorFactRef: existingFacts[0]!.id,
    }],
    expectedSubsystem: "semantic",
    expectedAuthority: "validated_semantic_transition",
    fullAuthorityInput: {
      before,
      after: applied.state,
      acceptedPatch: patch,
      existingFacts,
    },
  };
}

function worldPlacementAndPair(): FixtureRun {
  const battle = makeState("patch-eval-world");
  const before = structuredClone(battle.worldState!);
  before.areas["area.remote"] = {
    ...structuredClone(before.areas["area.1"]!),
    label: "遠隔区画",
  };
  const initialPlacement = before.entities["character.b"]!.placement;
  if (initialPlacement.type !== "scene") {
    throw new Error("world fixture requires a scene placement");
  }
  const pair = readBattleWorldPair(before, "character.a", "character.b");
  if (!pair) throw new Error("world fixture requires the actor pair");
  const transition: BattleWorldTransition = {
    baseRevision: before.revision,
    turn: 1,
    sourceEventIds: ["event.world"],
    operations: [{
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
      orientationA: pair.orientationA,
      orientationB: pair.orientationB,
    }],
  };
  const applied = applyBattleWorldTransition({
    state: before,
    transition,
    turn: 1,
    allowedSourceEventIds: new Set(["event.world"]),
  });
  if (!applied.ok) throw new Error("world evaluation fixture did not apply");
  const relationEntries = [
    ["relation.distance", pair.distance],
    ["relation.sight", pair.sight],
    ["relation.sound", pair.sound],
    ["relation.first_orientation", pair.orientationA],
    ["relation.second_orientation", pair.orientationB],
  ] as const;
  const existingFacts = [
    oldFact({
      id: "fact.world.character-b-placement",
      subjectRef: "character.b",
      predicate: "world.placement",
      objectRef: initialPlacement.areaId,
      value: initialPlacement,
      subsystem: "world",
      authority: "validated_world_transition",
    }),
    ...relationEntries.map(([predicate, value], index) => oldFact({
      id: `fact.world.pair-${index + 1}`,
      subjectRef: "character.a",
      predicate,
      objectRef: "character.b",
      value,
      subsystem: "world",
      authority: "validated_world_transition",
    })),
  ];
  const sourceInputs = {
    before,
    after: applied.state,
    transition,
    existingFactRefs: lookup(existingFacts),
  };
  const measured = measuredConversion({
    sourceInputs,
    convert: () => convertWorldTransitionToShadowPatch(sourceInputs),
  });
  const afterPair = readBattleWorldPair(
    applied.state,
    "character.a",
    "character.b",
  );
  if (!afterPair) throw new Error("world fixture lost the actor pair");
  const afterRelationEntries = [
    ["relation.distance", afterPair.distance],
    ["relation.sight", afterPair.sight],
    ["relation.sound", afterPair.sound],
    ["relation.first_orientation", afterPair.orientationA],
    ["relation.second_orientation", afterPair.orientationB],
  ] as const;
  return {
    ...measured,
    knownEntityRefs: [
      ...Object.keys(before.entities),
      ...Object.keys(before.areas),
    ],
    existingFacts,
    expectedClaims: [{
      subjectRef: "character.b",
      predicate: "world.placement",
      objectRef: "area.remote",
      value: applied.state.entities["character.b"]!.placement,
      causalSourceRef: "event.world",
      priorFactRef: existingFacts[0]!.id,
    }, ...afterRelationEntries.map(([predicate, value], index) => ({
      subjectRef: "character.a",
      predicate,
      objectRef: "character.b",
      value,
      causalSourceRef: "event.world",
      priorFactRef: existingFacts[index + 1]!.id,
    }))],
    expectedSubsystem: "world",
    expectedAuthority: "validated_world_transition",
    fullAuthorityInput: {
      before,
      after: applied.state,
      acceptedTransition: transition,
      existingFacts,
    },
  };
}

function acceptedFreeAction(): FixtureRun {
  const battle = makeState("patch-eval-free-action");
  const before = structuredClone(battle.worldState!);
  const transition: BattleWorldTransition = {
    baseRevision: before.revision,
    turn: 1,
    sourceEventIds: ["event.free-action"],
    operations: [{
      op: "set_exposure",
      entityId: "character.a",
      exposure: "partially_concealed",
    }],
  };
  const applied = applyBattleWorldTransition({
    state: before,
    transition,
    turn: 1,
    allowedSourceEventIds: new Set(["event.free-action"]),
  });
  if (!applied.ok) throw new Error("free-action evaluation fixture did not apply");
  const receipt = {
    actionId: "turn-1-action-a",
    actorSide: "a" as const,
    intentText: "身を隠す",
    outcome: "accepted" as const,
    reason: "accepted" as const,
    subjectRef: "self",
    canonicalEntityId: "character.a",
    promotion: "not_needed" as const,
    operationKinds: ["set_exposure"],
    summary: "シロは物陰へ身を寄せた。",
  };
  const existingFacts = [oldFact({
    id: "fact.world.character-a-exposure",
    subjectRef: "character.a",
    predicate: "entity.exposure",
    value: "exposed",
    subsystem: "world",
    authority: "validated_world_transition",
  })];
  const sourceInputs = {
    before,
    after: applied.state,
    transition,
    receipt,
    existingFactRefs: lookup(existingFacts),
  };
  const measured = measuredConversion({
    sourceInputs,
    convert: () => convertFreeActionToShadowPatch(sourceInputs),
  });
  return {
    ...measured,
    knownEntityRefs: [
      ...Object.keys(before.entities),
      ...Object.keys(before.areas),
    ],
    existingFacts,
    expectedClaims: [{
      subjectRef: "character.a",
      predicate: "entity.exposure",
      value: applied.state.entities["character.a"]!.exposure,
      causalSourceRef: receipt.actionId,
      priorFactRef: existingFacts[0]!.id,
    }],
    expectedSubsystem: "free_action",
    expectedAuthority: "free_action_commit",
    fullAuthorityInput: {
      before,
      after: applied.state,
      acceptedTransition: transition,
      acceptedReceipt: receipt,
      existingFacts,
    },
  };
}

function missingPriorFact(): FixtureRun {
  const before = makeState("patch-eval-missing-prior");
  const resolved = resolveTurn({
    state: before,
    playerAction: { actorSide: "a", kind: "basic_attack" },
    sideASkills: [],
    sideBSkills: [],
  });
  const sourceInputs = {
    evidence: resolved.mechanicalEvidence,
    existingFactRefs: {},
  };
  const measured = measuredConversion({
    sourceInputs,
    convert: () => convertMechanicalEvidenceToShadowPatch(sourceInputs),
  });
  return {
    ...measured,
    knownEntityRefs: ["character.a", "character.b"],
    existingFacts: [],
    expectedClaims: [],
    fullAuthorityInput: {
      before,
      after: resolved.state,
      acceptedMechanicalEvidence: resolved.mechanicalEvidence,
    },
  };
}

function newWorldIdentity(): FixtureRun {
  const battle = makeState("patch-eval-new-identity");
  const before = structuredClone(battle.worldState!);
  const transition: BattleWorldTransition = {
    baseRevision: before.revision,
    turn: 1,
    sourceEventIds: [],
    operations: [{
      op: "add_area",
      areaId: "area.new",
      area: {
        label: "新規区画",
        illumination: "normal",
        noise: "normal",
        space: "open",
        movement: "open",
      },
    }],
  };
  const applied = applyBattleWorldTransition({
    state: before,
    transition,
    turn: 1,
  });
  if (!applied.ok) throw new Error("identity boundary fixture did not apply");
  const sourceInputs = {
    before,
    after: applied.state,
    transition,
    existingFactRefs: {},
  };
  const measured = measuredConversion({
    sourceInputs,
    convert: () => convertWorldTransitionToShadowPatch(sourceInputs),
  });
  return {
    ...measured,
    knownEntityRefs: [
      ...Object.keys(before.entities),
      ...Object.keys(before.areas),
    ],
    existingFacts: [],
    expectedClaims: [],
    fullAuthorityInput: {
      before,
      after: applied.state,
      acceptedTransition: transition,
    },
  };
}

const fixtureRunners: Record<string, () => FixtureRun> = {
  mechanical_parameter_change: mechanicalParameterChange,
  semantic_visible_condition: semanticVisibleCondition,
  world_placement_and_pair: worldPlacementAndPair,
  accepted_free_action: acceptedFreeAction,
  missing_prior_fact: missingPriorFact,
  new_world_identity: newWorldIdentity,
};

function validateFixtureFile(raw: unknown): PatchFixtureFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("patch fixture must be an object");
  }
  const fixture = raw as PatchFixtureFile;
  if (fixture.schemaVersion !== 1 || !fixture.fixtureVersion) {
    throw new Error("unsupported patch fixture schema");
  }
  if (!Array.isArray(fixture.fixtures) || fixture.fixtures.length === 0) {
    throw new Error("patch fixture file has no conversion fixtures");
  }
  if (!Array.isArray(fixture.defectSeeds) || fixture.defectSeeds.length === 0) {
    throw new Error("patch fixture file has no defect seeds");
  }
  const fixtureIds = new Set<string>();
  for (const item of fixture.fixtures) {
    if (!item.id || fixtureIds.has(item.id) || !fixtureRunners[item.runner]) {
      throw new Error(`invalid conversion fixture: ${item.id}`);
    }
    fixtureIds.add(item.id);
    if (!["converted", "indeterminate"].includes(item.expectedStatus)) {
      throw new Error(`invalid expected conversion status: ${item.id}`);
    }
  }
  const seedIds = new Set<string>();
  for (const seed of fixture.defectSeeds) {
    if (!seed.id || seedIds.has(seed.id)) {
      throw new Error(`duplicate or missing defect seed ID: ${seed.id}`);
    }
    seedIds.add(seed.id);
  }
  for (const [key, value] of Object.entries(fixture.thresholds)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`invalid patch threshold: ${key}`);
    }
  }
  return fixture;
}

function claimKey(claim: {
  subjectRef: string;
  predicate: string;
  objectRef?: string;
  value?: SemanticValue;
}): string {
  return JSON.stringify(canonicalize([
    claim.subjectRef,
    claim.predicate,
    claim.objectRef ?? null,
    Object.hasOwn(claim, "value") ? ["present", claim.value] : ["absent"],
  ]));
}

function reconstructedTouchedClaims(input: {
  patch: ShadowCanonicalPatch;
  existingFacts: ShadowCanonicalFact[];
}): string[] {
  const retracted = new Set(input.patch.retractions);
  return [
    ...input.existingFacts.filter((fact) => !retracted.has(fact.id)),
    ...input.patch.assertions,
  ]
    .filter((fact) => input.patch.touchedRefs.includes(fact.subjectRef))
    .map(claimKey)
    .sort((left, right) => left.localeCompare(right));
}

function patchLimitViolationCount(patch: ShadowCanonicalPatch): number {
  let count = serializedBytes(patch) > CANONICAL_PATCH_POC_LIMITS.maxPatchBytes
    ? 1
    : 0;
  if (patch.assertions.length > CANONICAL_PATCH_POC_LIMITS.maxAssertions) count += 1;
  if (patch.retractions.length > CANONICAL_PATCH_POC_LIMITS.maxRetractions) count += 1;
  if (patch.causalLinks.length > CANONICAL_PATCH_POC_LIMITS.maxCausalLinks) count += 1;
  if (patch.touchedRefs.length > CANONICAL_PATCH_POC_LIMITS.maxTouchedRefs) count += 1;
  return count;
}

function aggregateFixture(input: {
  fixture: ConversionFixture;
  repetitions: number;
}): FixtureAggregate {
  let classificationMatches = 0;
  let expectedClaimCount = 0;
  let matchedAssertionCount = 0;
  let expectedRetractionCount = 0;
  let matchedRetractionCount = 0;
  let reconstructedPostStateMatches = 0;
  let expectedCausalLinkCount = 0;
  let matchedCausalLinkCount = 0;
  let falseRejectionCount = 0;
  let unexplainedStateChangeCount = 0;
  let authorityRegressionCount = 0;
  let sourceMutationCount = 0;
  let schemaFailureCount = 0;
  let patchLimitViolations = 0;
  let fullAuthorityInputBytes = 0;
  let boundedAuditInputBytes = 0;
  const latencies: number[] = [];

  for (let repetition = 0; repetition < input.repetitions; repetition += 1) {
    const run = fixtureRunners[input.fixture.runner]!();
    latencies.push(run.conversionLatencyMs);
    if (run.sourceMutated) sourceMutationCount += 1;
    try {
      ShadowPatchConversionResultSchema.parse(run.conversion);
    } catch {
      schemaFailureCount += 1;
    }
    if (run.conversion.status === input.fixture.expectedStatus) {
      classificationMatches += 1;
    }
    if (input.fixture.expectedStatus !== "converted") continue;

    expectedClaimCount += run.expectedClaims.length;
    expectedRetractionCount += run.expectedClaims.filter((claim) =>
      claim.priorFactRef
    ).length;
    expectedCausalLinkCount += run.expectedClaims.length +
      run.expectedClaims.filter((claim) => claim.priorFactRef).length;
    fullAuthorityInputBytes += serializedBytes(run.fullAuthorityInput);
    if (run.conversion.status !== "converted") continue;

    const patch = run.conversion.patch;
    try {
      ShadowCanonicalPatchSchema.parse(patch);
    } catch {
      schemaFailureCount += 1;
      continue;
    }
    const context: ShadowPatchAuditContext = {
      knownEntityRefs: run.knownEntityRefs,
      existingFacts: run.existingFacts,
    };
    const audit = auditShadowCanonicalPatch({ patch, context });
    if (audit.verdict !== "no_issue_found") falseRejectionCount += 1;
    boundedAuditInputBytes += serializedBytes({ patch, context });
    patchLimitViolations += patchLimitViolationCount(patch);

    const expectedKeys = new Set(run.expectedClaims.map(claimKey));
    const actualKeys = new Set(patch.assertions.map(claimKey));
    matchedAssertionCount += [...expectedKeys]
      .filter((key) => actualKeys.has(key)).length;
    unexplainedStateChangeCount += [...actualKeys]
      .filter((key) => !expectedKeys.has(key)).length;

    const expectedRetractions = new Set(run.expectedClaims.flatMap((claim) =>
      claim.priorFactRef ? [claim.priorFactRef] : []
    ));
    const actualRetractions = new Set(patch.retractions);
    matchedRetractionCount += [...expectedRetractions]
      .filter((factRef) => actualRetractions.has(factRef)).length;
    unexplainedStateChangeCount += [...actualRetractions]
      .filter((factRef) => !expectedRetractions.has(factRef)).length;

    const expectedPost = run.expectedClaims.map(claimKey)
      .sort((left, right) => left.localeCompare(right));
    if (
      JSON.stringify(reconstructedTouchedClaims({
        patch,
        existingFacts: run.existingFacts,
      })) === JSON.stringify(expectedPost)
    ) {
      reconstructedPostStateMatches += 1;
    }

    for (const claim of run.expectedClaims) {
      const assertion = patch.assertions.find((fact) =>
        claimKey(fact) === claimKey(claim)
      );
      if (assertion && patch.causalLinks.some((link) =>
        link.targetFactRef === assertion.id &&
        link.sourceRef === claim.causalSourceRef &&
        link.relation === (claim.priorFactRef ? "modified" : "created")
      )) {
        matchedCausalLinkCount += 1;
      }
      if (claim.priorFactRef && patch.causalLinks.some((link) =>
        link.targetFactRef === claim.priorFactRef &&
        link.sourceRef === claim.causalSourceRef &&
        link.relation === "ended"
      )) {
        matchedCausalLinkCount += 1;
      }
    }

    if (patch.mode !== "shadow") authorityRegressionCount += 1;
    authorityRegressionCount += patch.assertions.filter((fact) =>
      fact.provenance.subsystem !== run.expectedSubsystem ||
      fact.provenance.authority !== run.expectedAuthority
    ).length;
  }

  const expectedConvertedRuns = input.fixture.expectedStatus === "converted"
    ? input.repetitions
    : 0;
  return {
    id: input.fixture.id,
    expectedStatus: input.fixture.expectedStatus,
    repetitions: input.repetitions,
    classificationMatches,
    classificationAccuracy: ratio(classificationMatches, input.repetitions),
    expectedClaimCount,
    matchedAssertionCount,
    assertionParity: ratio(matchedAssertionCount, expectedClaimCount),
    expectedRetractionCount,
    matchedRetractionCount,
    retractionParity: ratio(matchedRetractionCount, expectedRetractionCount),
    reconstructedPostStateMatches,
    reconstructedPostStateParity: ratio(
      reconstructedPostStateMatches,
      expectedConvertedRuns,
    ),
    expectedCausalLinkCount,
    matchedCausalLinkCount,
    causalSourceParity: ratio(matchedCausalLinkCount, expectedCausalLinkCount),
    falseRejectionCount,
    unexplainedStateChangeCount,
    authorityRegressionCount,
    sourceMutationCount,
    schemaFailureCount,
    patchLimitViolationCount: patchLimitViolations,
    fullAuthorityInputBytes: input.repetitions === 0
      ? 0
      : Math.round(fullAuthorityInputBytes / input.repetitions),
    boundedAuditInputBytes: input.repetitions === 0
      ? 0
      : Math.round(boundedAuditInputBytes / input.repetitions),
    auditScopeByteReduction: fullAuthorityInputBytes === 0
      ? 0
      : round(1 - boundedAuditInputBytes / fullAuthorityInputBytes),
    conversionLatencyMs: {
      mean: round(mean(latencies)),
      p95: round(percentile(latencies, 95)),
      minimum: round(Math.min(...latencies)),
      maximum: round(Math.max(...latencies)),
    },
  };
}

function mutateAuditProbe(mutation: DefectMutation): {
  patch: unknown;
  context: ShadowPatchAuditContext;
} {
  const base = mechanicalParameterChange();
  if (base.conversion.status !== "converted") {
    throw new Error("defect seed base conversion was indeterminate");
  }
  const patch = structuredClone(base.conversion.patch);
  const context: ShadowPatchAuditContext = {
    knownEntityRefs: [...base.knownEntityRefs],
    existingFacts: structuredClone(base.existingFacts),
  };
  const assertion = patch.assertions[0];
  if (!assertion) throw new Error("defect seed base patch has no assertion");

  if (mutation === "invalid_schema") {
    return { patch: { ...patch, mode: "authoritative" }, context };
  }
  if (mutation === "patch_too_large") {
    return { patch, context: { ...context, maxPatchBytes: 1 } };
  }
  if (mutation === "unknown_entity_reference") {
    assertion.subjectRef = "character.unknown";
    patch.touchedRefs.push("character.unknown");
  } else if (mutation === "missing_retraction") {
    patch.retractions.push("fact.missing");
    patch.causalLinks.push({
      sourceRef: "defect-seed",
      targetFactRef: "fact.missing",
      relation: "ended",
    });
  } else if (mutation === "direct_conflict") {
    const priorFactRef = base.expectedClaims[0]?.priorFactRef;
    if (!priorFactRef) throw new Error("conflict seed has no prior fact");
    patch.retractions = patch.retractions.filter((ref) => ref !== priorFactRef);
    patch.causalLinks = patch.causalLinks.filter((link) =>
      link.targetFactRef !== priorFactRef
    );
  } else if (mutation === "forbidden_state") {
    assertion.value = -1;
  } else if (mutation === "missing_causal_link") {
    patch.causalLinks = patch.causalLinks.filter((link) =>
      link.targetFactRef !== assertion.id
    );
  } else if (mutation === "invalid_causal_target") {
    const link = patch.causalLinks.find((candidate) =>
      candidate.targetFactRef === assertion.id
    );
    if (!link) throw new Error("causal-target seed has no assertion link");
    link.relation = "ended";
  } else if (mutation === "incomplete_touched_refs") {
    patch.touchedRefs = patch.touchedRefs.filter((ref) =>
      ref !== assertion.subjectRef
    );
  } else if (mutation === "authority_mismatch") {
    assertion.provenance.authority = "validated_world_transition";
  } else if (mutation === "incomplete_context") {
    return { patch, context: { ...context, contextComplete: false } };
  }
  return { patch: ShadowCanonicalPatchSchema.parse(patch), context };
}

function aggregateDefectSeed(input: {
  seed: DefectSeed;
  repetitions: number;
}): DefectAggregate {
  let detections = 0;
  const issueCodes = new Set<PatchAuditIssueCode>();
  const verdicts = new Set<
    "no_issue_found" | "issue_found" | "indeterminate"
  >();
  for (let repetition = 0; repetition < input.repetitions; repetition += 1) {
    const probe = mutateAuditProbe(input.seed.mutation);
    const result = auditShadowCanonicalPatch(probe);
    verdicts.add(result.verdict);
    for (const issue of result.issues) issueCodes.add(issue.code);
    if (
      result.verdict === input.seed.expectedVerdict &&
      result.issues.some((issue) => issue.code === input.seed.expectedIssueCode)
    ) {
      detections += 1;
    }
  }
  return {
    id: input.seed.id,
    mutation: input.seed.mutation,
    expectedIssueCode: input.seed.expectedIssueCode,
    expectedVerdict: input.seed.expectedVerdict,
    repetitions: input.repetitions,
    detections,
    recall: ratio(detections, input.repetitions),
    observedIssueCodes: [...issueCodes].sort(),
    observedVerdicts: [...verdicts].sort(),
  };
}

function staticAuthorityCheck(patchSourceText: string): {
  runtimeIntegrationFileRefs: string[];
  exportedCommitFunctionCount: number;
} {
  const references = gitLines([
    "grep",
    "-l",
    "-E",
    "convert(MechanicalEvidence|SemanticTransition|WorldTransition|FreeAction)ToShadowPatch|auditShadowCanonicalPatch",
    "--",
    "*.ts",
  ]);
  const allowedSourceFiles = new Set([
    "packages/shared/src/battle-canonical-patch.ts",
    "packages/shared/src/battle-integrated-shadow-turn.ts",
    "packages/shared/src/battle-read-coherence.ts",
    "backend/src/scripts/evaluate-battle-canonical-patch-poc.ts",
  ]);
  const runtimeIntegrationFileRefs = references.filter((file) =>
    !allowedSourceFiles.has(file) && !file.endsWith(".test.ts")
  );
  const exportedCommitFunctionCount = [
    ...patchSourceText.matchAll(
      /export\s+(?:async\s+)?function\s+\w*commit\w*/giu,
    ),
  ].length;
  return {
    runtimeIntegrationFileRefs,
    exportedCommitFunctionCount,
  };
}

function decisionFor(input: {
  aggregate: PatchEvaluationReport["aggregate"];
  convertedFixtureCount: number;
  defectSeedCount: number;
}): PatchEvaluationReport["decision"] {
  if (input.convertedFixtureCount === 0 || input.defectSeedCount === 0) {
    return {
      label: "indeterminate",
      reasons: ["The frozen corpus did not contain enough converted and defect-seed cases."],
      boundedRevisionHypotheses: [],
    };
  }
  if (!input.aggregate.hardInvariantsPass) {
    return {
      label: "unsupported",
      reasons: [
        "One or more non-tradeable conversion parity, causality, immutability, boundedness, or authority invariants failed.",
      ],
      boundedRevisionHypotheses: [],
    };
  }
  const reasons: string[] = [];
  const hypotheses: string[] = [];
  if (!input.aggregate.seededDefectRecallPass) {
    reasons.push(
      `Seeded-defect recall ${input.aggregate.seededDefectRecall} is below the frozen minimum.`,
    );
    hypotheses.push(
      "Add only the missing deterministic audit rule and retain the same frozen defect corpus.",
    );
  }
  if (!input.aggregate.falseRejectionPass) {
    reasons.push(
      `False rejection count ${input.aggregate.falseRejectionCount} exceeds the frozen maximum.`,
    );
    hypotheses.push(
      "Narrow the rejecting rule to the conflicting claim and preserve indeterminate for incomplete context.",
    );
  }
  if (!input.aggregate.auditScopeByteReductionPass) {
    reasons.push(
      `Audit-scope byte reduction ${input.aggregate.auditScopeByteReduction} is below the frozen minimum.`,
    );
    hypotheses.push(
      "Remove duplicated authoritative envelopes from audit input while retaining impacted current facts and causal sources.",
    );
  }
  if (reasons.length > 0) {
    return { label: "revise", reasons, boundedRevisionHypotheses: hypotheses };
  }
  return {
    label: "supported",
    reasons: ["Every frozen hard invariant and effectiveness proxy passed."],
    boundedRevisionHypotheses: [],
  };
}

export async function evaluateBattleCanonicalPatchPoc(input: {
  fixturePath?: string;
  repetitions?: number;
  now?: () => Date;
} = {}): Promise<PatchEvaluationReport> {
  const fixturePath = path.resolve(input.fixturePath ?? defaultFixturePath);
  const fixtureText = await fs.readFile(fixturePath, "utf8");
  const fixture = validateFixtureFile(JSON.parse(fixtureText) as unknown);
  const repetitions = input.repetitions ?? fixture.repetitions;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new Error("repetitions must be an integer from 1 through 100");
  }

  const fixtures = fixture.fixtures.map((item) => aggregateFixture({
    fixture: item,
    repetitions,
  }));
  const defectSeeds = fixture.defectSeeds.map((seed) => aggregateDefectSeed({
    seed,
    repetitions,
  }));
  const evaluatorPath = fileURLToPath(import.meta.url);
  const patchSourcePath = path.join(
    repositoryRoot,
    "packages/shared/src/battle-canonical-patch.ts",
  );
  const [evaluatorText, patchSourceText] = await Promise.all([
    fs.readFile(evaluatorPath, "utf8"),
    fs.readFile(patchSourcePath, "utf8"),
  ]);
  const authorityCheck = staticAuthorityCheck(patchSourceText);
  const sumFixture = (key: keyof FixtureAggregate) => fixtures.reduce(
    (sum, item) => sum + (typeof item[key] === "number" ? item[key] : 0),
    0,
  );
  const conversionAttempts = repetitions * fixtures.length;
  const classificationMatches = sumFixture("classificationMatches");
  const convertedFixtureCount = fixture.fixtures.filter((item) =>
    item.expectedStatus === "converted"
  ).length;
  const reconstructedExpectedRuns = convertedFixtureCount * repetitions;
  const expectedCausalLinkCount = sumFixture("expectedCausalLinkCount");
  const fullBytes = fixtures.reduce(
    (sum, item) => sum + item.fullAuthorityInputBytes * repetitions,
    0,
  );
  const auditBytes = fixtures.reduce(
    (sum, item) => sum + item.boundedAuditInputBytes * repetitions,
    0,
  );
  const seededDetections = defectSeeds.reduce(
    (sum, seed) => sum + seed.detections,
    0,
  );
  const totalSeedRuns = defectSeeds.length * repetitions;
  const authorityRegressionCount = sumFixture("authorityRegressionCount") +
    authorityCheck.runtimeIntegrationFileRefs.length +
    authorityCheck.exportedCommitFunctionCount;
  const aggregateBase = {
    conversionClassificationAccuracy: ratio(
      classificationMatches,
      conversionAttempts,
    ),
    reconstructedPostStateParity: ratio(
      sumFixture("reconstructedPostStateMatches"),
      reconstructedExpectedRuns,
    ),
    causalSourceParity: ratio(
      sumFixture("matchedCausalLinkCount"),
      expectedCausalLinkCount,
    ),
    seededDefectRecall: ratio(seededDetections, totalSeedRuns),
    falseRejectionCount: sumFixture("falseRejectionCount"),
    unexplainedStateChangeCount: sumFixture("unexplainedStateChangeCount"),
    authorityRegressionCount,
    sourceMutationCount: sumFixture("sourceMutationCount"),
    schemaFailureCount: sumFixture("schemaFailureCount"),
    patchLimitViolationCount: sumFixture("patchLimitViolationCount"),
    auditScopeByteReduction: fullBytes === 0
      ? 0
      : round(1 - auditBytes / fullBytes),
  };
  const hardInvariantsPass =
    aggregateBase.conversionClassificationAccuracy >=
      fixture.thresholds.conversionClassificationAccuracyMinimum &&
    aggregateBase.reconstructedPostStateParity >=
      fixture.thresholds.reconstructedPostStateParityMinimum &&
    aggregateBase.causalSourceParity >=
      fixture.thresholds.causalSourceParityMinimum &&
    aggregateBase.unexplainedStateChangeCount <=
      fixture.thresholds.unexplainedStateChangeCountMaximum &&
    aggregateBase.authorityRegressionCount <=
      fixture.thresholds.authorityRegressionCountMaximum &&
    aggregateBase.sourceMutationCount <=
      fixture.thresholds.sourceMutationCountMaximum &&
    aggregateBase.schemaFailureCount <=
      fixture.thresholds.schemaFailureCountMaximum &&
    aggregateBase.patchLimitViolationCount <=
      fixture.thresholds.patchLimitViolationCountMaximum;
  const aggregate: PatchEvaluationReport["aggregate"] = {
    ...aggregateBase,
    hardInvariantsPass,
    seededDefectRecallPass:
      aggregateBase.seededDefectRecall >=
        fixture.thresholds.seededDefectRecallMinimum,
    falseRejectionPass:
      aggregateBase.falseRejectionCount <=
        fixture.thresholds.falseRejectionCountMaximum,
    auditScopeByteReductionPass:
      aggregateBase.auditScopeByteReduction >=
        fixture.thresholds.auditScopeByteReductionMinimum,
  };

  return {
    schemaVersion: 1,
    fixtureVersion: fixture.fixtureVersion,
    generatedAt: (input.now?.() ?? new Date()).toISOString(),
    mode: "canonical_patch_poc_evaluation",
    provenance: {
      gitHead: gitOutput(["rev-parse", "HEAD"]),
      workingTreeDirty: gitOutput(["status", "--porcelain"]) !== "",
      nodeVersion: process.version,
      fixturePath: path.relative(repositoryRoot, fixturePath),
      fixtureSha256: sha256(fixtureText),
      evaluatorPath: path.relative(repositoryRoot, evaluatorPath),
      evaluatorSha256: sha256(evaluatorText),
      patchSourcePath: path.relative(repositoryRoot, patchSourcePath),
      patchSourceSha256: sha256(patchSourceText),
    },
    execution: {
      repetitionsPerCase: repetitions,
      conversionFixtureCount: fixtures.length,
      conversionAttempts,
      defectSeedCount: defectSeeds.length,
      defectAudits: totalSeedRuns,
      externalLlmCallsMade: 0,
      xaiUsed: false,
      xaiReason:
        "Every scored claim, authority owner, and seeded defect is explicit structured ground truth; XAI would add a second judgment path rather than resolve semantic ambiguity.",
    },
    thresholds: fixture.thresholds,
    fixtures,
    defectSeeds,
    staticAuthorityCheck: authorityCheck,
    aggregate,
    decision: decisionFor({
      aggregate,
      convertedFixtureCount,
      defectSeedCount: defectSeeds.length,
    }),
    limitations: [
      "Parity covers only the selected mechanical, semantic, world, and accepted free-action transitions in the frozen corpus.",
      "Seeded-defect recall measures explicit implemented issue categories, not every implicit cross-object contradiction.",
      "Scope reduction is a serialized-byte proxy and does not prove that every omitted fact is irrelevant.",
      "Static authority scanning checks tracked TypeScript references and exported commit functions; it is not a whole-program capability proof.",
      "The evaluator does not persist or commit a shadow patch and does not execute a live battle-service path.",
      "No XAI call was needed because the evaluated outputs are structured rather than semantic or narrative judgments.",
      "A supported result would not guarantee a globally consistent or objectively correct final battle result.",
    ],
  };
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
  const report = await evaluateBattleCanonicalPatchPoc({
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
    console.error(`[battle-canonical-patch-poc] wrote ${args.outputPath}`);
    return;
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
