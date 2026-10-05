// R: Verify exact-prompt billing proofs reject mismatched or unverified provider guarantees.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AwarenessDefaultPolicy, AwarenessObservedPolicy, AwarenessLatentInputSchema, CharacterSelfProfileAnchorSchema } from "@kshiai/shared";
import { requestDigest } from "../services/distributed-guard.js";
import { createAwarenessExecutionAdmission, verifyAwarenessDispatchQuote, type AwarenessPricedRequest, type AwarenessProviderQuote, type AwarenessVerifiedBillingContract } from "./awareness-dispatch-admission.js";

function perception() {
  return {
    schemaVersion: 1, observer: { side: "a", self: "self" }, turn: 1, revision: 1,
    self: { subject: { kind: "self" }, currentAccess: "clear", identityKnowledge: "identified", perceivedAs: "自分", percepts: [] },
    counterpart: { subject: { kind: "counterpart" }, currentAccess: "none", identityKnowledge: "unknown", perceivedAs: "見えない", percepts: [] },
    others: [], qualitativeChanges: [], reserveCues: [],
    latestDiff: { fromRevision: 0, toRevision: 1, addedOrUpdatedPerceptIds: [], removedPerceptIds: [] },
  };
}
const context = {
  character: CharacterSelfProfileAnchorSchema.parse({ schemaVersion: 1, displayName: "A", identity: {}, tags: [], appearanceSummary: "人物", traits: ["慎重"], narrativeBlurb: "", basicAction: { name: "身構える", description: "姿勢を整える" }, skills: [], equipment: { weapon: null, armor: null } }),
  characteristics: ["慎重"], training: [], facts: [], availableActions: [],
};
const latentInput = () => AwarenessLatentInputSchema.parse({
  ...context, side: "a", tick: 1, perception: perception(),
  currentState: { updatedTick: 0, sensations: [], emotions: [{ id: "emotion", feeling: "隠れた原因の内部記述", awareness: 0.1 }], tendencies: [], feltProjection: "なんだか落ち着かない" },
  stimuli: [{ id: "light", content: "まぶしい" }], influences: [{ id: "calm", content: "少し落ち着こう" }],
});
const request = (): AwarenessPricedRequest => ({ provider: "openai", model: "gpt-6-luna", system: "反射と感情を分ける", user: "まぶしい", options: { tier: "fast", timeoutMs: 5000, maxCompletionTokens: 600, label: "test", responseFormat: { type: "json_object" } } });
const quote = (input: AwarenessPricedRequest): AwarenessProviderQuote => ({
  provider: input.provider, model: input.model, requestDigest: requestDigest(input), fullMessageTokens: 100,
  outputTokenLimit: input.options.maxCompletionTokens, maximumChargeUsd: 0.001,
  verifiedFullPrompt: true, includesAllGeneratedTokens: true,
});
function contract(change: (value: AwarenessProviderQuote) => AwarenessProviderQuote = (value) => value): AwarenessVerifiedBillingContract {
  return { provider: "openai", model: "gpt-6-luna", async quote(input) { return change(quote(input)); } };
}

describe("awareness exact dispatch admission", () => {
  it("binds full rendered prompts, model identity, and generation cap to a verified quote", async () => {
    const input = request();
    const proof = await verifyAwarenessDispatchQuote(input, contract(), AwarenessDefaultPolicy.roles.subconscious);
    assert.deepEqual(proof, { requestDigest: requestDigest(input), verifiedFullPrompt: true, inputTokens: 100, outputTokenLimit: 600, maximumChargeUsd: 0.001 });
  });
  it("rejects missing contracts and cross-model quotes", async () => {
    assert.equal(await verifyAwarenessDispatchQuote(request(), undefined, AwarenessDefaultPolicy.roles.subconscious), null);
    assert.equal(await verifyAwarenessDispatchQuote(request(), contract((value) => ({ ...value, model: "other-model" })), AwarenessDefaultPolicy.roles.subconscious), null);
  });
  it("rejects mismatched hashes, caps, incomplete framing, and malformed cost", async () => {
    const changes: Array<(value: AwarenessProviderQuote) => AwarenessProviderQuote> = [
      (value) => ({ ...value, requestDigest: "wrong" }),
      (value) => ({ ...value, outputTokenLimit: 601 }),
      (value) => ({ ...value, verifiedFullPrompt: false }),
      (value) => ({ ...value, includesAllGeneratedTokens: false }),
      (value) => ({ ...value, fullMessageTokens: 1801 }),
      (value) => ({ ...value, fullMessageTokens: 0 }),
      (value) => ({ ...value, fullMessageTokens: 1.5 }),
      (value) => ({ ...value, maximumChargeUsd: NaN }),
      (value) => ({ ...value, maximumChargeUsd: 0.51 }),
    ];
    for (const change of changes) assert.equal(await verifyAwarenessDispatchQuote(request(), contract(change), AwarenessDefaultPolicy.roles.subconscious), null);
    const invalidCap = request();
    invalidCap.options.maxCompletionTokens = 0;
    assert.equal(await verifyAwarenessDispatchQuote(invalidCap, contract(), AwarenessDefaultPolicy.roles.subconscious), null);
  });
  it("fails closed on quote service error and does not mutate the original request", async () => {
    const input = request();
    const service: AwarenessVerifiedBillingContract = { provider: input.provider, model: input.model, async quote(received) { received.user = "mutated"; throw new Error("unavailable"); } };
    assert.equal(await verifyAwarenessDispatchQuote(input, service, AwarenessDefaultPolicy.roles.subconscious), null);
    assert.equal(input.user, "まぶしい");
  });
  it("leaves roles inadmissible without an unambiguous configured billing contract", async () => {
    const identity = { provider: "openai", engineModel: "gpt-6-luna", fastModel: "gpt-6-luna" };
    const admission = createAwarenessExecutionAdmission({ latent: identity, conscious: { provider: "xai", engineModel: "grok-4.5", fastModel: "grok-4.3" }, contracts: [] });
    assert.equal(await admission.verify({ role: "subconscious", input: latentInput() }), null);
    const admitted = createAwarenessExecutionAdmission({ latent: identity, conscious: { provider: "xai", engineModel: "grok-4.5", fastModel: "grok-4.3" }, contracts: [contract()] });
    assert.ok(await admitted.verify({ role: "subconscious", input: latentInput() }));
    const duplicate = createAwarenessExecutionAdmission({ latent: identity, conscious: { provider: "xai", engineModel: "grok-4.5", fastModel: "grok-4.3" }, contracts: [contract(), contract()] });
    assert.equal(await duplicate.verify({ role: "subconscious", input: latentInput() }), null);
  });
});

