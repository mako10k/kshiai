/** R: Drive current focused authoring through validated deterministic provider replies in local tests. */
import { z } from "zod";
import { CharacterDefinitionV3Schema, type CharacterProposalPayloadV1 } from "@kshiai/shared";
import { createCharacterSemanticAuthoringAdapterV3 } from "../services/semantic-authoring/adapters/character-v3.js";
import { createSemanticAuthoringHttpProviderV1 } from "../llm/semantic-authoring-provider.js";
import { MockLlmProvider } from "../llm/mock.js";
import { FocusedCharacterProfileGenerationV1Schema, FocusedCharacterProfileClaimsV1Schema }
  from "../services/semantic-authoring/adapters/character-profile-work.js";
const scaffold = createCharacterSemanticAuthoringAdapterV3().buildBaseline(
  { kind: "create", naturalText: "fixture" }, "create").candidate;
const complete = CharacterDefinitionV3Schema.parse({
  ...scaffold, identity: { ...scaffold.identity, displayName: "灯" },
  psycheDisposition: { ...scaffold.psycheDisposition, coreNeeds: [{ id: "protect",
    description: { text: "守る", consumerTags: [], sourceSupportRefs: [] }, selfAwareness: "aware" }] },
  capabilities: { ...scaffold.capabilities, basicAction: { ...scaffold.capabilities.basicAction, name: "構え" } },
  relationshipSeeds: [{ id: "rival", target: { kind: "role", role: "rival" }, relationKinds: ["rival"],
    historySummary: null, defaultAddress: null, selfAwareness: "aware",
    dynamics: { trust: 0, affiliation: 0, fear: 0, competition: 0 }, priority: 50 }],
  speechPolicy: { ...scaffold.speechPolicy, register: "丁寧" },
  appearance: { ...scaffold.appearance, publicSummary: "赤い外套" },
  actionNorms: [{ id: "prefer-basic", when: { match: "all", clauses: [{ kind: "always", operator: "is", value: "true" }] },
    response: { disposition: "prefer", actionRefs: [scaffold.capabilities.basicAction.id], actionKinds: [], tacticTags: [] },
    priority: 50, force: "preference", exceptions: [], description: null }],
});
const migrationGuidance = {
  id: "prefer-basic-guidance",
  applicability: complete.actionNorms[0]!.when,
  statement: "大切な火を守る",
  priority: 50,
  force: "preference" as const,
  selfAwareness: "aware" as const,
  exceptions: [],
  description: null,
};

const contextSchema = z.object({
  mode: z.string(), source: z.record(z.unknown()),
  work: z.object({ kind: z.string(), cluster: z.string().optional() }),
  findings: z.array(z.tuple([z.string(), z.unknown()])),
  obligations: z.array(z.object({ obligationId: z.string() })),
  proposal: z.object({ runId: z.string(), workItemId: z.string(), baseCandidateRevision: z.number(),
    capabilitySessionId: z.string(), proposalSchemaIdentity: z.string() }),
});
type Context = z.infer<typeof contextSchema>;
const profileContextSchema = z.object({
  work: z.object({ kind: z.enum(["profile_generation", "profile_claim_validation"]), workItemId: z.string() }),
  publicInput: z.record(z.unknown()), proposal: contextSchema.shape.proposal,
  obligationId: z.enum(["profile_generation", "profile_claim_validation"]),
});
type ProfilePayload = { kind: "generate_profile"; value: z.infer<typeof FocusedCharacterProfileGenerationV1Schema> }
  | { kind: "validate_profile_claims"; value: z.infer<typeof FocusedCharacterProfileClaimsV1Schema> };
