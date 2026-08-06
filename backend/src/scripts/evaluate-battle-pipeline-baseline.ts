import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BattleStateSchema,
  applyBattleWorldTransition,
  createBattleState,
  defaultParameters,
  ensureBattleCompatibilityState,
  resolveTurn,
  type BattleState,
  type CharacterSheet,
  type CommittedMechanicalEvidence,
  type ResolvedBattleAction,
  type TurnEvent,
} from "@kshiai/shared";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaultCorpusPath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-poc-corpus-v1.json",
);
const fixedTime = "2026-08-06T00:00:00.000Z";

type ExecutionMode =
  | "local_harness"
  | "existing_evidence"
  | "automated_test_reference"
  | "future_blind_review";

type CorpusScenario = {
  id: string;
  category: string;
  executionMode: ExecutionMode;
  runner?: string;
  evidencePath?: string;
  expectedSha256?: string;
  testCommand?: string;
  historicalReferencePath?: string;
  hypothesis: string;
  hardInvariants: string[];
  humanRubricPrompts: string[];
};

type BaselineCorpus = {
  schemaVersion: 1;
  corpusVersion: string;
  frozenAt: string;
  purpose: string;
  repetitions: {
    localDeterministic: number;
    liveLlmMinimum: number;
    blindHumanComparisonsPerIntervention: number;
  };
  decisionLabels: string[];
  hardInvariantPolicy: {
    description: string;
    requiredPassRate: number;
    failureDecision: string;
  };
  decisionRubric: Record<string, string>;
  globalMetrics: Record<string, string[]>;
  interventionThresholds: Record<string, unknown>;
  currentCallTopology: Record<string, unknown>;
  scenarios: CorpusScenario[];
};

type CheckCategory =
  | "schema"
  | "authority"
  | "privacy"
  | "atomicity"
  | "causality"
  | "coherence"
  | "temporal"
  | "side_neutrality";

type ScenarioCheck = {
  id: string;
  category: CheckCategory;
  passed: boolean;
  detail: string;
};

type ScenarioObservation = {
  outcome: unknown;
  checks: ScenarioCheck[];
  sizes: {
    stateBeforeBytes: number;
    stateAfterBytes: number;
    worldStateBytes: number;
    perceptionBytes: number;
    eventsBytes: number;
    actionsBytes: number;
    mechanicalEvidenceBytes: number;
    projectionBytes: null;
  };
  counts: {
    unsupportedStructuredClaims: number;
    causalReferenceGaps: number;
    authorityViolations: number;
    privacyLeaks: number;
    atomicityFailures: number;
    sideSwapMismatches: number;
    llmCalls: 0;
  };
};

type LocalScenarioAggregate = {
  id: string;
  category: string;
  hypothesis: string;
  repetitions: number;
  distinctOutcomeDigests: number;
  stableAcrossRepetitions: boolean;
  outcomeDigest: string;
  latencyMs: {
    mean: number;
    p95: number;
    minimum: number;
    maximum: number;
  };
  sizeBytes: ScenarioObservation["sizes"];
  checks: Array<{
    id: string;
    category: CheckCategory;
    passCount: number;
    failCount: number;
    details: string[];
  }>;
  counts: ScenarioObservation["counts"];
  baselineOutcome: unknown;
};

type BaselineReport = {
  schemaVersion: 1;
  corpusVersion: string;
  generatedAt: string;
  mode: "local_current_pipeline";
  provenance: {
    gitHead: string;
    workingTreeDirty: boolean;
    nodeVersion: string;
    corpusPath: string;
    corpusSha256: string;
    evaluatorPath: string;
    evaluatorSha256: string;
  };
  execution: {
    externalLlmCallsMade: 0;
    localRepetitions: number;
    localScenarioCount: number;
    existingEvidenceCount: number;
    automatedTestReferenceCount: number;
    futureBlindReviewCount: number;
  };
  currentCallTopology: Record<string, unknown>;
  localScenarios: LocalScenarioAggregate[];
  existingEvidence: Array<{
    id: string;
    path: string;
    expectedSha256: string;
    actualSha256: string;
    hashMatches: boolean;
    summary: unknown;
  }>;
  automatedTestReferences: Array<{
    id: string;
    command: string;
    status: "not_run_by_harness";
  }>;
  humanQualityBaseline: {
    status: "unmeasured";
    reason: string;
    historicalReferences: string[];
    rubricPrompts: string[];
  };
  aggregate: {
    hardCheckPassCount: number;
    hardCheckFailCount: number;
    schemaValidityRate: number;
    authorityViolationCount: number;
    privacyLeakCount: number;
    atomicityFailureCount: number;
    causalReferenceGapCount: number;
    sideSwapMismatchCount: number;
    unsupportedStructuredClaimCount: number;
    allLocalOutcomesStable: boolean;
    existingEvidenceHashesMatch: boolean;
  };
  limitations: string[];
};

type ResolveResult = ReturnType<typeof resolveTurn>;
type LocalRunner = () => ScenarioObservation;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
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

function outcomeDigest(value: unknown): string {
  return sha256(JSON.stringify(canonicalize(value)));
}

