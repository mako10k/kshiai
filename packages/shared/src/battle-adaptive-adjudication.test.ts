import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_ADAPTIVE_ADJUDICATION_BUDGET,
  AdaptiveAdjudicationBatchResultSchema,
  adjudicateAdaptiveBattleProposals,
  refineAdaptiveWorldFacts,
  type AdaptiveActionKind,
  type AdaptiveActionProposal,
  type AdaptiveCharacterActionPlan,
  type AdaptiveEffect,
  type AdaptiveFact,
  type AdaptiveProposalCase,
} from "./battle-adaptive-adjudication.js";

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
    ...(Object.prototype.hasOwnProperty.call(input, "value")
      ? { value: input.value }
      : {}),
    strength: input.strength ?? "known",
    provenance: input.provenance ?? "canonical",
  };
}

function assertion(input: {
  id: string;
  fact: AdaptiveFact;
  stepRef?: string;
  irreversible?: boolean;
}): AdaptiveEffect {
  return {
    id: input.id,
    operation: "assert",
    fact: input.fact,
    irreversible: input.irreversible ?? false,
    causalSourceRef: input.stepRef ?? "control:fixture",
    ...(input.stepRef ? { sourceStepRef: input.stepRef } : {}),
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
    method: "fixtureで指定された方法を試みる",
    targetRefs: [actorRef === "character.a" ? "character.b" : "character.a"],
    intent: {
      objective: "不利を増やさず目的を達成する",
      targetRefs: ["subject.counterpart"],
      priorities: ["観測済みの状況を優先する"],
      mustPreserve: ["自分の行動可能性"],
      mustAvoid: ["未観測の能力への依存"],
    },
    characterBasis: {
      observationRefs: [`observation:${input.ref}`],
      psychologyRefs: [`psychology:${actorRef}`],
      experienceRefs: [`experience:${actorRef}`],
    },
    latentPlanHints: {
      approachPreference: "観測できる足場を使う",
      criticalStep: "対象へ接触できるか確認する",
      fallback: "成立した地点で止まる",
      riskTolerance: "moderate",
    },
    expansionReasons: input.reasons ?? [],
    expansionNeeds: {
      characterPlan: input.characterPlan ?? false,
      worldDetail: input.worldDetail ?? false,
    },
  };
}

function baseCase(input: {
  proposal: AdaptiveActionProposal;
  facts?: AdaptiveFact[];
}): AdaptiveProposalCase {
  return {
    proposal: input.proposal,
    facts: input.facts ?? [],
    scopeRefs: ["character.a", "character.b", "object.fixture", "area.1"],
    worldExpansions: [],
    fallbackClaims: [],
  };
}

function stepEffect(stepRef: string, id: string, predicate: string): AdaptiveEffect {
  return assertion({
    id: `effect:${id}`,
    stepRef,
    irreversible: true,
    fact: fact({
      id: `fact:${id}`,
      predicate,
      value: true,
      provenance: "character_step",
    }),
  });
}

function plan(input: {
  proposal: AdaptiveActionProposal;
  steps: AdaptiveCharacterActionPlan["steps"];
}): AdaptiveCharacterActionPlan {
  return {
    proposalRef: input.proposal.proposalRef,
    steps: input.steps,
    branches: [],
    abortConditions: [],
  };
}

