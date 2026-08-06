import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AdaptiveAdjudicationBatchResultSchema,
  DEFAULT_ADAPTIVE_ADJUDICATION_BUDGET,
} from "./battle-adaptive-adjudication.js";
import {
  buildActualTurnInputDerivationFixtureCorpus,
} from "./battle-actual-turn-input-derivation-fixtures.js";
import {
  deriveActualTurnApplicabilityInput,
  type AdaptiveStageReceiptArtifact,
  type ConsistencyIssueSnapshotArtifact,
  type PurposeReadSetArtifact,
} from "./battle-actual-turn-input-derivation.js";
import {
  ACTUAL_TURN_SOURCE_AUTHORING_SHADOW_BOUNDARIES,
  ACTUAL_TURN_SOURCE_AUTHORING_SHADOW_CASE_REFS,
  requestedActionSourceProposalRef,
  runActualTurnSourceAuthoringShadow,
  sourceAuthoringOpaqueRef,
  type ActualTurnSourceAuthoringShadowCaseRef,
  type ActualTurnSourceAuthoringShadowInput,
} from "./battle-actual-turn-source-authoring-shadow.js";
import {
  ConsistencyIssuePocEnvelopeSchema,
  createConsistencyIssuePocEnvelope,
  type ConsistencyIssuePocEnvelope,
} from "./battle-consistency-issue.js";
import {
  createBattleState,
  resolveTurn,
  type ResolveTurnInput,
} from "./battle-engine.js";
import { defaultParameters, type CharacterSheet } from "./character.js";

const FIXED_NOW = new Date("2026-08-06T12:00:00.000Z");

function sheet(input: {
  id: string;
  name: string;
  hp?: number;
  atk?: number;
  spd?: number;
  mp?: number;
}): CharacterSheet {
  const hp = input.hp ?? 200;
  const parameters = defaultParameters({
    hp,
    maxHp: hp,
    atk: input.atk ?? 40,
    spd: input.spd ?? 40,
    mp: input.mp ?? 100,
    maxMp: 100,
    stamina: 100,
    maxStamina: 100,
  });
  return {
    id: input.id,
    ownerUserId: "synthetic-owner",
    displayName: input.name,
    tags: [],
    createdAt: FIXED_NOW.toISOString(),
    updatedAt: FIXED_NOW.toISOString(),
    appearance: { summary: "synthetic", visualPrompt: "synthetic" },
    traits: ["synthetic"],
    parameters,
    skills: [{
      id: "skill.synthetic",
      name: "Synthetic Skill",
      description: "A deterministic synthetic skill.",
      costMp: 10,
      costStamina: 0,
      power: 1.2,
      kind: "attack",
    }],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "Synthetic fixture combatant.",
  };
}

function baseResolveInput(input: {
  caseRef: string;
  sideA?: CharacterSheet;
  sideB?: CharacterSheet;
}): Omit<ResolveTurnInput, "shadowRequestedActionObserver"> {
  const sideA = input.sideA ?? sheet({ id: "a", name: "A" });
  const sideB = input.sideB ?? sheet({ id: "b", name: "B" });
  return {
    state: createBattleState({
      id: `shadow-${input.caseRef}`,
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    }),
    sideASkills: sideA.skills,
    sideBSkills: sideB.skills,
  };
}

function artifactForKind<K extends
  | AdaptiveStageReceiptArtifact["kind"]
  | PurposeReadSetArtifact["kind"]
  | ConsistencyIssueSnapshotArtifact["kind"]>(
  source: Awaited<ReturnType<
    typeof buildActualTurnInputDerivationFixtureCorpus
  >>["cases"][number]["source"],
  kind: K,
) {
  const artifact = source.artifacts.find((candidate) =>
    candidate.kind === kind
  );
  assert.ok(artifact);
  return artifact as Extract<typeof artifact, { kind: K }>;
}

