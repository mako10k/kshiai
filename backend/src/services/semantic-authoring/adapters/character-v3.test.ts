import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHARACTER_AUTHORING_ADAPTER_IDENTITY_V1,
  CHARACTER_CLUSTER_PROPOSAL_SCHEMA_V1,
  CHARACTER_LEDGER_PROPOSAL_SCHEMA_V1,
  CHARACTER_SKELETON_PROPOSAL_SCHEMA_V1,
  defaultBasicAttack,
  defaultParameters,
  legacyCharacterSheetToDefinitionV2,
  type CharacterDefinitionV3,
} from "@kshiai/shared";
import {
  createCharacterSemanticAuthoringAdapterV3,
  type CharacterProposalV1,
} from "./character-v3.js";

function envelope(
  candidate: CharacterDefinitionV3,
  payload: CharacterProposalV1["payload"],
  affectedObligationIds: string[],
): CharacterProposalV1 {
  return {
    proposalId: "proposal-1",
    runId: "run-1",
    workItemId: "work-skeleton",
    baseCandidateRevision: 0,
    capabilitySessionId: "session-1",
    proposalSchemaIdentity: CHARACTER_SKELETON_PROPOSAL_SCHEMA_V1,
    sourceClaimIds: ["source-1"],
    affectedObligationIds,
    declaredSemanticDependantIds: [],
    provenance: [{
      targetClaimId: "identity",
      sourceClaimIds: ["source-1"],
      method: "generated",
    }],
    ownerExplanation: "Set identity from source.",
    uncertainty: [],
    payload,
  };
}