describe("shadow adaptive adjudication PoC", () => {
  it("routes an ordinary action through Level 0 with exact control output", () => {
    const action = proposal({ ref: "proposal.fast", kind: "basic_attack" });
    const effect = assertion({
      id: "effect:control-damage",
      fact: fact({
        id: "fact:control-damage",
        subjectRef: "character.b",
        predicate: "parameter.hp.changed",
        value: "minor_loss",
      }),
      irreversible: true,
    });
    const proposalCase = baseCase({ proposal: action });
    proposalCase.controlResolution = {
      source: "control",
      outcome: "completed",
      effects: [effect],
      costs: [],
    };
    const original = structuredClone(proposalCase);
    const result = adjudicateAdaptiveBattleProposals({ cases: [proposalCase] });

    AdaptiveAdjudicationBatchResultSchema.parse(result);
    assert.equal(result.receipts[0]?.level, 0);
    assert.equal(result.receipts[0]?.resolution, "fast");
    assert.equal(result.receipts[0]?.outcome, "completed");
    assert.deepEqual(result.receipts[0]?.effects, [effect]);
    assert.equal(result.budgetUsage.coarseAdjudications, 0);
    assert.equal(result.budgetUsage.planningExpansions, 0);
    assert.equal(result.externalLlmCalls, 0);
    assert.equal(result.canonicalCommitPerformed, false);
    assert.deepEqual(proposalCase, original);
  });

  it("resolves a bounded non-fast proposal at coarse Level 1", () => {
    const action = proposal({ ref: "proposal.coarse", kind: "free_action" });
    const proposalCase = baseCase({ proposal: action });
    proposalCase.coarseResolution = {
      source: "coarse",
      outcome: "partial",
      effects: [],
      costs: [],
    };
    const result = adjudicateAdaptiveBattleProposals({ cases: [proposalCase] });

    assert.equal(result.receipts[0]?.level, 1);
    assert.equal(result.receipts[0]?.resolution, "coarse");
    assert.equal(result.receipts[0]?.outcome, "partial");
    assert.equal(result.budgetUsage.coarseAdjudications, 1);
    assert.equal(result.budgetUsage.planningExpansions, 0);
  });

  it("executes the longest valid prefix and retains only completed-step costs", () => {
    const action = proposal({
      ref: "proposal.prefix",
      kind: "custom",
      reasons: ["partial_stop_matters", "stage_dependent_cost"],
      characterPlan: true,
    });
    const reachable = fact({
      id: "fact:reachable",
      predicate: "movement.reachable",
      value: true,
    });
    const grip = fact({
      id: "fact:grip",
      predicate: "target.grip_available",
      value: false,
    });
    const proposalCase = baseCase({ proposal: action, facts: [reachable, grip] });
    proposalCase.characterPlan = plan({
      proposal: action,
      steps: [{
        id: "step:approach",
        description: "足場を確認して対象へ近づく",
        origin: "character_expansion",
        basisRefs: ["observation:proposal.prefix"],
        preconditions: [{
          factRef: reachable.id,
          operator: "equals",
          value: true,
        }],
        effects: [stepEffect("step:approach", "approached", "position.approached")],
        costs: [{
          id: "cost:exposure",
          channel: "exposure",
          description: "近づいたため姿を晒した",
          sourceStepRef: "step:approach",
        }],
        exclusiveClaimRefs: [],
      }, {
        id: "step:grip",
        description: "対象をつかむ",
        origin: "character_expansion",
        basisRefs: ["experience:character.a"],
        preconditions: [{
          factRef: grip.id,
          operator: "equals",
          value: true,
        }],
        effects: [stepEffect("step:grip", "held", "target.held")],
        costs: [{
          id: "cost:grip-stamina",
          channel: "stamina",
          description: "つかむ動作に力を使う",
          sourceStepRef: "step:grip",
        }],
        exclusiveClaimRefs: [],
      }, {
        id: "step:finish",
        description: "保持後の姿勢を固める",
        origin: "character_expansion",
        basisRefs: ["psychology:character.a"],
        preconditions: [],
        effects: [stepEffect("step:finish", "stable", "posture.stable")],
        costs: [],
        exclusiveClaimRefs: [],
      }],
    });
    const result = adjudicateAdaptiveBattleProposals({ cases: [proposalCase] });
    const receipt = result.receipts[0]!;

    assert.equal(receipt.level, 2);
    assert.equal(receipt.outcome, "partial");
    assert.deepEqual(receipt.completedSteps, ["step:approach"]);
    assert.equal(receipt.failedStep, "step:grip");
    assert.equal(receipt.failureReason, "precondition_failed");
    assert.deepEqual(receipt.effects.map((effect) => effect.id), [
      "effect:approached",
    ]);
    assert.deepEqual(receipt.costs.map((cost) => cost.id), ["cost:exposure"]);
  });

  it("rejects a step precondition that depends on a later step", () => {
    const action = proposal({
      ref: "proposal.forward-reference",
      kind: "custom",
      reasons: ["partial_stop_matters"],
      characterPlan: true,
    });
    const proposalCase = baseCase({ proposal: action });
    proposalCase.characterPlan = plan({
      proposal: action,
      steps: [{
        id: "step:early",
        description: "後続stepの結果を先に要求する",
        origin: "character_expansion",
        basisRefs: [
          "observation:proposal.forward-reference",
          "psychology:character.a",
        ],
        preconditions: [{
          factRef: "fact:created-later",
          operator: "exists",
        }],
        effects: [stepEffect("step:early", "early", "position.advanced")],
        costs: [],
        exclusiveClaimRefs: [],
      }, {
        id: "step:later",
        description: "前段が要求した事実を後から作る",
        origin: "character_expansion",
        basisRefs: ["experience:character.a"],
        preconditions: [],
        effects: [assertion({
          id: "effect:created-later",
          stepRef: "step:later",
          fact: fact({
            id: "fact:created-later",
            predicate: "support.prepared",
            value: true,
            provenance: "character_step",
          }),
        })],
        costs: [],
        exclusiveClaimRefs: [],
      }],
    });
    const result = adjudicateAdaptiveBattleProposals({ cases: [proposalCase] });

    assert.equal(result.receipts[0]?.resolution, "degraded");
    assert.equal(result.receipts[0]?.failureReason, "invalid_character_plan");
    assert.deepEqual(result.receipts[0]?.completedSteps, []);
  });

  it("stops simultaneous exclusive claims after each valid prefix", () => {
    const makeContender = (side: "a" | "b"): AdaptiveProposalCase => {
      const action = proposal({
        ref: `proposal.contest.${side}`,
        actorRef: `character.${side}`,
        kind: "custom",
        reasons: ["simultaneous_conflict", "partial_stop_matters"],
        characterPlan: true,
      });
      const proposalCase = baseCase({ proposal: action });
      proposalCase.characterPlan = plan({
        proposal: action,
        steps: [{
          id: `step:${side}:approach`,
          description: "対象へ手を伸ばす",
          origin: "character_expansion",
          basisRefs: [`observation:proposal.contest.${side}`],
          preconditions: [],
          effects: [stepEffect(
            `step:${side}:approach`,
            `${side}:approached`,
            "position.approached",
          )],
          costs: [],
          exclusiveClaimRefs: [],
        }, {
          id: `step:${side}:claim`,
          description: "同じ物体を確保する",
          origin: "character_expansion",
          basisRefs: [
            `experience:character.${side}`,
            `psychology:character.${side}`,
          ],
          preconditions: [],
          effects: [],
          costs: [],
          exclusiveClaimRefs: ["claim:object.fixture:control"],
        }],
      });
      return proposalCase;
    };
    const result = adjudicateAdaptiveBattleProposals({
      cases: [makeContender("a"), makeContender("b")],
    });

    assert.deepEqual(result.contestedClaimRefs, ["claim:object.fixture:control"]);
    assert.deepEqual(result.receipts.map((receipt) => receipt.outcome), [
      "partial",
      "partial",
    ]);
    assert.deepEqual(result.receipts.map((receipt) => receipt.completedSteps), [
      ["step:a:approach"],
      ["step:b:approach"],
    ]);
    assert.ok(result.receipts.every((receipt) =>
      receipt.failureReason === "simultaneous_conflict"
    ));
  });

  it("refines unknown world state but rejects known-to-convenient rewrites", () => {
    const unknown = fact({
      id: "fact:door-material-unknown",
      subjectRef: "object.fixture",
      predicate: "object.material",
      value: "unknown",
      strength: "unknown",
    });
    const accepted = refineAdaptiveWorldFacts({
      facts: [unknown],
      scopeRefs: ["object.fixture"],
      expansions: [{
        requestRef: "world:door-material",
        baseFactRef: unknown.id,
        refinedFact: fact({
          id: "fact:door-material-wood",
          subjectRef: "object.fixture",
          predicate: "object.material",
          value: "wood",
          strength: "known",
          provenance: "world_expansion",
        }),
      }],
    });
    assert.deepEqual(accepted.acceptedRequestRefs, ["world:door-material"]);
    assert.equal(accepted.refinedFacts[0]?.value, "wood");

    const known = fact({
      id: "fact:door-material-known",
      subjectRef: "object.fixture",
      predicate: "object.material",
      value: "iron",
    });
    const rejected = refineAdaptiveWorldFacts({
      facts: [known],
      scopeRefs: ["object.fixture"],
      expansions: [{
        requestRef: "world:convenient-rewrite",
        baseFactRef: known.id,
        refinedFact: fact({
          id: "fact:door-material-paper",
          subjectRef: "object.fixture",
          predicate: "object.material",
          value: "paper",
          strength: "known",
          provenance: "world_expansion",
        }),
      }],
    });
    assert.deepEqual(rejected.acceptedRequestRefs, []);
    assert.deepEqual(rejected.rejectedRequestRefs, ["world:convenient-rewrite"]);
  });

  it("uses accepted world detail without granting it canonical commit authority", () => {
    const action = proposal({
      ref: "proposal.world-detail",
      kind: "free_action",
      reasons: ["unknown_world_state"],
      worldDetail: true,
    });
    const unknown = fact({
      id: "fact:surface-unknown",
      subjectRef: "object.fixture",
      predicate: "object.surface",
      value: "unknown",
      strength: "unknown",
    });
    const proposalCase = baseCase({ proposal: action, facts: [unknown] });
    proposalCase.worldExpansions = [{
      requestRef: "world:surface",
      baseFactRef: unknown.id,
      refinedFact: fact({
        id: "fact:surface-rough",
        subjectRef: "object.fixture",
        predicate: "object.surface",
        value: "rough",
        strength: "known",
        provenance: "world_expansion",
      }),
    }];
    proposalCase.coarseResolution = {
      source: "coarse",
      outcome: "completed",
      effects: [],
      costs: [],
    };
    const result = adjudicateAdaptiveBattleProposals({ cases: [proposalCase] });

    assert.equal(result.receipts[0]?.level, 2);
    assert.equal(result.receipts[0]?.outcome, "completed");
    assert.equal(result.receipts[0]?.refinedFacts[0]?.value, "rough");
    assert.equal(result.receipts[0]?.canonicalCommitPerformed, false);
    assert.equal(result.budgetUsage.worldExpansions, 1);
  });

  it("degrades through intermediate, weak, then generated unknown claims", () => {
    const makeBudgetCase = (
      ref: string,
      fallbackClaims: AdaptiveFact[],
    ): AdaptiveProposalCase => {
      const action = proposal({
        ref,
        kind: "custom",
        reasons: ["rule_ambiguity"],
        characterPlan: true,
      });
      const proposalCase = baseCase({ proposal: action });
      proposalCase.fallbackClaims = fallbackClaims;
      return proposalCase;
    };
    const intermediate = fact({
      id: "fallback:intermediate",
      predicate: "adjudication.state",
      value: "unstable",
      strength: "intermediate",
      provenance: "intermediate_fallback",
    });
    const weak = fact({
      id: "fallback:weak",
      predicate: "adjudication.state",
      value: "possibly_changed",
      strength: "weak",
      provenance: "weak_fallback",
    });
    const budget = {
      ...DEFAULT_ADAPTIVE_ADJUDICATION_BUDGET,
      maxPlanningExpansions: 0,
    };
    const results = [
      makeBudgetCase("proposal.fallback.intermediate", [weak, intermediate]),
      makeBudgetCase("proposal.fallback.weak", [weak]),
      makeBudgetCase("proposal.fallback.unknown", []),
    ].map((proposalCase) =>
      adjudicateAdaptiveBattleProposals({ cases: [proposalCase], budget })
        .receipts[0]!
    );

    assert.deepEqual(results.map((receipt) => receipt.fallbackFact?.strength), [
      "intermediate",
      "weak",
      "unknown",
    ]);
    assert.ok(results.every((receipt) =>
      receipt.outcome === "indeterminate" &&
      receipt.failureReason === "budget_exhausted"
    ));
  });

  it("rejects character detail that invents an out-of-scope target", () => {
    const action = proposal({
      ref: "proposal.invented-tactic",
      kind: "custom",
      reasons: ["irreversible_effect"],
      characterPlan: true,
    });
    const proposalCase = baseCase({ proposal: action });
    proposalCase.characterPlan = plan({
      proposal: action,
      steps: [{
        id: "step:invent",
        description: "未提示の装置を都合よく操作する",
        origin: "character_expansion",
        basisRefs: [
          "observation:proposal.invented-tactic",
          "psychology:character.a",
          "experience:character.a",
        ],
        preconditions: [],
        effects: [assertion({
          id: "effect:invented",
          stepRef: "step:invent",
          fact: fact({
            id: "fact:invented",
            subjectRef: "object.outside-scope",
            predicate: "machine.activated",
            value: true,
            provenance: "character_step",
          }),
        })],
        costs: [],
        exclusiveClaimRefs: [],
      }],
    });
    const result = adjudicateAdaptiveBattleProposals({ cases: [proposalCase] });

    assert.equal(result.receipts[0]?.resolution, "degraded");
    assert.equal(result.receipts[0]?.failureReason, "invalid_character_plan");
    assert.equal(result.receipts[0]?.effects.length, 0);
    assert.equal(result.receipts[0]?.fallbackFact?.strength, "unknown");
  });

  it("rejects detail missing psychology and experience grounding", () => {
    const action = proposal({
      ref: "proposal.missing-character-basis",
      kind: "custom",
      reasons: ["intermediate_state_affects_outcome"],
      characterPlan: true,
    });
    const proposalCase = baseCase({ proposal: action });
    proposalCase.characterPlan = plan({
      proposal: action,
      steps: [{
        id: "step:under-grounded",
        description: "観測だけを根拠に詳細化する",
        origin: "character_expansion",
        basisRefs: ["observation:proposal.missing-character-basis"],
        preconditions: [],
        effects: [stepEffect(
          "step:under-grounded",
          "under-grounded",
          "position.adjusted",
        )],
        costs: [],
        exclusiveClaimRefs: [],
      }],
    });
    const result = adjudicateAdaptiveBattleProposals({ cases: [proposalCase] });

    assert.equal(result.receipts[0]?.resolution, "degraded");
    assert.equal(result.receipts[0]?.failureReason, "invalid_character_plan");
    assert.equal(result.receipts[0]?.effects.length, 0);
    assert.equal(result.receipts[0]?.fallbackFact?.strength, "unknown");
  });

  it("fails closed when the fact budget is exceeded", () => {
    const action = proposal({ ref: "proposal.fact-budget", kind: "free_action" });
    const proposalCase = baseCase({
      proposal: action,
      facts: [
        fact({ id: "fact:one", predicate: "fixture.one", value: true }),
        fact({ id: "fact:two", predicate: "fixture.two", value: true }),
      ],
    });
    proposalCase.coarseResolution = {
      source: "coarse",
      outcome: "completed",
      effects: [],
      costs: [],
    };
    const result = adjudicateAdaptiveBattleProposals({
      cases: [proposalCase],
      budget: {
        ...DEFAULT_ADAPTIVE_ADJUDICATION_BUDGET,
        maxFactsPerProposal: 1,
      },
    });

    assert.equal(result.receipts[0]?.outcome, "indeterminate");
    assert.equal(result.receipts[0]?.failureReason, "budget_exhausted");
    assert.equal(result.budgetUsage.externalLlmCalls, 0);
  });
});