function issueEnvelope(
  snapshot: ConsistencyIssueSnapshotArtifact,
): ConsistencyIssuePocEnvelope {
  return ConsistencyIssuePocEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "shadow_issue_registry",
    revision: snapshot.payload.issues.length,
    nextIssueSequence: snapshot.payload.issues.length + 1,
    issues: snapshot.payload.issues.map((issue, index) => ({
      id: issue.id,
      fingerprint: `issue-fingerprint:${(index + 101).toString(16).padStart(8, "0")}`,
      kind: "reported_conflict",
      involvedFactRefs: issue.involvedFactRefs,
      involvedEntityRefs: issue.involvedEntityRefs,
      discoveredAt: { stage: "adjudication", turn: 1 },
      blocksPurposes: issue.blocksPurposes,
      status: issue.status,
      sourceRefs: [`source.shadow.${index + 1}`],
      sourceKinds: ["llm_alert"],
      reporters: ["adjudicator"],
      reporterClaimsBlocking: issue.status !== "resolved",
      occurrenceCount: 1,
      lastObservedTurn: 1,
      ...(issue.status === "resolved"
        ? {
            resolution: {
              resolutionRef: `repair.shadow.${index + 1}`,
              resolvedAtTurn: 1,
              summary: "Synthetic resolved issue.",
            },
          }
        : {}),
    })),
    lifecycleEvents: [],
  });
}

const zeroUsage = {
  coarseAdjudications: 0,
  planningExpansions: 0,
  worldExpansions: 0,
  factsRead: 0,
  externalLlmCalls: 0,
} as const;

async function executedAdaptive(input: {
  caseRef: ActualTurnSourceAuthoringShadowCaseRef;
  turn: number;
  proposalSide?: "a" | "b";
  proposalRef?: string;
  outcome?: "completed" | "partial" | "indeterminate";
  failureReason?: "simultaneous_conflict" | "budget_exhausted";
  contested?: boolean;
}): Promise<AdaptiveStageReceiptArtifact["payload"]> {
  const proposalRef = input.proposalRef ??
    await requestedActionSourceProposalRef({
      caseRef: input.caseRef,
      turn: input.turn,
      side: input.proposalSide ?? "a",
    });
  const fallbackFactRef = await sourceAuthoringOpaqueRef({
    kind: "fact",
    caseRef: input.caseRef,
    localRef: "fallback",
  });
  const contestedClaimRef = await sourceAuthoringOpaqueRef({
    kind: "claim",
    caseRef: input.caseRef,
    localRef: "contested",
  });
  const failureReason = input.failureReason;
  const result = AdaptiveAdjudicationBatchResultSchema.parse({
    schemaVersion: 1,
    mode: "shadow_adaptive_adjudication",
    receipts: [{
      proposalRef,
      level: failureReason ? 2 : 1,
      resolution: failureReason ? "degraded" : "coarse",
      outcome: input.outcome ?? (failureReason ? "indeterminate" : "completed"),
      completedSteps: input.outcome === "partial" ? ["step.synthetic.1"] : [],
      ...(input.outcome === "partial"
        ? { failedStep: "step.synthetic.2" }
        : {}),
      ...(failureReason ? { failureReason } : {}),
      effects: [],
      costs: [],
      refinedFacts: [],
      rejectedWorldExpansionRefs: [],
      ...(failureReason
        ? {
            fallbackFact: {
              id: fallbackFactRef,
              subjectRef: "character.a",
              predicate: "state.uncertain",
              value: "unknown",
              strength: "unknown",
              provenance: "unknown_fallback",
            },
          }
        : {}),
      expansionReasons: input.contested ? ["simultaneous_conflict"] : [],
      budgetUsage: zeroUsage,
      sourceMutated: false,
      canonicalCommitPerformed: false,
    }],
    budget: DEFAULT_ADAPTIVE_ADJUDICATION_BUDGET,
    budgetUsage: zeroUsage,
    contestedClaimRefs: input.contested ? [contestedClaimRef] : [],
    externalLlmCalls: 0,
    sourceMutated: false,
    canonicalCommitPerformed: false,
  });
  return { status: "executed", result };
}