function payload(context: Context): CharacterProposalPayloadV1 {
  if (context.work.kind === "skeleton") {
    const { mechanics: _mechanics, ...action } = complete.capabilities.basicAction;
    const ids = context.obligations.map((o) => o.obligationId);
    return { kind: "set_skeleton", operations: [
      ...(ids.includes("identity") ? [{ op: "replace_identity" as const, value: complete.identity }] : []),
      ...(ids.includes("psycheDisposition:coreNeeds") ? [{ op: "upsert_core_need" as const, value: complete.psycheDisposition.coreNeeds[0]! }] : []),
      ...(ids.some((id) => id.startsWith("capabilities:actions:")) ? [{ op: "set_action_semantics" as const, value: action }] : []),
      ...(ids.includes("relationshipSeeds") ? [{ op: "upsert_relationship_seed" as const, value: complete.relationshipSeeds[0]! }] : []),
    ] };
  }
  if (context.work.kind === "cluster") {
    if (context.work.cluster === "mechanics") return { kind: "complete_cluster", cluster: "mechanics",
      operations: context.mode === "migrate"
        ? JSON.stringify(context.source).includes('"actionNorms":[]')
          ? [{ op: "upsert_action_norm", value: complete.actionNorms[0]! }]
          : [{ op: "upsert_conscious_guidance", value: migrationGuidance }]
        : [{ op: "upsert_action_norm", value: complete.actionNorms[0]! }] };
    if (context.work.cluster === "relationship-expression") return {
      kind: "complete_cluster", cluster: "relationship-expression",
      operations: [{ op: "replace_speech_policy", value: complete.speechPolicy }],
    };
    return { kind: "complete_cluster", cluster: "appearance",
      operations: [{ op: "set_appearance_summary", value: "青い外套" }] };
  }
  const unresolved = context.obligations[0]?.obligationId;
  if (unresolved?.startsWith("source:")) return { kind: "classify_source_disposition",
    decisions: [{ sourceClaimId: unresolved.slice("source:".length), disposition: "transform",
      targetClaimIds: unresolved.endsWith(":legacyMeaning")
        ? [`consciousGuidance:${migrationGuidance.id}`] : [unresolved.slice("source:".length)],
      rationale: "Fixture records the exact transformed target; legacy meaning is represented as conscious guidance." }] };
  if (unresolved === "source-disposition") return { kind: "classify_source_disposition",
    decisions: [{ sourceClaimId: "identity.displayName", disposition: "preserve",
      targetClaimIds: ["identity"], rationale: "Fixture preserves identity." }] };
  const lens = unresolved === "lens:compiler" ? "compiler"
    : unresolved === "lens:disclosure" ? "disclosure" : "cross-reference";
  return { kind: "submit_lens_review", lens, findingIds: [unresolved ?? "identity"], verdict: "pass" };
}


