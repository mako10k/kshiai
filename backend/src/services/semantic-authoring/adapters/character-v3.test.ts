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
  CharacterDefinitionV2Schema,
} from "@kshiai/shared";
import {
  buildCharacterMigrationReviewCandidateV1,
  createCharacterSemanticAuthoringAdapterV3,
  type CharacterProposalV1,
} from "./character-v3.js";
import { buildCharacterMigrationSourceLedgerV1, splitCharacterV2NormV1 } from "./character-source-ledger.js";

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

  it("rejects deferral when no consumer-scoped obligation is registered", () => {
    const baseline = adapter.buildBaseline({ kind: "create", naturalText: "青いコート" }, "create");
    const proposal = envelope(baseline.candidate, {
      kind: "propose_deferral",
      obligationIds: ["appearance"],
      resolution: "generate-later",
      reason: "Add details later.",
    }, ["appearance"]);
    const staged = adapter.stageProposal({ ...baseline, findings: new Map(), proposal });
    assert.equal(staged.accepted, false);
    if (staged.accepted) assert.fail("unregistered deferral was accepted");
    assert.equal(staged.finding.code, "deferral-not-registered");
  });

  it("copies executable V2 fragments and keeps each changed-role claim unresolved", () => {
    const base = adapter.buildBaseline({ kind: "create", naturalText: "source" }, "create").candidate;
    const { consciousGuidance: _guidance, mechanicalConflictFallbacks: _fallbacks, ...stable } = base;
    const definition = CharacterDefinitionV2Schema.parse({ ...stable, schemaVersion: 2, actionNorms: [{
      id: "protect", when: { match: "all", clauses: [{ kind: "always", operator: "is", value: "true" }] },
      response: { disposition: "prefer", actionRefs: [base.capabilities.basicAction.id], actionKinds: [],
        tacticTags: [], statement: "守り続ける", fallbackActionRef: base.capabilities.basicAction.id },
      selfAwareness: "aware", priority: 50, force: "preference", exceptions: [], description: null,
    }] });
    const baseline = adapter.buildBaseline({ kind: "migrate", definition, capsule: null }, "migrate");
    assert.deepEqual(baseline.candidate.actionNorms, [splitCharacterV2NormV1(definition.actionNorms[0]!).executable]);
    assert.equal(baseline.obligations.has("source:actionNorms"), false,
      "collections are reconciled through their stable operation targets");
    assert.equal(baseline.obligations.has("source:psycheDisposition"), false,
      "composite source objects are reconciled through their writable nested targets");
    assert.equal(baseline.obligations.get("source:psycheDisposition:dynamics")?.resolved, true);
    assert.equal(baseline.obligations.get("source:actionNorms:protect")?.resolved, true);
    const legacy = baseline.obligations.get("source:actionNorms:protect:legacyMeaning");
    assert.equal(legacy?.resolved, false);
    assert.deepEqual(legacy?.sourceClaim?.original, { statement: "守り続ける", selfAwareness: "aware",
      fallbackActionRef: base.capabilities.basicAction.id });
    assert.equal(baseline.obligations.get("source-disposition")?.resolved, false);
    assert.equal(baseline.sourceDispositions?.get("combat")?.disposition, "preserve");
    const readyForChangedRole = new Map(baseline.obligations);
    for (const [id, item] of readyForChangedRole) {
      if (item.cluster === "skeleton") readyForChangedRole.set(id, { ...item, resolved: true });
    }
    const firstWork = adapter.selectWork({ candidate: baseline.candidate,
      obligations: readyForChangedRole, findings: new Map() });
    assert.equal(firstWork.selected && firstWork.workItem.kind, "cluster");
    if (!firstWork.selected || firstWork.workItem.kind !== "cluster") assert.fail("expected mechanics work");
    assert.equal(firstWork.workItem.cluster, "mechanics");

    const oneCopy = envelope(baseline.candidate, { kind: "classify_source_disposition", decisions: [{
      sourceClaimId: "identity", disposition: "preserve", targetClaimIds: ["identity"], rationale: "Exact copy.",
    }] }, ["source:identity"]);
    const staged = adapter.stageProposal({ ...baseline, findings: new Map(), proposal: oneCopy });
    assert.ok(staged.accepted);
    assert.equal(staged.obligations.get("source-disposition")?.resolved, false,
      "one disposition cannot erase outstanding changed-role source work");

    const missing = adapter.stageProposal({ ...baseline, findings: new Map(), proposal: {
      ...oneCopy, payload: { kind: "classify_source_disposition", decisions: [{
        sourceClaimId: "invented", disposition: "preserve", targetClaimIds: ["identity"], rationale: "Pretend.",
      }] },
    } });
    assert.equal(missing.accepted, false);
    const changed = { ...baseline.candidate, identity: { ...baseline.candidate.identity, displayName: "別人" } };
    const falseCopy = adapter.stageProposal({ ...baseline, candidate: changed, findings: new Map(), proposal: oneCopy });
    assert.equal(falseCopy.accepted, false);
    assert.equal(adapter.finalize({ ...baseline, candidate: changed, findings: new Map() }).accepted, false);

    const guidance = {
      id: "protect-guidance",
      applicability: { match: "all" as const,
        clauses: [{ kind: "always" as const, operator: "is" as const, value: "true" as const }] },
      statement: "守り続ける",
      priority: 50,
      force: "preference" as const,
      selfAwareness: "aware" as const,
      exceptions: [],
      description: null,
    };
    const fallback = {
      id: "protect-fallback",
      applicability: guidance.applicability,
      orderedActionRefs: [base.capabilities.basicAction.id],
      priority: 50,
      receiptContract: "character-mechanical-conflict-receipt-v1" as const,
    };
    const transformedCandidate = { ...baseline.candidate, consciousGuidance: [guidance],
      mechanicalConflictFallbacks: [fallback] };
    const sourceClaimId = "actionNorms:protect:legacyMeaning";
    const targetClaimId = "consciousGuidance:protect-guidance";
    const fallbackClaimId = "mechanicalConflictFallbacks:protect-fallback";
    const transformed: CharacterProposalV1 = {
      ...envelope(transformedCandidate, { kind: "classify_source_disposition", decisions: [{
        sourceClaimId,
        disposition: "split",
        targetClaimIds: [targetClaimId, fallbackClaimId],
        rationale: "The awareness-gated statement is represented as conscious guidance.",
      }] }, [`source:${sourceClaimId}`]),
      proposalSchemaIdentity: CHARACTER_LEDGER_PROPOSAL_SCHEMA_V1,
      workItemId: "work-ledger",
      sourceClaimIds: [sourceClaimId],
      provenance: [
        { targetClaimId, sourceClaimIds: [sourceClaimId], method: "derived" },
        { targetClaimId: fallbackClaimId, sourceClaimIds: [sourceClaimId], method: "derived" },
      ],
    };
    const stagedTransform = adapter.stageProposal({
      ...baseline,
      candidate: transformedCandidate,
      findings: new Map(),
      proposal: transformed,
    });
    assert.equal(stagedTransform.accepted, true);
    if (!stagedTransform.accepted) assert.fail("transformed source disposition rejected");
    assert.equal(stagedTransform.obligations.get(`source:${sourceClaimId}`)?.resolved, true);
    assert.equal(stagedTransform.obligations.get("source-disposition")?.resolved, true);
  });

  it("closes a changed-role source claim only when an exact capsule copy exists", () => {
    const createBase = adapter.buildBaseline({ kind: "create", naturalText: "source" }, "create").candidate;
    const { consciousGuidance: _guidance, mechanicalConflictFallbacks: _fallbacks, ...stable } = createBase;
    const definition = CharacterDefinitionV2Schema.parse({ ...stable,
      identity: { ...stable.identity, displayName: "火を守る人" },
      schemaVersion: 2, actionNorms: [{
      id: "protect", when: { match: "all", clauses: [{ kind: "always", operator: "is", value: "true" }] },
      response: { disposition: "prefer", actionRefs: [createBase.capabilities.basicAction.id], actionKinds: [],
        tacticTags: [], statement: "守り続ける", fallbackActionRef: null },
      selfAwareness: "aware", priority: 50, force: "preference", exceptions: [], description: null,
    }] });
    const sourceClaimId = "actionNorms:protect:legacyMeaning";
    const preservedValue = { statement: "守り続ける", selfAwareness: "aware", fallbackActionRef: null };
    const optionalCapabilities = { contractVersion: 1 as const,
      required: [{ consumer: "battle-mechanics" as const, version: 3 }] };
    const capsule = {
      capsuleVersion: 1 as const,
      migrationAttemptId: "attempt-1",
      sourceGenerationId: "generation-v2",
      targetGenerationId: "generation-v3",
      entries: [{ sourcePath: sourceClaimId, value: preservedValue, operationId: "retire-1",
        provenanceCategory: "retired" as const }],
      createdAt: "2026-09-15T00:00:00.000Z",
    };
    const baseline = adapter.buildBaseline({ kind: "migrate", definition, capsule,
      requiredCapabilities: optionalCapabilities }, "migrate");
    const proposal: CharacterProposalV1 = {
      ...envelope(baseline.candidate, { kind: "classify_source_disposition", decisions: [{
        sourceClaimId,
        disposition: "preserve-in-capsule",
        targetClaimIds: [],
        rationale: "Retained outside active character truth.",
      }] }, [`source:${sourceClaimId}`]),
      proposalSchemaIdentity: CHARACTER_LEDGER_PROPOSAL_SCHEMA_V1,
      workItemId: "work-ledger",
      sourceClaimIds: [sourceClaimId],
      provenance: [{ targetClaimId: "identity", sourceClaimIds: [sourceClaimId], method: "preserved" }],
    };
    const staged = adapter.stageProposal({ ...baseline, findings: new Map(), proposal });
    assert.equal(staged.accepted, true);
    if (!staged.accepted) assert.fail("capsule disposition rejected");
    assert.equal(staged.obligations.get(`source:${sourceClaimId}`)?.resolved, true);

    const withoutCapsule = adapter.buildBaseline({ kind: "migrate", definition, capsule: null,
      requiredCapabilities: optionalCapabilities }, "migrate");
    const rejected = adapter.stageProposal({ ...withoutCapsule, findings: new Map(), proposal });
    assert.equal(rejected.accepted, true);
    if (!rejected.accepted) assert.fail("well-formed unresolved capsule disposition rejected");
    assert.equal(rejected.obligations.get(`source:${sourceClaimId}`)?.resolved, false);
  });

  it("resolves discard-as-nonmaterial only for an exact frozen capsule copy", () => {
    const createBase = adapter.buildBaseline({ kind: "create", naturalText: "source" }, "create").candidate;
    const { consciousGuidance: _guidance, mechanicalConflictFallbacks: _fallbacks, ...stable } = createBase;
    const definition = CharacterDefinitionV2Schema.parse({ ...stable, schemaVersion: 2, actionNorms: [{
      id: "protect", when: { match: "all", clauses: [{ kind: "always", operator: "is", value: "true" }] },
      response: { disposition: "prefer", actionRefs: [createBase.capabilities.basicAction.id], actionKinds: [],
        tacticTags: [], statement: "守り続ける", fallbackActionRef: null },
      selfAwareness: "aware", priority: 50, force: "preference", exceptions: [], description: null,
    }] });
    const sourceClaimId = "actionNorms:protect:legacyMeaning";
    const preservedValue = { statement: "守り続ける", selfAwareness: "aware", fallbackActionRef: null };
    const optionalCapabilities = { contractVersion: 1 as const,
      required: [{ consumer: "battle-mechanics" as const, version: 3 }] };
    const capsule = {
      capsuleVersion: 1 as const,
      migrationAttemptId: "attempt-1",
      sourceGenerationId: "generation-v2",
      targetGenerationId: "generation-v3",
      entries: [{ sourcePath: sourceClaimId, value: preservedValue, operationId: "retire-1",
        provenanceCategory: "retired" as const }],
      createdAt: "2026-09-15T00:00:00.000Z",
    };
    const makeProposal = (baseline: ReturnType<typeof adapter.buildBaseline>): CharacterProposalV1 => ({
      ...envelope(baseline.candidate, { kind: "classify_source_disposition", decisions: [{
        sourceClaimId, disposition: "discard-as-nonmaterial", targetClaimIds: [],
        rationale: "Retained only as an exact frozen source copy.",
      }] }, [`source:${sourceClaimId}`]),
      proposalSchemaIdentity: CHARACTER_LEDGER_PROPOSAL_SCHEMA_V1,
      workItemId: "work-ledger",
      sourceClaimIds: [sourceClaimId],
      provenance: [],
    });

    const exactBaseline = adapter.buildBaseline({ kind: "migrate", definition, capsule,
      requiredCapabilities: optionalCapabilities }, "migrate");
    const exact = adapter.stageProposal({ ...exactBaseline, findings: new Map(), proposal: makeProposal(exactBaseline) });
    assert.equal(exact.accepted, true);
    if (!exact.accepted) assert.fail("exact discard disposition rejected");
    assert.equal(exact.obligations.get(`source:${sourceClaimId}`)?.resolved, true);

    const absentBaseline = adapter.buildBaseline({ kind: "migrate", definition, capsule: null,
      requiredCapabilities: optionalCapabilities }, "migrate");
    const absent = adapter.stageProposal({ ...absentBaseline, findings: new Map(), proposal: makeProposal(absentBaseline) });
    assert.equal(absent.accepted, true);
    if (!absent.accepted) assert.fail("well-formed absent-capsule discard rejected");
    assert.equal(absent.obligations.get(`source:${sourceClaimId}`)?.resolved, true);
    assert.deepEqual(absent.obligations.get(`source:${sourceClaimId}`)?.pendingPreservation,
      { sourceClaimId, originalValue: preservedValue, disposition: "discard-as-nonmaterial",
        rationale: "Retained only as an exact frozen source copy." });
    const pending = absent.obligations.get(`source:${sourceClaimId}`)?.pendingPreservation;
    assert.ok(pending);
    const pendingReview = buildCharacterMigrationReviewCandidateV1({
      definition: absent.candidate, requiredCapabilities: null, deferredValues: [],
      pendingPreservation: [pending],
    });
    assert.deepEqual(pendingReview.pendingPreservation, [pending]);
    assert.equal(pendingReview.compatibility, null);

    const mismatchedBaseline = adapter.buildBaseline({ kind: "migrate", definition, requiredCapabilities: optionalCapabilities, capsule: {
      ...capsule, entries: [{ ...capsule.entries[0], value: { ...preservedValue, statement: "別の内容" } }],
    } }, "migrate");
    const mismatched = adapter.stageProposal({ ...mismatchedBaseline, findings: new Map(), proposal: makeProposal(mismatchedBaseline) });
    assert.equal(mismatched.accepted, true);
    if (!mismatched.accepted) assert.fail("well-formed mismatched-capsule discard rejected");
    assert.equal(mismatched.obligations.get(`source:${sourceClaimId}`)?.resolved, false);

    const required = buildCharacterMigrationSourceLedgerV1(definition, exactBaseline.candidate,
      capsule, { contractVersion: 1, required: [{ consumer: "character-conscious-self", version: 3 }] });
    assert.equal(required.claims.find((claim) => claim.sourceClaimId === sourceClaimId)
      ?.nonmaterialDiscardEligible, false);
    assert.equal(required.claims.find((claim) => claim.sourceClaimId === "combat")
      ?.nonmaterialDiscardEligible, false);

    const withFallback = CharacterDefinitionV2Schema.parse({ ...definition, actionNorms: [{
      ...definition.actionNorms[0], response: { ...definition.actionNorms[0].response,
        fallbackActionRef: createBase.capabilities.basicAction.id },
    }] });
    const fallbackLedger = buildCharacterMigrationSourceLedgerV1(withFallback, exactBaseline.candidate,
      capsule, optionalCapabilities);
    assert.equal(fallbackLedger.claims.find((claim) => claim.sourceClaimId === sourceClaimId)
      ?.nonmaterialDiscardEligible, false);
  });

  it("accepts only optional registered legacy meaning deferral and retains it across refresh", () => {
    const createBase = adapter.buildBaseline({ kind: "create", naturalText: "source" }, "create").candidate;
    const { consciousGuidance: _guidance, mechanicalConflictFallbacks: _fallbacks, ...stable } = createBase;
    const sourceClaimId = "actionNorms:protect:legacyMeaning";
    const definition = CharacterDefinitionV2Schema.parse({ ...stable,
      identity: { ...stable.identity, displayName: "火を守る人" },
      schemaVersion: 2, actionNorms: [{
      id: "protect", when: { match: "all", clauses: [{ kind: "always", operator: "is", value: "true" }] },
      response: { disposition: "prefer", actionRefs: [createBase.capabilities.basicAction.id], actionKinds: [],
        tacticTags: [], statement: "守り続ける", fallbackActionRef: null },
      selfAwareness: "aware", priority: 50, force: "preference", exceptions: [], description: null,
    }] });
    const capsule = {
      capsuleVersion: 1 as const,
      migrationAttemptId: "attempt-1",
      sourceGenerationId: "generation-v2",
      targetGenerationId: "generation-v3",
      entries: [{ sourcePath: sourceClaimId, value: { statement: "守り続ける", selfAwareness: "aware",
        fallbackActionRef: null }, operationId: "retire-1", provenanceCategory: "retired" as const }],
      createdAt: "2026-09-15T00:00:00.000Z",
    };
    const optionalCapabilities = { contractVersion: 1 as const,
      required: [{ consumer: "battle-mechanics" as const, version: 3 }] };
    const requiredCapabilities = { contractVersion: 1 as const,
      required: [{ consumer: "character-conscious-self" as const, version: 3 }] };
    const makeProposal = (baseline: ReturnType<typeof adapter.buildBaseline>): CharacterProposalV1 => ({
      ...envelope(baseline.candidate, { kind: "propose_deferral", obligationIds: [`source:${sourceClaimId}`],
        resolution: "generate-later", reason: "Conscious guidance is optional for this frozen compiler set." },
      [`source:${sourceClaimId}`]),
      proposalSchemaIdentity: CHARACTER_LEDGER_PROPOSAL_SCHEMA_V1,
      workItemId: "work-ledger",
      sourceClaimIds: [sourceClaimId],
      provenance: [],
    });

    const optionalBaseline = adapter.buildBaseline({ kind: "migrate", definition, capsule,
      requiredCapabilities: optionalCapabilities }, "migrate");
    const accepted = adapter.stageProposal({ ...optionalBaseline, findings: new Map(), proposal: makeProposal(optionalBaseline) });
    assert.equal(accepted.accepted, true);
    if (!accepted.accepted) assert.fail("optional deferral rejected");
    const deferred = accepted.obligations.get(`source:${sourceClaimId}`);
    assert.equal(deferred?.resolved, true);
    assert.deepEqual(deferred?.deferredValue, {
      targetPath: "definition.consciousGuidance.protect",
      reason: "Conscious guidance is optional for this frozen compiler set.",
      candidateSourcePaths: ["definition.actionNorms"],
      requiringCapability: { consumer: "character-conscious-self", version: 3 },
    });
    const refreshed = adapter.stageProposal({ ...accepted, proposal: {
      ...makeProposal(optionalBaseline), payload: { kind: "submit_lens_review", lens: "compiler",
        findingIds: [], verdict: "pass" },
    } });
    assert.equal(refreshed.accepted, true);
    if (!refreshed.accepted) assert.fail("refresh rejected");
    assert.equal(refreshed.obligations.get(`source:${sourceClaimId}`)?.resolved, true);
    assert.deepEqual(refreshed.obligations.get(`source:${sourceClaimId}`)?.deferredValue,
      deferred?.deferredValue);
    const reviewCandidate = buildCharacterMigrationReviewCandidateV1({
      definition: refreshed.candidate, requiredCapabilities: optionalCapabilities,
      deferredValues: deferred?.deferredValue ? [deferred.deferredValue] : [],
    });
    assert.deepEqual(reviewCandidate.deferredValues, [deferred?.deferredValue]);
    assert.ok(reviewCandidate.compatibility);
    assert.equal(reviewCandidate.compatibility.status, "blocked");
    assert.equal(reviewCandidate.compatibility.deferred[0]?.capability.consumer,
      "character-conscious-self");

    const requiredBaseline = adapter.buildBaseline({ kind: "migrate", definition, capsule,
      requiredCapabilities }, "migrate");
    const required = adapter.stageProposal({ ...requiredBaseline, findings: new Map(), proposal: makeProposal(requiredBaseline) });
    assert.equal(required.accepted, false);
    if (required.accepted) assert.fail("required deferral accepted");
    assert.equal(required.finding.code, "deferral-not-eligible");

    const absentCapsuleBaseline = adapter.buildBaseline({ kind: "migrate", definition,
      requiredCapabilities: optionalCapabilities, capsule: null }, "migrate");
    const absentCapsule = adapter.stageProposal({ ...absentCapsuleBaseline, findings: new Map(),
      proposal: makeProposal(absentCapsuleBaseline) });
    assert.equal(absentCapsule.accepted, true);
    if (!absentCapsule.accepted) assert.fail("pending exact-copy deferral rejected");
    assert.equal(absentCapsule.obligations.get(`source:${sourceClaimId}`)?.resolved, true);
    assert.deepEqual(absentCapsule.obligations.get(`source:${sourceClaimId}`)?.pendingPreservation?.originalValue,
      capsule.entries[0].value);
  });

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
          clauses: [{ kind: "always" as const, operator: "is" as const, value: "true" as const }],
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
        clauses: [{ kind: "always" as const, operator: "is" as const, value: "true" as const }],
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