async function shadowCases(): Promise<ActualTurnSourceAuthoringShadowInput[]> {
  const corpus = await buildActualTurnInputDerivationFixtureCorpus();
  const nonempty = corpus.cases.find((candidate) =>
    candidate.caseRef === "X01_complete_nonempty"
  );
  assert.ok(nonempty);
  const readArtifact = artifactForKind(nonempty.source, "purpose_read_set");
  const issueArtifact = artifactForKind(
    nonempty.source,
    "consistency_issue_snapshot",
  );
  const emptyIssues = createConsistencyIssuePocEnvelope();

  const s01 = baseResolveInput({ caseRef: "s01" });
  s01.state.plannedActionA = { kind: "basic_attack" };
  s01.state.plannedActionB = { kind: "skill", skillId: "skill.synthetic" };

  const s02 = baseResolveInput({ caseRef: "s02" });
  s02.state.plannedActionA = { kind: "defend" };
  s02.state.plannedActionB = { kind: "basic_attack" };

  const s03 = baseResolveInput({ caseRef: "s03" });
  s03.state.plannedActionA = { kind: "basic_attack" };
  s03.state.plannedActionB = { kind: "basic_attack" };

  const s04 = baseResolveInput({
    caseRef: "s04",
    sideA: sheet({ id: "a", name: "A", atk: 200, spd: 100 }),
    sideB: sheet({ id: "b", name: "B", hp: 10, spd: 1 }),
  });
  s04.state.plannedActionA = { kind: "basic_attack" };
  s04.state.plannedActionB = { kind: "basic_attack" };

  const s05 = baseResolveInput({ caseRef: "s05" });
  s05.state.plannedActionA = { kind: "basic_attack" };
  s05.state.plannedActionB = { kind: "defend" };
  s05.preEvents = [{ type: "situation", summary: "Synthetic fire spreads." }];
  s05.envHits = [{ target: "both", kind: "damage", intensity: "minor" }];
  const s05WorldProposalRef = await sourceAuthoringOpaqueRef({
    kind: "proposal",
    caseRef: "S05_active_world_process",
    localRef: "world.fire",
  });

  const s06 = baseResolveInput({ caseRef: "s06" });
  s06.state.plannedActionA = { kind: "wait" };
  s06.state.plannedActionB = { kind: "wait" };

  const s07 = baseResolveInput({ caseRef: "s07" });
  s07.state.plannedActionA = { kind: "basic_attack" };
  s07.state.plannedActionB = { kind: "defend" };

  const s08 = baseResolveInput({ caseRef: "s08" });
  s08.state.plannedActionA = { kind: "basic_attack" };
  s08.state.plannedActionB = { kind: "defend" };

  const expensive = sheet({ id: "a", name: "A", mp: 0 });
  expensive.skills[0] = {
    ...expensive.skills[0]!,
    costMp: 999,
  };
  const s09 = baseResolveInput({ caseRef: "s09", sideA: expensive });
  s09.playerAction = {
    actorSide: "a",
    kind: "skill",
    skillId: "skill.synthetic",
  };
  s09.state.plannedActionB = { kind: "defend" };

  return [
    {
      caseRef: "S01_planned_basic_skill",
      derivationCaseRef: "A01_shadow_planned_basic_skill",
      resolveInput: s01,
      allowedFallbacks: [],
      adaptiveReceipt: await executedAdaptive({
        caseRef: "S01_planned_basic_skill",
        turn: 1,
      }),
      reads: [],
      issueEnvelope: emptyIssues,
    },
    {
      caseRef: "S02_policy_selected_defense",
      derivationCaseRef: "A02_shadow_policy_defense",
      resolveInput: s02,
      allowedFallbacks: ["defense"],
      adaptiveReceipt: await executedAdaptive({
        caseRef: "S02_policy_selected_defense",
        turn: 1,
      }),
      reads: [],
      issueEnvelope: emptyIssues,
    },
    {
      caseRef: "S03_simultaneous_equal_speed",
      derivationCaseRef: "A03_shadow_simultaneous",
      resolveInput: s03,
      allowedFallbacks: [],
      adaptiveReceipt: await executedAdaptive({
        caseRef: "S03_simultaneous_equal_speed",
        turn: 1,
        failureReason: "simultaneous_conflict",
        contested: true,
      }),
      reads: [],
      issueEnvelope: emptyIssues,
    },
    {
      caseRef: "S04_interrupted_partial",
      derivationCaseRef: "A04_shadow_interrupted_partial",
      resolveInput: s04,
      allowedFallbacks: ["intermediate"],
      adaptiveReceipt: await executedAdaptive({
        caseRef: "S04_interrupted_partial",
        turn: 1,
        outcome: "partial",
      }),
      reads: [],
      issueEnvelope: emptyIssues,
    },
    {
      caseRef: "S05_active_world_process",
      derivationCaseRef: "A05_shadow_world_process",
      resolveInput: s05,
      allowedFallbacks: [],
      adaptiveReceipt: await executedAdaptive({
        caseRef: "S05_active_world_process",
        turn: 1,
        proposalRef: s05WorldProposalRef,
      }),
      reads: [],
      issueEnvelope: emptyIssues,
      worldProposals: [{
        origin: "world_process",
        proposalRef: s05WorldProposalRef,
        actionKind: "world_process",
      }],
    },
    {
      caseRef: "S06_adaptive_skipped_no_eligible",
      derivationCaseRef: "A06_shadow_adaptive_skipped",
      resolveInput: s06,
      allowedFallbacks: [],
      adaptiveReceipt: {
        status: "skipped",
        reason: "No eligible adaptive proposal in the synthetic turn.",
      },
      reads: [],
      issueEnvelope: emptyIssues,
    },
    {
      caseRef: "S07_adaptive_contested_conflicted_read_issue",
      derivationCaseRef: "A07_shadow_conflicted_read",
      resolveInput: s07,
      allowedFallbacks: ["unknown"],
      adaptiveReceipt: await executedAdaptive({
        caseRef: "S07_adaptive_contested_conflicted_read_issue",
        turn: 1,
        failureReason: "simultaneous_conflict",
        contested: true,
      }),
      reads: readArtifact.payload.reads,
      issueEnvelope: issueEnvelope(issueArtifact),
    },
    {
      caseRef: "S08_authoring_failure_fail_open",
      derivationCaseRef: "A08_shadow_fail_open",
      resolveInput: s08,
      allowedFallbacks: [],
      adaptiveReceipt: await executedAdaptive({
        caseRef: "S08_authoring_failure_fail_open",
        turn: 1,
      }),
      reads: [],
      issueEnvelope: emptyIssues,
      injectObserverFailure: true,
    },
    {
      caseRef: "S09_budget_exhausted_fallback",
      derivationCaseRef: "A09_shadow_budget_fallback",
      resolveInput: s09,
      allowedFallbacks: ["intermediate", "weak", "unknown"],
      adaptiveReceipt: await executedAdaptive({
        caseRef: "S09_budget_exhausted_fallback",
        turn: 1,
        failureReason: "budget_exhausted",
      }),
      reads: [],
      issueEnvelope: emptyIssues,
    },
  ];
}

