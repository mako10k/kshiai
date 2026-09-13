import {
  createSemanticProposalV1Schema,
  type AdapterProgressObservationV1,
  type SemanticAuthoringAdapterV1,
  type SemanticProposalV1,
} from "@kshiai/shared";
import { createHash } from "node:crypto";
import { z } from "zod";

export type FamilyConformanceSourceV1 =
  | Readonly<{ kind: "create"; naturalText: string }>
  | Readonly<{ kind: "revise"; definition: unknown }>
  | Readonly<{ kind: "migrate"; definition: unknown }>;

export type FamilyConformanceProposalV1 = SemanticProposalV1<
  | Readonly<{ kind: "set_display_name"; value: string }>
  | Readonly<{ kind: "record_disposition" }>
>;

const PLACEHOLDER = "未設定";
const proposalSchemaIdentity = "family_conformance_proposal_v1";
const proposalSchema = createSemanticProposalV1Schema(
  proposalSchemaIdentity,
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("set_display_name"),
      value: z.string().min(1).max(48),
    }).strict(),
    z.object({
      kind: z.literal("record_disposition"),
    }).strict(),
  ]),
);

type FamilyConformanceConfig<Candidate> = Readonly<{
  identity: string;
  scaffold: Candidate;
  parse: (value: unknown) => Candidate | null;
  displayName: (candidate: Candidate) => string;
  withDisplayName: (candidate: Candidate, value: string) => Candidate;
  compile: (candidate: Candidate) => Readonly<{
    compilerIdentity: string;
    disclosureIdentity: string;
  }> | null;
}>;

export function createFamilyConformanceAdapter<Candidate>(
  config: FamilyConformanceConfig<Candidate>,
): SemanticAuthoringAdapterV1<
  FamilyConformanceSourceV1,
  Candidate,
  string,
  string,
  FamilyConformanceProposalV1,
  string,
  string,
  string,
  Candidate
> {
  return {
    identity: config.identity,
    decodeFrozenSource(value) {
      if (typeof value !== "object" || value === null || !("kind" in value)) {
        return { accepted: false };
      }
      if (value.kind === "create" && "naturalText" in value && typeof value.naturalText === "string") {
        return { accepted: true, value: { kind: "create", naturalText: value.naturalText } };
      }
      if (value.kind === "revise" && "definition" in value) {
        const parsed = config.parse(value.definition);
        return parsed
          ? { accepted: true, value: { kind: "revise", definition: parsed } }
          : { accepted: false };
      }
      if (value.kind === "migrate" && "definition" in value) {
        const parsed = config.parse(value.definition);
        return parsed
          ? { accepted: true, value: { kind: "migrate", definition: parsed } }
          : { accepted: false };
      }
      return { accepted: false };
    },
    buildBaseline(source, mode) {
      const candidate = source.kind === "create" ? config.scaffold : config.parse(source.definition) ?? config.scaffold;
      const resolved = config.displayName(candidate) !== PLACEHOLDER;
      const obligations = new Map([["identity", resolved ? "resolved" : "open"]]);
      if (mode === "migrate") {
        obligations.set("source-disposition", "open");
      }
      return { candidate, obligations };
    },
    selectWork(state) {
      if (state.obligations.get("identity") === "open") {
        return { selected: true, workItem: "identity" };
      }
      if (state.obligations.get("source-disposition") === "open") {
        return { selected: true, workItem: "ledger" };
      }
      return { selected: false };
    },
    describeCapabilities(work) {
      const ledger = work === "ledger";
      return {
        skill: {
          identity: proposalSchemaIdentity,
          objective: ledger ? "Record source disposition." : "Set the public display name.",
          phase: ledger ? "ledger" : "identity",
          legalCapabilityRoles: ["query-context", "propose-change"],
          capabilityRequestGuidance: ledger ? "Record disposition only." : "Propose a display name.",
          resourceReminder: "Stay inside the frozen attempt budget.",
          disclosureReminder: ledger
            ? "Preservation capsule is available only for this migration work item."
            : "Do not request whole-candidate or preservation context.",
        },
        allowedSelectors: ledger
          ? ["source-claims", "findings", "preservation-capsule"]
          : ["source-claims", "findings"],
        proposalSchemaIdentity,
        writeClosure: ledger ? ["source-disposition"] : ["identity"],
      };
    },
    decodeProposal(_work, value) {
      const parsed = proposalSchema.safeParse(value);
      return parsed.success ? { accepted: true, value: parsed.data } : { accepted: false };
    },
    stageProposal(input) {
      const payload = input.proposal.payload;
      if (payload.kind === "record_disposition") {
        const obligations = new Map(input.obligations);
        obligations.set("source-disposition", "resolved");
        return { accepted: true, candidate: input.candidate, obligations, findings: input.findings };
      }
      if (payload.kind !== "set_display_name") {
        return { accepted: false, findingKey: "unknown-op", finding: "unknown operation" };
      }
      const candidate = config.withDisplayName(input.candidate, payload.value);
      const obligations = new Map(input.obligations);
      if (config.displayName(candidate) !== PLACEHOLDER) {
        obligations.set("identity", "resolved");
      }
      return { accepted: true, candidate, obligations, findings: input.findings };
    },
    reconcileAffected(input) {
      return { findings: input.findings };
    },
    observeProgress(input) {
      const resolved = [...input.obligations.values()].filter((value) => value === "resolved").length;
      const digest = createHash("sha256").update(config.displayName(input.candidate)).digest("hex");
      const observation: AdapterProgressObservationV1 = {
        phase: input.phase,
        resolvedRequiredObligationCount: resolved,
        coveredMaterialClaimCount: resolved,
        unresolvedMaterialFindingKeys: [...input.findings.keys()],
        relevantStateDigest: digest,
        activeSemanticClusterKey: input.phase,
        materialProgress: Boolean(input.previous) && digest !== input.previous?.relevantStateDigest,
      };
      return observation;
    },
    assessQuestion(input) {
      if (!input.findings.has("protected")) {
        return { ask: false };
      }
      return {
        ask: true,
        question: "Which protected name is intended?",
        evidence: {
          explicitProblemClaimIds: ["identity"],
          materialProtectedImpactClaimIds: ["identity"],
          materiallyDifferentOutcomeClaimIds: ["identity"],
          exhaustedRecoveryFindingKeys: ["protected"],
          unsafeAutomaticResolutionClaimIds: ["identity"],
        },
      };
    },
    applyAnswer() {
      return { questionId: "question-1", affectedClaimIds: [] };
    },
    finalize(input) {
      if (input.findings.has("protected")) {
        return { accepted: false, findings: input.findings };
      }
      const parsed = config.parse(input.candidate);
      const compiled = parsed ? config.compile(parsed) : null;
      if (!parsed || !compiled || config.displayName(parsed) === PLACEHOLDER) {
        const findings = new Map(input.findings);
        findings.set("incomplete", "display name remains unresolved");
        return { accepted: false, findings };
      }
      return {
        accepted: true,
        finalCandidate: parsed,
        finalCandidateDigest: createHash("sha256").update(config.displayName(parsed)).digest("hex"),
        obligationCoverage: {
          resolvedRequiredObligationCount: 1,
          requiredObligationCount: 1,
        },
        reconciliationReceiptIdentity: `${config.identity}-reconciliation`,
        compilerReceiptIdentity: compiled.compilerIdentity,
        disclosureReceiptIdentity: compiled.disclosureIdentity,
      };
    },
  };
}
