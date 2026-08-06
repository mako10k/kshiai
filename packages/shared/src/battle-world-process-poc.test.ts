import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateWorldProcessesPoc,
  WorldProcessPocResultSchema,
  type ActiveWorldProcess,
  type WorldProcessConcretization,
  type WorldProcessKind,
  type WorldTimelineCharacterProposal,
} from "./battle-world-process-poc.js";
import type { ConsistencySlice, ConsistencyFactRow } from "./battle-projection.js";

const turnWindow = { fromTurn: 4, toTurn: 4, phase: "execution" as const };

function slice(input: Array<{
  id: string;
  subjectRef: string;
  predicate: string;
  value?: unknown;
  unknown?: boolean;
}>): ConsistencySlice {
  return {
    schemaVersion: 2,
    purpose: "world_process",
    scope: {
      anchorRefs: ["area.1"],
      entityRefs: [...new Set([
        ...input.map((item) => item.subjectRef),
        ...Object.keys(triggers).map((kind) => `target.${kind}`),
        "character.a",
        "character.b",
        "area.2",
      ])],
      processRefs: [],
      traversedKinds: ["process_propagation", "causal_dependency"],
      temporalWindow: turnWindow,
      truncated: false,
      omitted: { entities: 0, facts: 0, rules: 0, historyTurns: 0 },
    },
    factGroups: input.map((item) => ({
      subjectRef: item.subjectRef,
      facts: [(
        item.unknown
          ? [item.id, item.predicate, null, 4, null, "world"]
          : [item.id, item.predicate, null, 4, null, "world", item.value]
      ) as ConsistencyFactRow],
    })),
    causalLinks: [],
    issues: [],
    applicableRuleRefs: [
      "world-process.fire.v1",
      "world-process.collapse.v1",
      "world-process.fall.v1",
      "world-process.spread.v1",
      "world-process.support-loss.v1",
    ],
  };
}

const triggers: Record<WorldProcessKind, { predicate: string; value: unknown }> = {
  fire: { predicate: "fire.state", value: "active" },
  collapse: { predicate: "collapse.state", value: "active" },
  fall: { predicate: "fall.state", value: "active" },
  spread: { predicate: "spread.state", value: "active" },
  support_loss: { predicate: "support.state", value: "lost" },
};

function process(kind: WorldProcessKind, targetRef: string): ActiveWorldProcess {
  return {
    processRef: `process.${kind}`,
    processKind: kind,
    sourceRefs: [`source.${kind}`],
    targetRefs: [targetRef],
    triggerFactRefs: [`fact.${kind}`],
    timing: turnWindow,
    active: true,
  };
}

