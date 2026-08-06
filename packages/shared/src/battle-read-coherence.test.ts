import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConsistencyRepairPlanSchema,
  checkPurposeScopedConsistencySlice,
  proposeShadowConsistencyRepair,
  runShadowConsistencyRepair,
  type ConsistencyRepairPlan,
} from "./battle-read-coherence.js";
import {
  ShadowCanonicalFactSchema,
  type ShadowCanonicalFact,
} from "./battle-canonical-patch.js";
import {
  ConsistencySliceSchema,
  type ConsistencySlice,
} from "./battle-projection.js";

function fact(input: {
  id: string;
  objectRef: string;
  turn: number;
  subsystem: "semantic" | "world";
  authority: "validated_semantic_transition" | "validated_world_transition";
}): ShadowCanonicalFact {
  return ShadowCanonicalFactSchema.parse({
    id: input.id,
    subjectRef: "object.sword",
    predicate: "state.location",
    objectRef: input.objectRef,
    validFrom: { turn: input.turn },
    provenance: {
      subsystem: input.subsystem,
      authority: input.authority,
      sourceRef: `event.${input.turn}`,
      sourceEventRefs: [`event.${input.turn}`],
    },
  });
}

function conflictFacts(): ShadowCanonicalFact[] {
  return [
    fact({
      id: "fact.sword.held",
      objectRef: "character.a",
      turn: 1,
      subsystem: "semantic",
      authority: "validated_semantic_transition",
    }),
    fact({
      id: "fact.sword.floor",
      objectRef: "location.floor",
      turn: 2,
      subsystem: "world",
      authority: "validated_world_transition",
    }),
  ];
}

function consistencySlice(input?: {
  truncated?: boolean;
  facts?: ShadowCanonicalFact[];
}): ConsistencySlice {
  const facts = input?.facts ?? conflictFacts();
  return ConsistencySliceSchema.parse({
    schemaVersion: 2,
    purpose: "adjudication",
    scope: {
      anchorRefs: ["object.sword"],
      entityRefs: [
        "object.sword",
        "character.a",
        "location.floor",
        "location.between",
      ],
      processRefs: [],
      traversedKinds: ["containment", "causal_dependency"],
      temporalWindow: { fromTurn: 1, toTurn: 3 },
      truncated: input?.truncated ?? false,
      omitted: {
        entities: input?.truncated ? 1 : 0,
        facts: 0,
        rules: 0,
        historyTurns: 0,
      },
    },
    factGroups: [{
      subjectRef: "object.sword",
      facts: facts.map((item) => [
        item.id,
        item.predicate,
        item.objectRef ?? null,
        item.validFrom.turn,
        item.validTo?.turn ?? null,
        item.provenance.subsystem,
      ]),
    }],
    causalLinks: [
      ["event.1", "fact.sword.held", "created"],
      ["event.2", "fact.sword.floor", "modified"],
    ],
    issues: [
      {
        id: "issue.000001",
        involvedFactRefs: ["fact.sword.held", "fact.sword.floor"],
        involvedEntityRefs: ["object.sword"],
        blocksPurposes: ["adjudication"],
        status: "open",
      },
      {
        id: "issue.unrelated",
        involvedFactRefs: ["fact.remote"],
        involvedEntityRefs: ["location.remote"],
        blocksPurposes: ["adjudication"],
        status: "deferred",
      },
      {
        id: "issue.narration-only",
        involvedFactRefs: ["fact.sword.held"],
        involvedEntityRefs: ["object.sword"],
        blocksPurposes: ["narration"],
        status: "open",
      },
    ],
    applicableRuleRefs: ["battle.rule.world-reference-integrity-v1"],
  });
}

function plan(
  strategy: ConsistencyRepairPlan["strategy"],
): ConsistencyRepairPlan {
  const common = {
    repairRef: `repair:read-poc.${strategy}`,
    issueRef: "issue.000001",
    turn: 3,
    conflictFactRefs: ["fact.sword.held", "fact.sword.floor"],
  };
  if (strategy === "reinterpret") {
    return ConsistencyRepairPlanSchema.parse({
      ...common,
      strategy,
      replacement: {
        subjectRef: "object.sword",
        predicate: "state.location",
        objectRef: "location.between",
      },
    });
  }
  return ConsistencyRepairPlanSchema.parse({ ...common, strategy });
}