function check(
  id: string,
  category: CheckCategory,
  passed: boolean,
  detail: string,
): ScenarioCheck {
  return { id, category, passed, detail };
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
    ownerUserId: "baseline-owner",
    displayName,
    tags: ["baseline"],
    createdAt: fixedTime,
    updatedAt: fixedTime,
    appearance: {
      summary: `${displayName}の固定fixture外見`,
      visualPrompt: "baseline fixture",
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
    weapon: {
      name: "固定fixture剣",
      description: "baseline用の剣。",
      atkBonus: 0,
      defBonus: 0,
      magBonus: 0,
    },
    armor: null,
    combatFlags: {
      canFight: true,
      irreversibleIncapacitated: false,
    },
    narrativeBlurb: "PoC baseline用の固定キャラクター。",
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
  return state;
}

function normalizedResolutionOutcome(result: ResolveResult): unknown {
  return {
    turn: result.state.turn,
    status: result.state.status,
    winnerSide: result.state.winnerSide,
    finishReason: result.state.finishReason,
    aftermathPending: result.state.aftermathPending,
    sideA: {
      characterId: result.state.sideA.characterId,
      parameters: result.state.sideA.parameters,
      defending: result.state.sideA.defending,
      canFight: result.state.sideA.canFight,
    },
    sideB: {
      characterId: result.state.sideB.characterId,
      parameters: result.state.sideB.parameters,
      defending: result.state.sideB.defending,
      canFight: result.state.sideB.canFight,
    },
    actions: result.actions.map((action) => ({
      id: action.id,
      actorSide: action.actorSide,
      kind: action.kind,
      skillId: action.skillId ?? null,
      executed: action.executed,
      skippedReason: action.skippedReason,
      resolution: action.resolution ?? null,
    })),
    events: result.events.map((event) => ({
      id: event.id ?? null,
      type: event.type,
      actorSide: event.actorSide ?? null,
      targetSides: event.targetSides ?? [],
      sourceActionId: event.sourceActionId ?? null,
      parameterKey: event.parameterKey ?? null,
      parameterDirection: event.parameterDirection ?? null,
      intensity: event.intensity ?? null,
      summary: event.summary,
    })),
    mechanicalEvidence: result.mechanicalEvidence.map((item) => ({
      evidenceId: item.evidenceId,
      sourceActionId: item.sourceActionId,
      actorSide: item.actorSide,
      target: item.target,
      parameterKey: item.parameterKey,
      attemptedDelta: item.attemptedDelta,
      delta: item.delta,
      basisEventIds: item.basisEventIds,
    })),
    temporalResolution: result.state.latestTemporalResolution ?? null,
    worldRevision: result.state.worldState?.revision ?? null,
    perceptionAccess: {
      a: result.state.perceptionFrameA?.counterpart.currentAccess ?? null,
      b: result.state.perceptionFrameB?.counterpart.currentAccess ?? null,
    },
  };
}

function causalReferenceGapCount(input: {
  actions: ResolvedBattleAction[];
  events: TurnEvent[];
  evidence: CommittedMechanicalEvidence[];
}): number {
  const actionIds = new Set(input.actions.map((action) => action.id));
  const eventIds = new Set(
    input.events.flatMap((event) => event.id ? [event.id] : []),
  );
  return input.evidence.reduce((gaps, item) => {
    const missingAction = item.sourceActionId !== null &&
      !actionIds.has(item.sourceActionId);
    const missingEvents = item.basisEventIds.filter((id) => !eventIds.has(id)).length;
    return gaps + (missingAction ? 1 : 0) + missingEvents;
  }, 0);
}

function unsupportedStructuredClaimCount(input: {
  events: TurnEvent[];
  evidence: CommittedMechanicalEvidence[];
}): number {
  const referencedEvents = new Set(
    input.evidence.flatMap((item) => item.basisEventIds),
  );
  return input.events.filter((event) =>
    ["damage", "heal", "parameter"].includes(event.type) &&
    (!event.id || !referencedEvents.has(event.id))
  ).length;
}

function resolutionObservation(input: {
  before: BattleState;
  result: ResolveResult;
  scenarioChecks: ScenarioCheck[];
  authorityViolations?: number;
  privacyLeaks?: number;
  atomicityFailures?: number;
  sideSwapMismatches?: number;
  outcome?: unknown;
}): ScenarioObservation {
  const eventIds = input.result.events.flatMap((event) =>
    event.id ? [event.id] : []
  );
  const causalGaps = causalReferenceGapCount({
    actions: input.result.actions,
    events: input.result.events,
    evidence: input.result.mechanicalEvidence,
  });
  const unsupportedClaims = unsupportedStructuredClaimCount({
    events: input.result.events,
    evidence: input.result.mechanicalEvidence,
  });
  const genericChecks = [
    check(
      "battle_state_schema_valid",
      "schema",
      BattleStateSchema.safeParse(input.result.state).success,
      "BattleStateSchema accepts the post-resolution state",
    ),
    check(
      "event_ids_unique",
      "causality",
      eventIds.length === input.result.events.length &&
        new Set(eventIds).size === eventIds.length,
      "every committed event has one unique ID",
    ),
    check(
      "causal_references_resolve",
      "causality",
      causalGaps === 0,
      `missing action or event references: ${causalGaps}`,
    ),
    check(
      "public_event_summaries_hide_raw_numbers",
      "privacy",
      input.result.events.every((event) => !/[0-9]{2,}/.test(event.summary)),
      "event summaries contain no multi-digit raw totals",
    ),
  ];
  const perception = {
    a: input.result.state.perceptionFrameA,
    b: input.result.state.perceptionFrameB,
  };
  const counts = {
    unsupportedStructuredClaims: unsupportedClaims,
    causalReferenceGaps: causalGaps,
    authorityViolations: input.authorityViolations ?? 0,
    privacyLeaks: input.privacyLeaks ?? 0,
    atomicityFailures: input.atomicityFailures ?? 0,
    sideSwapMismatches: input.sideSwapMismatches ?? 0,
    llmCalls: 0 as const,
  };
  return {
    outcome: input.outcome ?? normalizedResolutionOutcome(input.result),
    checks: [...genericChecks, ...input.scenarioChecks],
    sizes: {
      stateBeforeBytes: serializedBytes(input.before),
      stateAfterBytes: serializedBytes(input.result.state),
      worldStateBytes: serializedBytes(input.result.state.worldState ?? null),
      perceptionBytes: serializedBytes(perception),
      eventsBytes: serializedBytes(input.result.events),
      actionsBytes: serializedBytes(input.result.actions),
      mechanicalEvidenceBytes: serializedBytes(input.result.mechanicalEvidence),
      projectionBytes: null,
    },
    counts,
  };
}

function ordinaryAttack(): ScenarioObservation {
  const a = makeSheet("fighter-a", "アオ");
  const b = makeSheet("fighter-b", "クロ");
  const before = makeState("baseline-ordinary", a, b);
  before.plannedActionA = { kind: "skill", skillId: "slash" };
  before.plannedActionB = { kind: "wait" };
  const result = resolveTurn({
    state: before,
    sideASkills: a.skills,
    sideBSkills: b.skills,
  });
  const actionA = result.actions.find((action) => action.actorSide === "a");
  return resolutionObservation({
    before,
    result,
    scenarioChecks: [
      check(
        "ordinary_requested_action_accepted",
        "coherence",
        actionA?.kind === "skill" &&
          actionA.executed &&
          actionA.resolution?.outcome === "accepted",
        "Side A's in-range slash is accepted and executed",
      ),
      check(
        "ordinary_damage_has_structured_evidence",
        "causality",
        result.mechanicalEvidence.some((item) =>
          item.sourceActionId === actionA?.id &&
          item.target.side === "b" &&
          item.parameterKey === "hp"
        ),
        "Side A damage is linked to its committed action",
      ),
    ],
  });
}

function remoteOutOfRange(): ScenarioObservation {
  const a = makeSheet("fighter-a", "アオ");
  const b = makeSheet("fighter-b", "クロ");
  const before = makeState("baseline-remote", a, b);
  const moved = applyBattleWorldTransition({
    state: before.worldState!,
    turn: 0,
    transition: {
      baseRevision: before.worldState!.revision,
      turn: 0,
      operations: [
        {
          op: "add_area",
          areaId: "area.remote",
          area: {
            label: "遠隔区画",
            illumination: "normal",
            noise: "normal",
            space: "open",
            movement: "open",
          },
        },
        {
          op: "set_placement",
          entityId: "character.b",
          placement: { type: "scene", areaId: "area.remote" },
        },
        {
          op: "set_pair_relation",
          entityAId: "character.a",
          entityBId: "character.b",
          distance: "separate_area",
          sight: "blocked",
          sound: "partial",
          orientationA: "indeterminate",
          orientationB: "indeterminate",
        },
      ],
    },
  });
  if (!moved.ok) throw new Error(`remote fixture transition failed: ${moved.error.message}`);
  before.worldState = moved.state;
  before.plannedActionA = { kind: "basic_attack" };
  before.plannedActionB = { kind: "wait" };
  const result = resolveTurn({
    state: before,
    sideASkills: a.skills,
    sideBSkills: b.skills,
  });
  const actionA = result.actions.find((action) => action.actorSide === "a");
  const remoteDamage = result.mechanicalEvidence.some((item) =>
    item.sourceActionId === actionA?.id &&
    item.target.side === "b" &&
    item.parameterKey === "hp" &&
    item.delta < 0
  );
  return resolutionObservation({
    before,
    result,
    scenarioChecks: [
      check(
        "out_of_range_action_not_executed_as_requested",
        "coherence",
        actionA?.resolution?.outcome === "substituted" &&
          actionA.resolution.reason === "out_of_range",
        "the requested basic attack is substituted because the target is in another area",
      ),
      check(
        "no_remote_damage_from_rejected_action",
        "causality",
        !remoteDamage,
        "the rejected requested attack creates no target damage",
      ),
    ],
  });
}

function simultaneousMutualKo(): ScenarioObservation {
  const a = makeSheet("fighter-a", "アオ", { hp: 1, spd: 10 });
  const b = makeSheet("fighter-b", "クロ", { hp: 1, spd: 10 });
  const before = makeState("baseline-mutual-ko", a, b);
  before.plannedActionA = { kind: "basic_attack" };
  before.plannedActionB = { kind: "basic_attack" };
  const result = resolveTurn({
    state: before,
    sideASkills: a.skills,
    sideBSkills: b.skills,
  });
  return resolutionObservation({
    before,
    result,
    scenarioChecks: [
      check(
        "both_actions_execute",
        "temporal",
        result.actions.length === 2 &&
          result.actions.every((action) => action.executed),
        "both actions in the equal-initiative bucket execute",
      ),
      check(
        "winner_is_draw",
        "temporal",
        result.state.winnerSide === "draw",
        "mutual incapacity produces a draw",
      ),
      check(
        "same_bucket_atomicity",
        "atomicity",
        result.state.sideA.parameters.hp === 0 &&
          result.state.sideB.parameters.hp === 0,
        "both terminal changes survive the atomic bucket merge",
      ),
    ],
  });
}

function fasterInterruption(): ScenarioObservation {
  const a = makeSheet("fighter-a", "遅い側", { hp: 1, spd: 5 });
  const b = makeSheet("fighter-b", "速い側", { hp: 100, spd: 20 });
  const before = makeState("baseline-fast-interrupt", a, b);
  before.plannedActionA = { kind: "basic_attack" };
  before.plannedActionB = { kind: "basic_attack" };
  const result = resolveTurn({
    state: before,
    sideASkills: a.skills,
    sideBSkills: b.skills,
  });
  const slow = result.actions.find((action) => action.actorSide === "a");
  const fast = result.actions.find((action) => action.actorSide === "b");
  return resolutionObservation({
    before,
    result,
    scenarioChecks: [
      check(
        "faster_action_executes",
        "temporal",
        fast?.executed === true,
        "the faster side acts in the first bucket",
      ),
      check(
        "slower_action_skipped_after_incapacity",
        "temporal",
        slow?.executed === false &&
          slow.skippedReason === "incapacitated_before_action",
        "the slower action is revalidated and skipped",
      ),
      check(
        "winner_is_faster_side",
        "temporal",
        result.state.winnerSide === "b",
        "the faster terminal action determines the winner",
      ),
    ],
  });
}

function environmentHitBoth(): ScenarioObservation {
  const a = makeSheet("fighter-a", "アオ");
  const b = makeSheet("fighter-b", "クロ");
  const before = makeState("baseline-environment", a, b);
  before.plannedActionA = { kind: "wait" };
  before.plannedActionB = { kind: "wait" };
  const result = resolveTurn({
    state: before,
    sideASkills: a.skills,
    sideBSkills: b.skills,
    envHits: [{ target: "both", kind: "damage", intensity: "minor" }],
  });
  const environmental = result.mechanicalEvidence.filter((item) =>
    item.sourceActionId === null && item.parameterKey === "hp"
  );
  const eventIds = new Set(
    result.events.flatMap((event) => event.id ? [event.id] : []),
  );
  return resolutionObservation({
    before,
    result,
    scenarioChecks: [
      check(
        "environment_evidence_has_no_character_action_source",
        "authority",
        environmental.length === 2 &&
          environmental.every((item) => item.actorSide === null),
        "environment damage is not attributed to a character action",
      ),
      check(
        "both_targets_have_basis_events",
        "causality",
        new Set(environmental.map((item) => item.target.side)).size === 2 &&
          environmental.every((item) =>
            item.basisEventIds.length === 1 &&
            eventIds.has(item.basisEventIds[0]!)
          ),
        "each target-specific effect has one committed basis event",
      ),
    ],
  });
}

function invalidWorldTransitionAtomic(): ScenarioObservation {
  const before = makeState("baseline-invalid-transition");
  const worldBefore = before.worldState!;
  const applied = applyBattleWorldTransition({
    state: worldBefore,
    turn: 0,
    transition: {
      baseRevision: worldBefore.revision,
      turn: 0,
      operations: [
        {
          op: "add_area",
          areaId: "area.should-not-commit",
          area: {
            label: "commitされない区画",
            illumination: "normal",
            noise: "normal",
            space: "open",
            movement: "open",
          },
        },
        {
          op: "set_placement",
          entityId: "character.a",
          placement: { type: "absent" },
        },
      ],
    },
  });
  const resultingWorld = applied.state;
  const atomicFailure = applied.ok ||
    resultingWorld !== worldBefore ||
    "area.should-not-commit" in resultingWorld.areas ||
    resultingWorld.revision !== worldBefore.revision;
  const checks = [
    check(
      "transition_rejected",
      "schema",
      !applied.ok,
      applied.ok ? "unexpectedly accepted" : applied.error.code,
    ),
    check(
      "world_revision_unchanged",
      "atomicity",
      resultingWorld.revision === worldBefore.revision,
      "a rejected transition does not advance the revision",
    ),
    check(
      "no_partial_area_or_placement_commit",
      "atomicity",
      resultingWorld === worldBefore &&
        !("area.should-not-commit" in resultingWorld.areas),
      "the add-area prefix is not partially committed",
    ),
  ];
  return {
    outcome: {
      accepted: applied.ok,
      errorCode: applied.ok ? null : applied.error.code,
      revisionBefore: worldBefore.revision,
      revisionAfter: resultingWorld.revision,
      stateReferenceRetained: resultingWorld === worldBefore,
    },
    checks,
    sizes: {
      stateBeforeBytes: serializedBytes(before),
      stateAfterBytes: serializedBytes(before),
      worldStateBytes: serializedBytes(worldBefore),
      perceptionBytes: serializedBytes({
        a: before.perceptionFrameA,
        b: before.perceptionFrameB,
      }),
      eventsBytes: 2,
      actionsBytes: 2,
      mechanicalEvidenceBytes: 2,
      projectionBytes: null,
    },
    counts: {
      unsupportedStructuredClaims: 0,
      causalReferenceGaps: 0,
      authorityViolations: 0,
      privacyLeaks: 0,
      atomicityFailures: atomicFailure ? 1 : 0,
      sideSwapMismatches: 0,
      llmCalls: 0,
    },
  };
}

function legacyCompatibility(): ScenarioObservation {
  const baseline = makeState("baseline-legacy");
  const marker = "UNKNOWN_PROVENANCE_PUBLIC_MARKER";
  const legacy = structuredClone(baseline) as BattleState & Record<string, unknown>;
  legacy.pipelineAuthorityVersion = undefined;
  legacy.worldState = undefined;
  legacy.perceptionFrameA = undefined;
  legacy.perceptionFrameB = undefined;
  legacy.perceptionRegistryA = undefined;
  legacy.perceptionRegistryB = undefined;
  legacy.encounterContext = undefined;
  legacy.narratorContinuity = undefined;
  legacy.agentStateA = { ...legacy.agentStateA!, lastSpeech: marker };
  legacy.agentStateB = { ...legacy.agentStateB!, lastSpeech: marker };
  const restored = ensureBattleCompatibilityState(legacy);
  const schemaValid = BattleStateSchema.safeParse(restored).success;
  const markerRetained = JSON.stringify({
    a: restored.agentStateA,
    b: restored.agentStateB,
  }).includes(marker);
  return {
    outcome: {
      pipelineAuthorityVersion: restored.pipelineAuthorityVersion,
      worldRevision: restored.worldState?.revision ?? null,
      perceptionObservers: [
        restored.perceptionFrameA?.observer.side ?? null,
        restored.perceptionFrameB?.observer.side ?? null,
      ],
      lastSpeechA: restored.agentStateA?.lastSpeech ?? null,
      lastSpeechB: restored.agentStateB?.lastSpeech ?? null,
    },
    checks: [
      check(
        "world_and_perception_reconstructed",
        "coherence",
        Boolean(
          restored.worldState &&
          restored.perceptionFrameA &&
          restored.perceptionFrameB,
        ),
        "legacy state receives deterministic world and observer frames",
      ),
      check(
        "legacy_unknown_speech_discarded",
        "authority",
        !markerRetained &&
          restored.agentStateA?.lastSpeech === null &&
          restored.agentStateB?.lastSpeech === null,
        "unknown-provenance speech does not enter private continuity",
      ),
      check(
        "battle_state_schema_valid",
        "schema",
        schemaValid,
        "the reconstructed state passes BattleStateSchema",
      ),
    ],
    sizes: {
      stateBeforeBytes: serializedBytes(legacy),
      stateAfterBytes: serializedBytes(restored),
      worldStateBytes: serializedBytes(restored.worldState ?? null),
      perceptionBytes: serializedBytes({
        a: restored.perceptionFrameA,
        b: restored.perceptionFrameB,
      }),
      eventsBytes: 2,
      actionsBytes: 2,
      mechanicalEvidenceBytes: 2,
      projectionBytes: null,
    },
    counts: {
      unsupportedStructuredClaims: 0,
      causalReferenceGaps: 0,
      authorityViolations: markerRetained ? 1 : 0,
      privacyLeaks: markerRetained ? 1 : 0,
      atomicityFailures: 0,
      sideSwapMismatches: 0,
      llmCalls: 0,
    },
  };
}

function narrationStyleIndependence(): ScenarioObservation {
  const run = (instruction: string): { before: BattleState; result: ResolveResult } => {
    const a = makeSheet("fighter-a", "アオ");
    const b = makeSheet("fighter-b", "クロ");
    const before = makeState("baseline-narration-authority", a, b);
    before.narrationStyle = {
      id: instruction,
      displayName: instruction,
      instruction,
      perspective: "external",
    };
    before.plannedActionA = { kind: "basic_attack" };
    before.plannedActionB = { kind: "basic_attack" };
    return {
      before,
      result: resolveTurn({
        state: before,
        sideASkills: a.skills,
        sideBSkills: b.skills,
      }),
    };
  };
  const quiet = run("静かな文体");
  const intense = run("激しい文体");
  const comparable = (result: ResolveResult) => ({
    sideA: result.state.sideA.parameters,
    sideB: result.state.sideB.parameters,
    actions: result.actions,
    evidence: result.mechanicalEvidence,
    temporal: result.state.latestTemporalResolution,
    winnerSide: result.state.winnerSide,
  });
  const equal = outcomeDigest(comparable(quiet.result)) ===
    outcomeDigest(comparable(intense.result));
  return resolutionObservation({
    before: quiet.before,
    result: quiet.result,
    authorityViolations: equal ? 0 : 1,
    scenarioChecks: [
      check(
        "mechanical_outcome_equal",
        "authority",
        equal,
        "mechanics are identical for opposing narration instructions",
      ),
      check(
        "temporal_plan_equal",
        "temporal",
        outcomeDigest(quiet.result.state.latestTemporalResolution) ===
          outcomeDigest(intense.result.state.latestTemporalResolution),
        "temporal resolution does not consume narration style",
      ),
      check(
        "authority_violation_count_zero",
        "authority",
        equal,
        "presentation has no mechanical mutation authority",
      ),
    ],
    outcome: {
      quiet: comparable(quiet.result),
      intense: comparable(intense.result),
      equal,
    },
  });
}

function sideSwapSymmetry(): ScenarioObservation {
  const run = (swapped: boolean) => {
    const first = makeSheet("logical-first", "第一", { atk: 24, def: 7, spd: 10 });
    const second = makeSheet("logical-second", "第二", { atk: 17, def: 12, spd: 10 });
    const sideA = swapped ? second : first;
    const sideB = swapped ? first : second;
    const before = makeState(
      swapped ? "baseline-side-swap-swapped" : "baseline-side-swap-normal",
      sideA,
      sideB,
    );
    before.plannedActionA = { kind: "basic_attack" };
    before.plannedActionB = { kind: "basic_attack" };
    const beforeFirstHp = swapped
      ? before.sideB.parameters.hp!
      : before.sideA.parameters.hp!;
    const beforeSecondHp = swapped
      ? before.sideA.parameters.hp!
      : before.sideB.parameters.hp!;
    const result = resolveTurn({
      state: before,
      sideASkills: sideA.skills,
      sideBSkills: sideB.skills,
    });
    return {
      before,
      result,
      logical: {
        firstDamage: beforeFirstHp - (
          swapped ? result.state.sideB.parameters.hp! : result.state.sideA.parameters.hp!
        ),
        secondDamage: beforeSecondHp - (
          swapped ? result.state.sideA.parameters.hp! : result.state.sideB.parameters.hp!
        ),
        firstExecuted: result.actions.find((action) =>
          action.actorSide === (swapped ? "b" : "a")
        )?.executed ?? false,
        secondExecuted: result.actions.find((action) =>
          action.actorSide === (swapped ? "a" : "b")
        )?.executed ?? false,
      },
    };
  };
  const normal = run(false);
  const swapped = run(true);
  const equal = outcomeDigest(normal.logical) === outcomeDigest(swapped.logical);
  return resolutionObservation({
    before: normal.before,
    result: normal.result,
    sideSwapMismatches: equal ? 0 : 1,
    scenarioChecks: [
      check(
        "side_swap_damage_equal",
        "side_neutrality",
        normal.logical.firstDamage === swapped.logical.firstDamage &&
          normal.logical.secondDamage === swapped.logical.secondDamage,
        "logical combatants receive the same damage after swapping side labels",
      ),
      check(
        "side_swap_execution_equal",
        "side_neutrality",
        normal.logical.firstExecuted === swapped.logical.firstExecuted &&
          normal.logical.secondExecuted === swapped.logical.secondExecuted,
        "logical combatants keep the same execution status",
      ),
      check(
        "side_swap_mismatch_count_zero",
        "side_neutrality",
        equal,
        "normalized logical outcomes are equal",
      ),
    ],
    outcome: {
      normal: normal.logical,
      swapped: swapped.logical,
      equal,
    },
  });
}

const localRunners: Record<string, LocalRunner> = {
  ordinary_attack: ordinaryAttack,
  remote_out_of_range: remoteOutOfRange,
  simultaneous_mutual_ko: simultaneousMutualKo,
  faster_interruption: fasterInterruption,
  environment_hit_both: environmentHitBoth,
  invalid_world_transition_atomic: invalidWorldTransitionAtomic,
  legacy_compatibility: legacyCompatibility,
  narration_style_independence: narrationStyleIndependence,
  side_swap_symmetry: sideSwapSymmetry,
};

function validateCorpus(raw: unknown): BaselineCorpus {
  if (!raw || typeof raw !== "object") throw new Error("baseline corpus must be an object");
  const corpus = raw as Partial<BaselineCorpus>;
  if (corpus.schemaVersion !== 1 || !corpus.corpusVersion) {
    throw new Error("unsupported baseline corpus schema");
  }
  if (!Array.isArray(corpus.scenarios) || corpus.scenarios.length === 0) {
    throw new Error("baseline corpus requires scenarios");
  }
  const ids = new Set<string>();
  for (const scenario of corpus.scenarios) {
    if (!scenario.id || ids.has(scenario.id)) {
      throw new Error(`duplicate or missing scenario ID: ${scenario.id}`);
    }
    ids.add(scenario.id);
    if (scenario.executionMode === "local_harness") {
      if (!scenario.runner || !localRunners[scenario.runner]) {
        throw new Error(`unknown local runner for ${scenario.id}`);
      }
    }
  }
  return corpus as BaselineCorpus;
}

function aggregateLocalScenario(input: {
  scenario: CorpusScenario;
  runner: LocalRunner;
  repetitions: number;
}): LocalScenarioAggregate {
  const observations: ScenarioObservation[] = [];
  const durations: number[] = [];
  for (let index = 0; index < input.repetitions; index += 1) {
    const started = performance.now();
    observations.push(input.runner());
    durations.push(performance.now() - started);
  }
  const digests = observations.map((item) => outcomeDigest(item.outcome));
  const first = observations[0]!;
  const checkIds = new Set(observations.flatMap((item) =>
    item.checks.map((candidate) => candidate.id)
  ));
  const checks = [...checkIds].sort().map((id) => {
    const instances = observations.flatMap((item) =>
      item.checks.filter((candidate) => candidate.id === id)
    );
    return {
      id,
      category: instances[0]!.category,
      passCount: instances.filter((item) => item.passed).length,
      failCount: instances.filter((item) => !item.passed).length,
      details: [...new Set(instances.map((item) => item.detail))],
    };
  });
  const sortedDurations = [...durations].sort((left, right) => left - right);
  const sumCounts = <K extends keyof ScenarioObservation["counts"]>(key: K) =>
    observations.reduce((sum, item) => sum + item.counts[key], 0);
  const meanSize = <K extends Exclude<
    keyof ScenarioObservation["sizes"],
    "projectionBytes"
  >>(key: K) => Math.round(
    observations.reduce((sum, item) => sum + item.sizes[key], 0) /
      observations.length,
  );
  return {
    id: input.scenario.id,
    category: input.scenario.category,
    hypothesis: input.scenario.hypothesis,
    repetitions: input.repetitions,
    distinctOutcomeDigests: new Set(digests).size,
    stableAcrossRepetitions: new Set(digests).size === 1,
    outcomeDigest: digests[0]!,
    latencyMs: {
      mean: Number(
        (durations.reduce((sum, value) => sum + value, 0) / durations.length)
          .toFixed(3),
      ),
      p95: Number(
        sortedDurations[
          Math.min(
            sortedDurations.length - 1,
            Math.ceil(sortedDurations.length * 0.95) - 1,
          )
        ]!.toFixed(3),
      ),
      minimum: Number(sortedDurations[0]!.toFixed(3)),
      maximum: Number(sortedDurations.at(-1)!.toFixed(3)),
    },
    sizeBytes: {
      stateBeforeBytes: meanSize("stateBeforeBytes"),
      stateAfterBytes: meanSize("stateAfterBytes"),
      worldStateBytes: meanSize("worldStateBytes"),
      perceptionBytes: meanSize("perceptionBytes"),
      eventsBytes: meanSize("eventsBytes"),
      actionsBytes: meanSize("actionsBytes"),
      mechanicalEvidenceBytes: meanSize("mechanicalEvidenceBytes"),
      projectionBytes: null,
    },
    checks,
    counts: {
      unsupportedStructuredClaims: sumCounts("unsupportedStructuredClaims"),
      causalReferenceGaps: sumCounts("causalReferenceGaps"),
      authorityViolations: sumCounts("authorityViolations"),
      privacyLeaks: sumCounts("privacyLeaks"),
      atomicityFailures: sumCounts("atomicityFailures"),
      sideSwapMismatches: sumCounts("sideSwapMismatches"),
      llmCalls: 0,
    },
    baselineOutcome: first.outcome,
  };
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

function summarizeExistingEvidence(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return { parseable: false };
  const value = raw as Record<string, unknown>;
  return {
    schemaVersion: value.schemaVersion ?? null,
    fixtureVersion: value.fixtureVersion ?? null,
    provider: value.provider ?? null,
    model: value.model ?? null,
    repetitions: value.repetitions ?? null,
    evaluatedAt: value.evaluatedAt ?? null,
    combined: value.combined ?? null,
    recommendation: value.recommendation ?? null,
    callErrorCount: Array.isArray(value.callErrors) ? value.callErrors.length : null,
  };
}

export async function evaluateBattlePipelineBaseline(input: {
  corpusPath?: string;
  repetitions?: number;
  now?: () => Date;
} = {}): Promise<BaselineReport> {
  const corpusPath = path.resolve(input.corpusPath ?? defaultCorpusPath);
  const corpusText = await fs.readFile(corpusPath, "utf8");
  const corpus = validateCorpus(JSON.parse(corpusText) as unknown);
  const repetitions = input.repetitions ?? corpus.repetitions.localDeterministic;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new Error("repetitions must be an integer from 1 through 100");
  }
  const localScenarios = corpus.scenarios
    .filter((scenario) => scenario.executionMode === "local_harness")
    .map((scenario) => aggregateLocalScenario({
      scenario,
      runner: localRunners[scenario.runner!]!,
      repetitions,
    }));
  const existingEvidence = await Promise.all(corpus.scenarios
    .filter((scenario) => scenario.executionMode === "existing_evidence")
    .map(async (scenario) => {
      const evidencePath = path.resolve(repositoryRoot, scenario.evidencePath!);
      const evidenceText = await fs.readFile(evidencePath, "utf8");
      const actualSha256 = sha256(evidenceText);
      return {
        id: scenario.id,
        path: path.relative(repositoryRoot, evidencePath),
        expectedSha256: scenario.expectedSha256!,
        actualSha256,
        hashMatches: actualSha256 === scenario.expectedSha256,
        summary: summarizeExistingEvidence(JSON.parse(evidenceText) as unknown),
      };
    }));
  const automatedTestReferences = corpus.scenarios
    .filter((scenario) => scenario.executionMode === "automated_test_reference")
    .map((scenario) => ({
      id: scenario.id,
      command: scenario.testCommand!,
      status: "not_run_by_harness" as const,
    }));
  const humanScenarios = corpus.scenarios.filter((scenario) =>
    scenario.executionMode === "future_blind_review"
  );
  const allChecks = localScenarios.flatMap((scenario) => scenario.checks);
  const hardCheckPassCount = allChecks.reduce(
    (sum, item) => sum + item.passCount,
    0,
  );
  const hardCheckFailCount = allChecks.reduce(
    (sum, item) => sum + item.failCount,
    0,
  );
  const categoryChecks = (category: CheckCategory) =>
    allChecks.filter((item) => item.category === category);
  const schemaChecks = categoryChecks("schema");
  const schemaPasses = schemaChecks.reduce((sum, item) => sum + item.passCount, 0);
  const schemaTotal = schemaChecks.reduce(
    (sum, item) => sum + item.passCount + item.failCount,
    0,
  );
  const evaluatorPath = fileURLToPath(import.meta.url);
  const evaluatorText = await fs.readFile(evaluatorPath, "utf8");
  const countTotal = <K extends keyof ScenarioObservation["counts"]>(key: K) =>
    localScenarios.reduce((sum, scenario) => sum + scenario.counts[key], 0);
  return {
    schemaVersion: 1,
    corpusVersion: corpus.corpusVersion,
    generatedAt: (input.now?.() ?? new Date()).toISOString(),
    mode: "local_current_pipeline",
    provenance: {
      gitHead: gitOutput(["rev-parse", "HEAD"]),
      workingTreeDirty: gitOutput(["status", "--porcelain"]) !== "",
      nodeVersion: process.version,
      corpusPath: path.relative(repositoryRoot, corpusPath),
      corpusSha256: sha256(corpusText),
      evaluatorPath: path.relative(repositoryRoot, evaluatorPath),
      evaluatorSha256: sha256(evaluatorText),
    },
    execution: {
      externalLlmCallsMade: 0,
      localRepetitions: repetitions,
      localScenarioCount: localScenarios.length,
      existingEvidenceCount: existingEvidence.length,
      automatedTestReferenceCount: automatedTestReferences.length,
      futureBlindReviewCount: humanScenarios.length,
    },
    currentCallTopology: corpus.currentCallTopology,
    localScenarios,
    existingEvidence,
    automatedTestReferences,
    humanQualityBaseline: {
      status: "unmeasured",
      reason:
        "No intervention output exists yet for a blinded pairwise comparison; historical narration is context, not a current human score.",
      historicalReferences: humanScenarios.flatMap((scenario) =>
        scenario.historicalReferencePath ? [scenario.historicalReferencePath] : []
      ),
      rubricPrompts: humanScenarios.flatMap((scenario) =>
        scenario.humanRubricPrompts
      ),
    },
    aggregate: {
      hardCheckPassCount,
      hardCheckFailCount,
      schemaValidityRate: schemaTotal === 0 ? 0 : schemaPasses / schemaTotal,
      authorityViolationCount: countTotal("authorityViolations"),
      privacyLeakCount: countTotal("privacyLeaks"),
      atomicityFailureCount: countTotal("atomicityFailures"),
      causalReferenceGapCount: countTotal("causalReferenceGaps"),
      sideSwapMismatchCount: countTotal("sideSwapMismatches"),
      unsupportedStructuredClaimCount: countTotal(
        "unsupportedStructuredClaims",
      ),
      allLocalOutcomesStable: localScenarios.every((scenario) =>
        scenario.stableAcrossRepetitions
      ),
      existingEvidenceHashesMatch: existingEvidence.every((item) =>
        item.hashMatches
      ),
    },
    limitations: [
      "The local harness measures deterministic structured mechanics, not end-to-end public narration.",
      "Local latency is machine-specific and is only a comparison baseline on the same environment.",
      "projectionBytes is null until the projection PoC introduces the new slice boundary.",
      "The referenced XAI evidence is historical committed evidence and was not refreshed by this no-billing run.",
      "Human plausibility is intentionally unmeasured until baseline and PoC outputs can be blindly paired.",
      "Passing hard invariants and proxy thresholds cannot prove an objectively correct final battle result.",
    ],
  };
}

function parseArgs(args: string[]): {
  corpusPath?: string;
  repetitions?: number;
  outputPath?: string;
} {
  const parsed: {
    corpusPath?: string;
    repetitions?: number;
    outputPath?: string;
  } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`missing value for ${arg}`);
    if (arg === "--corpus") {
      parsed.corpusPath = path.resolve(repositoryRoot, value);
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
  const report = await evaluateBattlePipelineBaseline({
    corpusPath: args.corpusPath,
    repetitions: args.repetitions,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
    await fs.writeFile(args.outputPath, serialized, {
      encoding: "utf8",
      flag: "wx",
    });
    console.error(`[battle-pipeline-baseline] wrote ${args.outputPath}`);
    return;
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