describe("character V3 semantic authoring adapter", () => {
  const adapter = createCharacterSemanticAuthoringAdapterV3();

  it("builds a create baseline and requires skeleton work first", () => {
    const source = adapter.decodeFrozenSource({ kind: "create", naturalText: "火を守る旅人" });
    assert.equal(source.accepted, true);
    if (!source.accepted) {
      assert.fail("create source rejected");
    }
    const baseline = adapter.buildBaseline(source.value, "create");
    const work = adapter.selectWork({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: new Map(),
    });
    assert.equal(adapter.identity, CHARACTER_AUTHORING_ADAPTER_IDENTITY_V1);
    assert.equal(work.selected, true);
    if (!work.selected) {
      assert.fail("expected skeleton work");
    }
    assert.equal(work.workItem.kind, "skeleton");
    const finalized = adapter.finalize({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: new Map(),
    });
    assert.equal(finalized.accepted, false);
  });

  it("stages a skeleton identity replacement without touching portrait or combat", () => {
    const source = adapter.decodeFrozenSource({ kind: "create", naturalText: "火を守る旅人" });
    if (!source.accepted) {
      assert.fail("create source rejected");
    }
    const baseline = adapter.buildBaseline(source.value, "create");
    const portrait = baseline.candidate.appearance.portrait;
    const combat = baseline.candidate.combat;
    const work = adapter.selectWork({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: new Map(),
    });
    if (!work.selected || work.workItem.kind !== "skeleton") {
      assert.fail("expected skeleton work");
    }
    const identity = {
      displayName: "灯",
      names: baseline.candidate.identity.names,
      presentation: baseline.candidate.identity.presentation,
      tags: baseline.candidate.identity.tags,
    };
    const decoded = adapter.decodeProposal(work.workItem, envelope(baseline.candidate, {
      kind: "set_skeleton",
      operations: [{ op: "replace_identity", value: identity }],
    }, ["identity"]));
    assert.equal(decoded.accepted, true);
    if (!decoded.accepted) {
      assert.fail("identity proposal rejected");
    }
    const staged = adapter.stageProposal({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: new Map(),
      proposal: decoded.value,
    });
    assert.equal(staged.accepted, true);
    if (!staged.accepted) {
      assert.fail("identity stage rejected");
    }
    assert.equal(staged.candidate.identity.displayName, "灯");
    assert.deepEqual(staged.candidate.appearance.portrait, portrait);
    assert.deepEqual(staged.candidate.combat, combat);
  });

  it("rejects unknown portrait operations at decode", () => {
    const source = adapter.decodeFrozenSource({ kind: "create", naturalText: "火を守る旅人" });
    if (!source.accepted) {
      assert.fail("create source rejected");
    }
    const baseline = adapter.buildBaseline(source.value, "create");
    const work = adapter.selectWork({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: new Map(),
    });
    if (!work.selected) {
      assert.fail("expected work");
    }
    const decoded = adapter.decodeProposal(work.workItem, envelope(baseline.candidate, {
      kind: "set_portrait",
      value: { mediaId: "media", revisionId: "rev" },
    } as never, ["identity"]));
    assert.equal(decoded.accepted, false);
  });

  it("rejects appearance operations during the skeleton phase", () => {
    const source = adapter.decodeFrozenSource({ kind: "create", naturalText: "火を守る旅人" });
    if (!source.accepted) {
      assert.fail("create source rejected");
    }
    const baseline = adapter.buildBaseline(source.value, "create");
    const work = adapter.selectWork({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: new Map(),
    });
    if (!work.selected) {
      assert.fail("expected work");
    }
    const decoded = adapter.decodeProposal(work.workItem, envelope(baseline.candidate, {
      kind: "set_skeleton",
      operations: [{
        op: "set_appearance_summary",
        value: "赤い外套",
      }],
    }, ["appearance"]));
    assert.equal(decoded.accepted, false);
  });

  it("hides the preservation capsule from create and revise tools", () => {
    const source = adapter.decodeFrozenSource({ kind: "create", naturalText: "火を守る旅人" });
    if (!source.accepted) {
      assert.fail("create source rejected");
    }
    const baseline = adapter.buildBaseline(source.value, "create");
    const work = adapter.selectWork({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: new Map(),
    });
    if (!work.selected) {
      assert.fail("expected work");
    }
    const tools = adapter.describeCapabilities(work.workItem);
    assert.equal(tools.allowedSelectors.includes("preservation-capsule"), false);
    assert.equal(tools.skill.disclosureReminder.includes("preservation"), true);
  });

  it("exposes the preservation capsule only on migrate ledger work", () => {
    const v2 = legacyCharacterSheetToDefinitionV2({
      id: "character-v2",
      ownerUserId: "owner",
      displayName: "灯",
      tags: [],
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
      appearance: { summary: "赤い外套", visualPrompt: "red cloak" },
      traits: [],
      parameters: defaultParameters(),
      skills: [],
      basicAttack: defaultBasicAttack(),
      weapon: null,
      armor: null,
      combatFlags: { canFight: true, irreversibleIncapacitated: false },
      narrativeBlurb: "火を守る旅人。",
    });
    const source = adapter.decodeFrozenSource({
      kind: "migrate",
      definition: v2,
      capsule: {
        capsuleVersion: 1,
        migrationAttemptId: "attempt-1",
        sourceGenerationId: "gen-1",
        targetGenerationId: "gen-2",
        entries: [{
          sourcePath: "identity.displayName",
          value: "旧名",
          operationId: "op-1",
          provenanceCategory: "retired",
        }],
        createdAt: "2026-09-12T00:00:00.000Z",
      },
    });
    assert.equal(source.accepted, true);
    if (!source.accepted || source.value.kind !== "migrate") {
      assert.fail("migrate source rejected");
    }
    assert.equal(source.value.capsule?.entries[0]?.sourcePath, "identity.displayName");
    const baseline = adapter.buildBaseline(source.value, "migrate");
    const resolved = new Map(baseline.obligations);
    for (const [id, item] of resolved) {
      if (item.cluster !== "ledger") {
        resolved.set(id, { ...item, resolved: true });
      }
    }
    const work = adapter.selectWork({
      candidate: baseline.candidate,
      obligations: resolved,
      findings: new Map(),
    });
    assert.equal(work.selected, true);
    if (!work.selected || work.workItem.kind !== "ledger") {
      assert.fail("expected ledger work");
    }
    const tools = adapter.describeCapabilities(work.workItem);
    assert.equal(tools.allowedSelectors.includes("preservation-capsule"), true);
  });

  it("reruns a compiler lens without changing the candidate", () => {
    const source = adapter.decodeFrozenSource({ kind: "create", naturalText: "火を守る旅人" });
    if (!source.accepted) {
      assert.fail("create source rejected");
    }
    const baseline = adapter.buildBaseline(source.value, "create");
    const before = JSON.stringify(baseline.candidate.appearance.portrait);
    const proposal: CharacterProposalV1 = {
      ...envelope(baseline.candidate, {
        kind: "submit_lens_review",
        lens: "compiler",
        findingIds: ["compiler"],
        verdict: "pass",
      }, ["lens:compiler"]),
      proposalSchemaIdentity: CHARACTER_LEDGER_PROPOSAL_SCHEMA_V1,
      workItemId: "work-ledger",
    };
    const staged = adapter.stageProposal({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: new Map(),
      proposal,
    });
    assert.equal(staged.accepted, true);
    if (!staged.accepted) {
      assert.fail("lens staging rejected");
    }
    assert.equal(JSON.stringify(staged.candidate.appearance.portrait), before);
    assert.deepEqual(staged.candidate.combat, baseline.candidate.combat);
  });

  it("rejects complete_cluster while skeleton work is active", () => {
    const source = adapter.decodeFrozenSource({ kind: "create", naturalText: "火を守る旅人" });
    if (!source.accepted) {
      assert.fail("create source rejected");
    }
    const baseline = adapter.buildBaseline(source.value, "create");
    const work = adapter.selectWork({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: new Map(),
    });
    if (!work.selected || work.workItem.kind !== "skeleton") {
      assert.fail("expected skeleton work");
    }
    const decoded = adapter.decodeProposal(work.workItem, {
      ...envelope(baseline.candidate, {
        kind: "complete_cluster",
        cluster: "appearance",
        operations: [{ op: "set_appearance_summary", value: "赤い外套" }],
      }, ["appearance"]),
      proposalSchemaIdentity: CHARACTER_CLUSTER_PROPOSAL_SCHEMA_V1,
    });
    assert.equal(decoded.accepted, false);
    assert.equal(baseline.obligations.get("relationship-expression")?.resolved, false);
    assert.equal(baseline.obligations.get("identity")?.resolved, false);
  });

  it("does not resolve skeleton needs from a self-declared obligation list", () => {
    const source = adapter.decodeFrozenSource({ kind: "create", naturalText: "火を守る旅人" });
    if (!source.accepted) {
      assert.fail("create source rejected");
    }
    const baseline = adapter.buildBaseline(source.value, "create");
    const work = adapter.selectWork({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: new Map(),
    });
    if (!work.selected || work.workItem.kind !== "skeleton") {
      assert.fail("expected skeleton work");
    }
    const identity = {
      displayName: "灯",
      names: baseline.candidate.identity.names,
      presentation: baseline.candidate.identity.presentation,
      tags: baseline.candidate.identity.tags,
    };
    const decoded = adapter.decodeProposal(work.workItem, envelope(baseline.candidate, {
      kind: "set_skeleton",
      operations: [{ op: "replace_identity", value: identity }],
    }, ["identity", "psycheDisposition:coreNeeds"]));
    if (!decoded.accepted) {
      assert.fail("identity proposal rejected");
    }
    const staged = adapter.stageProposal({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: new Map(),
      proposal: decoded.value,
    });
    assert.equal(staged.accepted, true);
    if (!staged.accepted) {
      assert.fail("identity stage rejected");
    }
    assert.equal(staged.obligations.get("identity")?.resolved, true);
    assert.equal(staged.obligations.get("psycheDisposition:coreNeeds")?.resolved, false);
  });

  it("opens the requested revise cluster instead of finalizing an unchanged character", () => {
    const created = adapter.decodeFrozenSource({ kind: "create", naturalText: "火を守る旅人" });
    if (!created.accepted) {
      assert.fail("create source rejected");
    }
    const scaffold = adapter.buildBaseline(created.value, "create").candidate;
    const description = {
      text: "守る",
      consumerTags: ["conscious-action" as const],
      sourceSupportRefs: [],
    };
    const complete = {
      ...scaffold,
      identity: { ...scaffold.identity, displayName: "灯" },
      psycheDisposition: {
        ...scaffold.psycheDisposition,
        coreNeeds: [{
          id: "protect",
          description,
          selfAwareness: "aware" as const,
        }],
      },
      capabilities: {
        ...scaffold.capabilities,
        basicAction: { ...scaffold.capabilities.basicAction, name: "構え" },
      },
      relationshipSeeds: [{
        id: "rival",
        target: { kind: "role" as const, role: "rival" as const },
        relationKinds: ["rival"],
        historySummary: null,
        defaultAddress: null,
        selfAwareness: "aware" as const,
        dynamics: { trust: 0, affiliation: 0, fear: 0, competition: 0 },
        priority: 50,
      }],
      speechPolicy: { ...scaffold.speechPolicy, register: "丁寧" },
      appearance: { ...scaffold.appearance, publicSummary: "赤い外套" },
    };
    const source = adapter.decodeFrozenSource({
      kind: "revise",
      definition: complete,
      requestedCluster: "mechanics",
    });
    assert.equal(source.accepted, true);
    if (!source.accepted) {
      assert.fail("revise source rejected");
    }
    const baseline = adapter.buildBaseline(source.value, "revise");
    const work = adapter.selectWork({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: new Map(),
    });
    assert.equal(work.selected, true);
    if (!work.selected || work.workItem.kind !== "cluster") {
      assert.fail("expected mechanics cluster work");
    }
    assert.equal(work.workItem.cluster, "mechanics");
  });

  it("repairs a registered action-norm dependant and rejects an unregistered extra field", () => {
    const source = adapter.decodeFrozenSource({ kind: "create", naturalText: "火を守る旅人" });
    if (!source.accepted) {
      assert.fail("create source rejected");
    }
    const baseline = adapter.buildBaseline(source.value, "create");
    const actionId = baseline.candidate.capabilities.basicAction.id;
    const candidate = {
      ...baseline.candidate,
      actionNorms: [{
        id: "prefer-basic",
        when: {
          match: "all" as const,
          clauses: [{ kind: "always" as const, operator: "is" as const, value: "true" }],
        },
        response: {
          disposition: "prefer" as const,
          actionRefs: [actionId],
          actionKinds: [],
          tacticTags: [],
        },
        priority: 50,
        force: "preference" as const,
        exceptions: [],
        description: null,
      }],
    };
    const findings = new Map([["actionNorms:prefer-basic", {
      code: "invalid-norm",
      explanation: "action norm needs a matching action label",
    }]]);
    const obligations = new Map(baseline.obligations);
    const mechanics = obligations.get("mechanics");
    if (mechanics) {
      obligations.set("mechanics", { ...mechanics, resolved: true });
    }
    const workItem = {
      kind: "cluster" as const,
      workItemId: "work-mechanics",
      cluster: "mechanics" as const,
    };
    const allowed = adapter.decodeProposal(workItem, {
      ...envelope(candidate, {
        kind: "repair_cluster",
        cluster: "mechanics",
        operations: [
          {
            op: "upsert_action_norm",
            value: candidate.actionNorms[0]!,
          },
          {
            op: "set_action_semantics",
            value: {
              id: actionId,
              name: "構え",
              description: candidate.capabilities.basicAction.description,
              kind: candidate.capabilities.basicAction.kind,
              tacticTags: candidate.capabilities.basicAction.tacticTags,
              expressionNotes: candidate.capabilities.basicAction.expressionNotes,
            },
          },
        ],
      }, ["actionNorms:prefer-basic"]),
      workItemId: "work-mechanics",
      proposalSchemaIdentity: CHARACTER_CLUSTER_PROPOSAL_SCHEMA_V1,
      declaredSemanticDependantIds: [`capabilities:actions:${actionId}`],
    });
    assert.equal(allowed.accepted, true);
    if (!allowed.accepted) {
      assert.fail("registered dependant repair rejected at decode");
    }
    const staged = adapter.stageProposal({
      candidate,
      obligations,
      findings,
      proposal: allowed.value,
    });
    assert.equal(staged.accepted, true);

    const extraFallback = {
      id: "fallback-basic",
      applicability: {
        match: "all" as const,
        clauses: [{ kind: "always" as const, operator: "is" as const, value: "true" }],
      },
      orderedActionRefs: [actionId],
      priority: 50,
      receiptContract: "character-mechanical-conflict-receipt-v1" as const,
    };
    const extra = adapter.decodeProposal(workItem, {
      ...envelope(candidate, {
        kind: "repair_cluster",
        cluster: "mechanics",
        operations: [
          {
            op: "upsert_action_norm",
            value: candidate.actionNorms[0]!,
          },
          {
            op: "upsert_mechanical_fallback",
            value: extraFallback,
          },
        ],
      }, ["actionNorms:prefer-basic"]),
      workItemId: "work-mechanics",
      proposalSchemaIdentity: CHARACTER_CLUSTER_PROPOSAL_SCHEMA_V1,
      declaredSemanticDependantIds: ["mechanicalConflictFallbacks:fallback-basic"],
    });
    assert.equal(extra.accepted, true);
    if (!extra.accepted) {
      assert.fail("extra-field repair rejected at decode");
    }
    const rejected = adapter.stageProposal({
      candidate,
      obligations,
      findings,
      proposal: extra.value,
    });
    assert.equal(rejected.accepted, false);
    if (rejected.accepted) {
      assert.fail("unregistered fallback was staged");
    }
    assert.equal(rejected.findingKey, "repair-closure");
  });
});