describe("purpose-scoped read coherence PoC", () => {
  it("checks every fact in a complete slice and ignores unrelated issues", () => {
    const slice = consistencySlice();
    const before = structuredClone(slice);

    const result = checkPurposeScopedConsistencySlice(slice);

    assert.equal(result.complete, true);
    assert.equal(result.consistency.level, "conflicted");
    assert.deepEqual(result.consistency.checkedFactRefs, [
      "fact.sword.floor",
      "fact.sword.held",
    ]);
    assert.deepEqual(result.blockingIssueRefs, ["issue.000001"]);
    assert.equal(result.conflicts.length, 1);
    assert.deepEqual(result.conflicts[0]?.factRefs, [
      "fact.sword.floor",
      "fact.sword.held",
    ]);
    assert.deepEqual(slice, before);
  });

  it("does not claim local coherence for a truncated purpose slice", () => {
    const result = checkPurposeScopedConsistencySlice(
      consistencySlice({ truncated: true }),
    );

    assert.equal(result.complete, false);
    assert.equal(result.consistency.level, "unchecked");
    assert.match(result.reason, /truncated/u);
  });

  it("fails closed when one conflict exceeds the bounded repair scope", () => {
    const facts = Array.from({ length: 9 }, (_, index) => fact({
      id: `fact.sword.location.${index}`,
      objectRef: `location.${index}`,
      turn: 1,
      subsystem: "semantic",
      authority: "validated_semantic_transition",
    }));
    const result = checkPurposeScopedConsistencySlice(
      consistencySlice({ facts }),
    );

    assert.equal(result.complete, false);
    assert.equal(result.consistency.level, "unchecked");
    assert.deepEqual(result.conflicts, []);
    assert.match(result.reason, /bounded fact limit/u);
  });

  it("selects only a uniquely stronger causal fact and previews a rebuilt read", () => {
    const slice = consistencySlice();
    const facts = conflictFacts();
    const beforeSlice = structuredClone(slice);
    const beforeFacts = structuredClone(facts);

    const proposal = proposeShadowConsistencyRepair({
      slice,
      currentFacts: facts,
      plan: plan("select"),
    });

    assert.equal(proposal.status, "proposed");
    if (proposal.status !== "proposed") return;
    assert.deepEqual(proposal.retainedFactRefs, ["fact.sword.floor"]);
    assert.deepEqual(proposal.retractedFactRefs, ["fact.sword.held"]);
    assert.equal(proposal.patch.sourceRef, "repair:read-poc.select");
    assert.deepEqual(proposal.patch.causalLinks, [{
      sourceRef: "repair:read-poc.select",
      targetFactRef: "fact.sword.held",
      relation: "ended",
    }]);
    assert.equal(proposal.audit.verdict, "no_issue_found");

    const run = runShadowConsistencyRepair({
      slice,
      currentFacts: facts,
      plans: [plan("select")],
      allowShadowRepair: true,
    });
    assert.equal(run.outcome, "repaired");
    assert.equal(run.final.consistency.level, "repaired");
    assert.deepEqual(run.final.conflicts, []);
    assert.deepEqual(run.shadowResolvedIssueRefs, ["issue.000001"]);
    assert.equal(
      run.final.value.issues.find((issue) => issue.id === "issue.000001")
        ?.status,
      "resolved",
    );
    assert.equal(run.externalLlmCallsMade, 0);
    assert.equal(run.sourceFactsMutated, false);
    assert.equal(run.sourceSliceMutated, false);
    assert.deepEqual(slice, beforeSlice);
    assert.deepEqual(facts, beforeFacts);
  });

  it("keeps stronger causal evidence even when the weaker fact is newer", () => {
    const facts = conflictFacts().map((item, index) =>
      ShadowCanonicalFactSchema.parse(index === 0
        ? item
        : {
            ...item,
            provenance: {
              subsystem: "repair",
              authority: "repair",
              sourceRef: "repair:weak-recent",
              sourceEventRefs: ["repair:weak-recent"],
            },
          })
    );
    const slice = consistencySlice({ facts });
    slice.causalLinks = [
      ["event.1", "fact.sword.held", "modified"],
      ["repair:weak-recent", "fact.sword.floor", "created"],
    ];

    const proposal = proposeShadowConsistencyRepair({
      slice,
      currentFacts: facts,
      plan: plan("select"),
    });

    assert.equal(proposal.status, "proposed");
    if (proposal.status !== "proposed") return;
    assert.deepEqual(proposal.retainedFactRefs, ["fact.sword.held"]);
    assert.deepEqual(proposal.retractedFactRefs, ["fact.sword.floor"]);
  });

  it("emits audited repair-authority assertions for every fallback strategy", () => {
    const slice = consistencySlice();
    const facts = conflictFacts();

    for (const strategy of [
      "reinterpret",
      "intermediate_state",
      "weaken_claim",
      "reset_unknown",
    ] as const) {
      const proposal = proposeShadowConsistencyRepair({
        slice,
        currentFacts: facts,
        plan: plan(strategy),
      });
      assert.equal(proposal.status, "proposed", strategy);
      if (proposal.status !== "proposed") continue;
      assert.equal(proposal.audit.verdict, "no_issue_found");
      assert.equal(proposal.patch.assertions.length, 1);
      assert.equal(
        proposal.patch.assertions[0]?.provenance.authority,
        "repair",
      );
      assert.equal(
        proposal.patch.assertions[0]?.provenance.sourceRef,
        `repair:read-poc.${strategy}`,
      );
      assert.deepEqual(proposal.patch.retractions, [
        "fact.sword.floor",
        "fact.sword.held",
      ]);
      assert.equal(proposal.patch.causalLinks.length, 3);
    }

    const resetPreview = runShadowConsistencyRepair({
      slice,
      currentFacts: facts,
      plans: [plan("reset_unknown")],
      allowShadowRepair: true,
    });
    assert.equal(resetPreview.outcome, "repaired");
    const rebuiltRows = resetPreview.final.value.factGroups.flatMap(
      (group) => group.facts,
    );
    assert.equal(rebuiltRows.length, 1);
    assert.equal(rebuiltRows[0]?.[5], "repair");
    assert.deepEqual(rebuiltRows[0]?.[6], { repairState: "unknown" });
  });

  it("rejects ambiguous selection, incomplete context, and scope expansion", () => {
    const tiedFacts = conflictFacts().map((item, index) =>
      ShadowCanonicalFactSchema.parse({
        ...item,
        validFrom: { turn: index + 1 },
        provenance: {
          ...item.provenance,
          subsystem: "semantic",
          authority: "validated_semantic_transition",
        },
      })
    );
    const tiedSlice = consistencySlice({ facts: tiedFacts });
    tiedSlice.causalLinks = [
      ["event.1", "fact.sword.held", "created"],
      ["event.2", "fact.sword.floor", "created"],
    ];
    assert.equal(proposeShadowConsistencyRepair({
      slice: tiedSlice,
      currentFacts: tiedFacts,
      plan: plan("select"),
    }).status, "rejected");

    assert.equal(proposeShadowConsistencyRepair({
      slice: consistencySlice({ truncated: true }),
      currentFacts: conflictFacts(),
      plan: plan("reset_unknown"),
    }).status, "rejected");

    const outside = plan("reinterpret");
    if (outside.strategy !== "reinterpret") return;
    outside.replacement.objectRef = "location.outside-scope";
    assert.equal(proposeShadowConsistencyRepair({
      slice: consistencySlice(),
      currentFacts: conflictFacts(),
      plan: outside,
    }).status, "rejected");
  });

  it("honors enablement, attempt, call, and touched-fact limits", () => {
    const slice = consistencySlice();
    const facts = conflictFacts();
    const disabled = runShadowConsistencyRepair({
      slice,
      currentFacts: facts,
      plans: [plan("reset_unknown")],
      allowShadowRepair: false,
    });
    assert.equal(disabled.outcome, "unresolved");
    assert.equal(disabled.attemptsUsed, 0);

    const invalid = plan("reinterpret");
    if (invalid.strategy !== "reinterpret") return;
    invalid.replacement.predicate = "state.unrelated";
    const capped = runShadowConsistencyRepair({
      slice,
      currentFacts: facts,
      plans: [invalid, plan("reset_unknown")],
      allowShadowRepair: true,
      limits: { maxAttempts: 1, maxRepairCalls: 1, maxTouchedFacts: 8 },
    });
    assert.equal(capped.outcome, "limit_reached");
    assert.equal(capped.attemptsUsed, 1);
    assert.equal(capped.repairCallsUsed, 1);
    assert.equal(capped.appliedPatches.length, 0);

    const touched = proposeShadowConsistencyRepair({
      slice,
      currentFacts: facts,
      plan: plan("reset_unknown"),
      maxTouchedFacts: 2,
    });
    assert.equal(touched.status, "rejected");
    assert.match(touched.reason, /touched-fact limit/u);
  });
});