describe("shadow active world-process PoC", () => {
  it("evaluates fire collapse fall spread and support loss into shadow patches", () => {
    const kinds = Object.keys(triggers) as WorldProcessKind[];
    const projection = slice(kinds.map((kind) => ({
      id: `fact.${kind}`,
      subjectRef: `source.${kind}`,
      ...triggers[kind],
    })));
    const original = structuredClone(projection);
    const result = evaluateWorldProcessesPoc({
      slice: projection,
      activeProcesses: kinds.map((kind) => process(kind, `target.${kind}`)),
      characterProposals: [],
    });

    WorldProcessPocResultSchema.parse(result);
    assert.equal(result.proposals.length, 5);
    assert.equal(result.receipts.filter((receipt) =>
      receipt.outcome === "completed" && receipt.patch
    ).length, 5);
    assert.equal(result.ruleRefsUsed.length, 5);
    assert.ok(result.receipts.every((receipt) =>
      receipt.patch?.causalLinks.some((link) => link.relation === "triggered")
    ));
    assert.ok(result.receipts.every((receipt) =>
      receipt.patch?.retractions.every((factRef) =>
        receipt.patch?.causalLinks.some((link) =>
          link.targetFactRef === factRef && link.relation === "ended"
        )
      )
    ));
    assert.equal(result.externalLlmCalls, 0);
    assert.equal(result.canonicalCommitPerformed, false);
    assert.deepEqual(projection, original);
  });

  it("places a character and process claim in one window without side priority", () => {
    const projection = slice([{
      id: "fact.fall",
      subjectRef: "source.fall",
      predicate: "fall.state",
      value: "active",
    }]);
    const character = (actorRef: string): WorldTimelineCharacterProposal => ({
      proposalRef: `proposal.${actorRef}`,
      actorRef,
      timing: turnWindow,
      exclusiveClaimRefs: ["state:character.a:actor.posture"],
    });
    const run = (actorRef: string) => evaluateWorldProcessesPoc({
      slice: projection,
      activeProcesses: [process("fall", "character.a")],
      characterProposals: [character(actorRef)],
    });
    const a = run("character.a");
    const b = run("character.b");

    assert.deepEqual(a.contestedClaimRefs, ["state:character.a:actor.posture"]);
    assert.equal(a.receipts[0]?.outcome, "requires_adjudication");
    assert.equal(a.receipts[0]?.patch, undefined);
    assert.deepEqual(a.receipts, b.receipts);
    assert.deepEqual(a.contestedClaimRefs, b.contestedClaimRefs);
  });

  it("keeps different windows independent", () => {
    const projection = slice([{
      id: "fact.fall",
      subjectRef: "source.fall",
      predicate: "fall.state",
      value: "active",
    }]);
    const character: WorldTimelineCharacterProposal = {
      proposalRef: "proposal.later",
      actorRef: "character.a",
      timing: { fromTurn: 5, toTurn: 5, phase: "execution" },
      exclusiveClaimRefs: ["state:character.a:actor.posture"],
    };
    const result = evaluateWorldProcessesPoc({
      slice: projection,
      activeProcesses: [process("fall", "character.a")],
      characterProposals: [character],
    });

    assert.deepEqual(result.contestedClaimRefs, []);
    assert.equal(result.receipts[0]?.outcome, "completed");
    assert.ok(result.receipts[0]?.patch);
  });

  it("allows one bounded unknown-to-known concretization", () => {
    const projection = slice([{
      id: "fact.spread",
      subjectRef: "source.spread",
      predicate: "spread.state",
      unknown: true,
    }, {
      id: "evidence.smoke-flow",
      subjectRef: "area.1",
      predicate: "airflow.observed",
      value: true,
    }]);
    const concretization: WorldProcessConcretization = {
      processRef: "process.spread",
      baseFactRef: "fact.spread",
      value: "active",
      evidenceRefs: ["evidence.smoke-flow"],
    };
    const result = evaluateWorldProcessesPoc({
      slice: projection,
      activeProcesses: [process("spread", "area.2")],
      characterProposals: [],
      concretizations: [concretization],
    });

    assert.equal(result.receipts[0]?.outcome, "completed");
    assert.equal(result.receipts[0]?.semanticConcretizationUsed, true);
    assert.equal(result.externalLlmCalls, 0);
  });

  it("rejects rules targets and evidence outside the projection", () => {
    const projection = slice([{
      id: "fact.fire",
      subjectRef: "source.fire",
      predicate: "fire.state",
      value: "active",
    }, {
      id: "fact.spread",
      subjectRef: "source.spread",
      predicate: "spread.state",
      unknown: true,
    }]);
    projection.applicableRuleRefs = projection.applicableRuleRefs.filter(
      (ref) => ref !== "world-process.fire.v1",
    );
    const result = evaluateWorldProcessesPoc({
      slice: projection,
      activeProcesses: [
        process("fire", "area.1"),
        process("fall", "outside.target"),
        process("spread", "area.2"),
      ],
      characterProposals: [],
      concretizations: [{
        processRef: "process.spread",
        baseFactRef: "fact.spread",
        value: "active",
        evidenceRefs: ["evidence.outside"],
      }],
    });

    assert.deepEqual(result.receipts.map((receipt) => receipt.reason).sort(), [
      "invalid_concretization",
      "missing_rule",
      "out_of_scope",
    ]);
    assert.equal(result.proposals.length, 0);
  });

  it("rejects known-state rewrites and missing triggers", () => {
    const known = slice([{
      id: "fact.spread",
      subjectRef: "source.spread",
      predicate: "spread.state",
      value: "inactive",
    }]);
    const result = evaluateWorldProcessesPoc({
      slice: known,
      activeProcesses: [
        process("spread", "area.2"),
        { ...process("fire", "area.1"), active: false },
      ],
      characterProposals: [],
      concretizations: [{
        processRef: "process.spread",
        baseFactRef: "fact.spread",
        value: "active",
        evidenceRefs: ["evidence.convenient"],
      }],
    });

    assert.deepEqual(result.receipts.map((receipt) => receipt.reason).sort(), [
      "inactive_process",
      "invalid_concretization",
    ]);
    assert.equal(result.proposals.length, 0);
  });
});