describe("actual-turn source-authoring ordinary-turn shadow PoC", () => {
  it("keeps the observer immutable, return-ignored, and fail-open", (test) => {
    test.mock.timers.enable({ apis: ["Date"], now: FIXED_NOW });
    const input = baseResolveInput({ caseRef: "seam" });
    input.state.plannedActionA = { kind: "basic_attack" };
    input.state.plannedActionB = { kind: "defend" };
    const control = resolveTurn(structuredClone(input));
    let errorCaptured = false;
    const shadow = resolveTurn({
      ...structuredClone(input),
      shadowRequestedActionObserver: {
        observeRequestedActions(snapshot): unknown {
          assert.equal(Object.isFrozen(snapshot), true);
          assert.equal(Object.isFrozen(snapshot.requestedActions.a), true);
          assert.throws(() => {
            (snapshot.requestedActions.a.action as { kind: string }).kind =
              "wait";
          });
          throw new Error("synthetic observer failure after immutability check");
        },
        onObservationError(): void {
          errorCaptured = true;
        },
      },
    });
    assert.equal(errorCaptured, true);
    assert.deepEqual(shadow, control);
    assert.equal("sourceAuthoring" in shadow.state, false);
  });

  it("assembles S01-S09 with exact parity and no external effects", async (test) => {
    test.mock.timers.enable({ apis: ["Date"], now: FIXED_NOW });
    const fixtures = await shadowCases();
    assert.deepEqual(
      fixtures.map((fixture) => fixture.caseRef),
      ACTUAL_TURN_SOURCE_AUTHORING_SHADOW_CASE_REFS,
    );
    assert.deepEqual(ACTUAL_TURN_SOURCE_AUTHORING_SHADOW_BOUNDARIES, {
      syntheticDataOnly: true,
      observerDefaultEnabled: false,
      backendWiring: 0,
      actualTurnCapture: 0,
      repositoryReads: 0,
      databaseQueries: 0,
      networkCalls: 0,
      providerCalls: 0,
      externalLlmCalls: 0,
      xaiCalls: 0,
      canonicalWrites: 0,
      battleStateWrites: 0,
      persistenceWrites: 0,
    });

    for (const fixture of fixtures) {
      const result = await runActualTurnSourceAuthoringShadow(fixture);
      assert.equal(result.parity.all, true, fixture.caseRef);
      assert.equal(result.sourceMutated, false, fixture.caseRef);
      assert.equal(result.observerSnapshotFrozen, true, fixture.caseRef);
      assert.deepEqual(result.controlEffectfulCallTrace, [], fixture.caseRef);
      assert.deepEqual(result.shadowEffectfulCallTrace, [], fixture.caseRef);
      assert.deepEqual(result.boundaryCounts, {
        addedDatabaseQueries: 0,
        addedNetworkCalls: 0,
        addedProviderCalls: 0,
        addedExternalLlmCalls: 0,
        addedXaiCalls: 0,
        canonicalWrites: 0,
        battleStateWrites: 0,
        persistenceWrites: 0,
      }, fixture.caseRef);
      if (fixture.caseRef === "S08_authoring_failure_fail_open") {
        assert.equal(result.status, "observer_failed");
        assert.equal(result.completeBundleProduced, false);
        continue;
      }
      assert.equal(result.status, "complete", JSON.stringify(result));
      assert.equal(result.sourceBundle.artifacts.length, 5, fixture.caseRef);
      assert.equal(result.inferredFieldCount, 0, fixture.caseRef);
      const derived = await deriveActualTurnApplicabilityInput(
        result.sourceBundle,
      );
      assert.equal(derived.status, "complete", fixture.caseRef);
    }
  });

  it("preserves the preregistered exercised shadow semantics", async (test) => {
    test.mock.timers.enable({ apis: ["Date"], now: FIXED_NOW });
    const fixtures = await shadowCases();
    const results = new Map<
      ActualTurnSourceAuthoringShadowCaseRef,
      Awaited<ReturnType<typeof runActualTurnSourceAuthoringShadow>>
    >();
    for (const fixture of fixtures) {
      results.set(
        fixture.caseRef,
        await runActualTurnSourceAuthoringShadow(fixture),
      );
    }
    const world = results.get("S05_active_world_process");
    assert.equal(world?.status, "complete");
    if (world?.status === "complete") {
      const derived = await deriveActualTurnApplicabilityInput(
        world.sourceBundle,
      );
      assert.equal(derived.status, "complete");
      if (derived.status === "complete") {
        assert.ok(derived.applicabilityInput.proposals.some((proposal) =>
          proposal.actionKind === "world_process"
        ));
      }
    }

    const conflict = results.get(
      "S07_adaptive_contested_conflicted_read_issue",
    );
    assert.equal(conflict?.status, "complete");
    if (conflict?.status === "complete") {
      const derived = await deriveActualTurnApplicabilityInput(
        conflict.sourceBundle,
      );
      assert.equal(derived.status, "complete");
      if (derived.status === "complete") {
        assert.equal(derived.applicabilityInput.adaptive.status, "executed");
        assert.ok(derived.applicabilityInput.reads.some((read) =>
          read.consistencyLevel === "conflicted"
        ));
        assert.deepEqual(
          derived.applicabilityInput.issues.map((issue) => issue.status),
          ["open", "deferred", "resolved"],
        );
        const resolvedRefs = new Set(
          derived.applicabilityInput.issues
            .filter((issue) => issue.status === "resolved")
            .map((issue) => issue.issueRef),
        );
        assert.ok(derived.applicabilityInput.reads.every((read) =>
          read.blockingIssueRefs.every((issueRef) => !resolvedRefs.has(issueRef))
        ));
      }
    }

    const budgetFixture = fixtures.find((fixture) =>
      fixture.caseRef === "S09_budget_exhausted_fallback"
    );
    assert.ok(budgetFixture);
    const resolvedBudget = resolveTurn(structuredClone(budgetFixture.resolveInput));
    assert.equal(resolvedBudget.actions[0]?.kind, "rest");
    assert.deepEqual(resolvedBudget.actions[0]?.resolution, {
      requested: { kind: "skill", skillId: "skill.synthetic" },
      outcome: "substituted",
      reason: "insufficient_resource",
    });
    const budget = results.get("S09_budget_exhausted_fallback");
    assert.equal(budget?.status, "complete");
    if (budget?.status === "complete") {
      const derived = await deriveActualTurnApplicabilityInput(
        budget.sourceBundle,
      );
      assert.equal(derived.status, "complete");
      if (derived.status === "complete") {
        assert.equal(derived.applicabilityInput.proposals[0]?.actionKind, "skill");
        assert.deepEqual(derived.applicabilityInput.allowedFallbacks, [
          "intermediate",
          "weak",
          "unknown",
        ]);
      }
    }
  });
});