export function createOfflineFocusedAuthoringProvider(options: {
  failAt?: "first" | "after_skeleton";
  beforeReply?: () => Promise<void>;
} = {}) {
  let calls = 0;
  const work: Array<{ kind: string; cluster?: string; obligationIds: string[] }> = [];
  const fetcher: typeof fetch = async (_url, init) => {
    if (typeof init?.body !== "string") throw new Error("FOCUSED_FIXTURE_BODY_REQUIRED");
    const body = z.object({ model: z.string(), messages: z.array(z.object({ content: z.string() })) })
      .parse(JSON.parse(init.body));
    const value: unknown = JSON.parse(body.messages[1]!.content);
    const scope = z.object({ request: z.string() }).strict().safeParse(value);
    if (scope.success) {
      calls += 1;
      work.push({ kind: "scope", obligationIds: [] });
      await options.beforeReply?.();
      if (options.failAt) return new Response("controlled scope failure", { status: 503 });
      return Response.json({ model: body.model, choices: [{ finish_reason: "stop", message: {
        content: JSON.stringify({ result: { kind: "resolved", clusters: ["mechanics"],
          evidence: [{ sourceQuote: scope.data.request, clusters: ["mechanics"] }] } }),
      } }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
    }
    const profileContext = profileContextSchema.safeParse(value);
    const context = profileContext.success ? contextSchema.parse({
      mode: "profile", source: {}, work: profileContext.data.work, findings: [],
      obligations: [{ obligationId: profileContext.data.obligationId }], proposal: profileContext.data.proposal,
    }) : contextSchema.parse(value);
    work.push({ ...context.work, obligationIds: context.obligations.map((o) => o.obligationId) });
    calls += 1;
    await options.beforeReply?.();
    if (options.failAt === "first" || (options.failAt === "after_skeleton" && calls > 1)) {
      return new Response("controlled provider failure", { status: 503 });
    }
    let proposalPayload: CharacterProposalPayloadV1 | ProfilePayload;
    if (profileContext.success && profileContext.data.work.kind === "profile_generation") {
      const publicInput = z.object({ displayName: z.string() }).parse(profileContext.data.publicInput);
      proposalPayload = { kind: "generate_profile", value: { description: publicInput.displayName,
        assistantMessage: "候補を作成しました。", segments: [{ id: "name", text: publicInput.displayName,
          kind: "fact", supportRefs: ["identity.displayName"] }] } };
    } else if (profileContext.success) {
      proposalPayload = { kind: "validate_profile_claims", value: { segments: [{
        segmentId: "name", verdict: "supported", supportRefs: ["identity.displayName"], riskCodes: [],
      }] } };
    } else proposalPayload = payload(context);
    const disposition = proposalPayload.kind === "classify_source_disposition"
      ? proposalPayload.decisions[0] : null;
    const speechTransform = context.mode === "migrate" && proposalPayload.kind === "complete_cluster"
      && proposalPayload.operations.some((operation) => operation.op === "replace_speech_policy");
    const sourceClaimIds = disposition ? [disposition.sourceClaimId]
      : speechTransform ? ["speechPolicy"] : ["source-instruction"];
    const provenance = disposition && disposition.targetClaimIds.length > 0
      ? disposition.targetClaimIds.map((targetClaimId) => ({ targetClaimId,
        sourceClaimIds: [disposition.sourceClaimId], method: "derived" as const }))
      : speechTransform ? [{ targetClaimId: "speechPolicy", sourceClaimIds: ["speechPolicy"], method: "derived" as const }]
      : [{ targetClaimId: "identity", sourceClaimIds, method: "generated" as const }];
    const content = JSON.stringify({ ...context.proposal, proposalId: `offline-proposal-${calls}`,
      sourceClaimIds, affectedObligationIds: context.obligations.map((o) => o.obligationId),
      declaredSemanticDependantIds: [], provenance,
      ownerExplanation: "Deterministic internal fixture; no model-quality claim.", uncertainty: [], payload: proposalPayload });
    return Response.json({ model: body.model,
      choices: [{ finish_reason: "stop", message: { content } }],
      usage: { prompt_tokens: 700, completion_tokens: 350 } });
  };
  const workerPolicy = { identity: "offline-focused-worker-v1", platformIdentity: "offline-node-test-v1", leaseDurationMs: 60_000 };
  const transport = createSemanticAuthoringHttpProviderV1({
    endpoint: "http://127.0.0.1:1/offline-only", model: "offline-focused", apiKey: "local-test-only",
    pricingIdentity: "offline-focused-prices-v1", inputMicroUsdPerToken: 1, outputMicroUsdPerToken: 2,
    transportPolicy: { identity: "offline-focused-transport-v1", routeIdentity: "offline-test-only",
      timeoutMs: 60_000, maxRecoveriesPerWorkItem: 0 }, workerPolicy,
  }, fetcher);
  const preparedBounds: Array<{ inputTokens: number; inputBytes: number; outputTokens: number }> = [];
  const measuredTransport: typeof transport = { ...transport, prepare(request, requestId, policy) {
    const prepared = transport.prepare(request, requestId, policy);
    preparedBounds.push({ inputTokens: prepared.reservation.inputTokens,
      inputBytes: prepared.reservation.inputBytes, outputTokens: prepared.reservation.outputTokens });
    return prepared;
  } };
  class NoLegacyAuthoring extends MockLlmProvider {
    override async generateCharacter(): Promise<never> { throw new Error("LEGACY_AUTHORING_CALLED"); }
    override async generateCharacterDefinitionV2(): Promise<never> { throw new Error("LEGACY_AUTHORING_CALLED"); }
    override async generateCharacterProfile(): Promise<never> { throw new Error("LEGACY_AUTHORING_CALLED"); }
  }
  return Object.assign(new NoLegacyAuthoring(), { semanticAuthoringProvider: measuredTransport,
    semanticAuthoringWorkerPolicy: workerPolicy, focusedFixtureCalls: () => calls,
    focusedFixtureWork: () => [...work], focusedFixtureBounds: () => [...preparedBounds] });
}