describe("explicit observed dispatch admission", () => {
  it("selects observed admission only through the immutable policy without contacting quote services", async () => {
    const identity = { provider: "openai", engineModel: "gpt-6-luna", fastModel: "gpt-6-luna" };
    let quotes = 0;
    const billing: AwarenessVerifiedBillingContract = { provider: "openai", model: "gpt-6-luna", async quote(input) { quotes += 1; return quote(input); } };
    const admission = createAwarenessExecutionAdmission({ latent: identity, conscious: { provider: "xai", engineModel: "grok-4.5", fastModel: "grok-4.3" }, contracts: [billing], policy: AwarenessObservedPolicy });
    const proof = await admission.verify({ role: "subconscious", input: latentInput() });
    assert.equal(proof?.mode, "observed");
    assert.equal(proof?.maximumChargeUsd, null);
    assert.equal(quotes, 0);
  });
  it("hashes the latest actual request for every recorded prompt identity", async () => {
    const { prepareAwarenessRequest } = await import("./awareness-request.js");
    const input = latentInput();
    const latent = { provider: "openai", engineModel: "gpt-6-luna", fastModel: "gpt-6-luna" };
    const conscious = { provider: "xai", engineModel: "grok-engine", fastModel: "grok-fast" };
    const hashes: string[] = [];
    for (const promptRevision of ["awareness-prompt-v1", "awareness-prompt-v2", "awareness-prompt-v3"]) {
      const admission = createAwarenessExecutionAdmission({ latent, conscious, contracts: [], policy: AwarenessObservedPolicy, promptRevision });
      const proof = await admission.verify({ role: "subconscious", input });
      assert.ok(proof);
      assert.equal(proof.requestDigest, requestDigest({ provider: latent.provider, model: latent.fastModel,
        ...prepareAwarenessRequest({ role: "subconscious", input }, AwarenessObservedPolicy, promptRevision) }));
      hashes.push(proof.requestDigest);
    }
    assert.equal(hashes[0], hashes[1]);
    assert.equal(hashes[1], hashes[2]);
    const unknown = createAwarenessExecutionAdmission({ latent, conscious, contracts: [], policy: AwarenessObservedPolicy, promptRevision: "unknown" });
    await assert.rejects(unknown.verify({ role: "subconscious", input }), /REVISION_UNSUPPORTED/);
  });
  it("does not invent token or cost values and still enforces output and time limits", async () => {
    const { prepareObservedAwarenessDispatch } = await import("./awareness-dispatch-admission.js");
    const request: AwarenessPricedRequest = { provider:"openai",model:"gpt-6-luna",system:"短い反応",user:"まぶしい。",
      options:{tier:"fast",timeoutMs:5000,maxCompletionTokens:600,label:"observed",responseFormat:{type:"json_object"}} };
    const limits=AwarenessDefaultPolicy.roles.subconscious;
    assert.deepEqual(prepareObservedAwarenessDispatch(request,limits),{mode:"observed",verifiedFullPrompt:false,
      inputTokens:null,maximumChargeUsd:null,outputTokenLimit:600,requestDigest:requestDigest(request)});
    assert.equal(prepareObservedAwarenessDispatch({...request,options:{...request.options,maxCompletionTokens:601}},limits),null);
    assert.equal(prepareObservedAwarenessDispatch({...request,options:{...request.options,timeoutMs:5001}},limits),null);
    assert.equal(prepareObservedAwarenessDispatch({...request,options:{...request.options,timeoutMs:0}},limits),null);
  });
});
