// R: Verify delayed conscious merge, immutable generation fences and once-only influences.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultCharacterIdentity } from "./character.js";
import { AwarenessLatentInputSchema, type AwarenessConsciousInput, type AwarenessConsciousOutput, type AwarenessDesire } from "./awareness-pipeline.js";
import { AwarenessAcceptLatent, AwarenessApplyConsciousReady, AwarenessAvailableInfluences, AwarenessCancelGeneration, AwarenessConsumeMailbox, AwarenessExpireDesires, AwarenessInitialCharacterState, AwarenessMarkConsciousReady, AwarenessSelectDesires, AwarenessStartConsciousJob } from "./awareness-state.js";

function snapshot(): AwarenessConsciousInput {
  return { side: "a", sourceTick: 1,
    character: { schemaVersion: 1, displayName: "A", identity: defaultCharacterIdentity(), tags: [], appearanceSummary: "", traits: [], narrativeBlurb: "", basicAction: { name: "防御", description: "構える" }, skills: [], equipment: { weapon: null, armor: null } },
    characteristics: [], training: [], availableActions: [{ kind: "defend", name: "防御", target: { kind: "self", perceivedAs: "自分" } }], facts: [],
    perception: { schemaVersion: 1, observer: { side: "a", self: "self" }, turn: 1, revision: 1,
      self: { subject: { kind: "self" }, currentAccess: "clear", identityKnowledge: "identified", perceivedAs: "自分", percepts: [] },
      counterpart: { subject: { kind: "counterpart" }, currentAccess: "none", identityKnowledge: "unknown", perceivedAs: "見えない", percepts: [] },
      others: [], qualitativeChanges: [], reserveCues: [], latestDiff: { fromRevision: 0, toRevision: 1, addedOrUpdatedPerceptIds: [], removedPerceptIds: [] } },
    feltProjection: "落ち着かない", consciousState: { goal: null, thought: "", updatedTick: null } };
}
function voice(id: string, strength: number, source: AwarenessDesire["source"] = "reflex"): AwarenessDesire {
  return { id, source, strength, startTick: 1, validUntilTick: 4, resource: "voice", speech: id };
}
function output(): AwarenessConsciousOutput {
  return { goal: "距離を取る", thought: "まず様子を見る", desires: [voice("conscious-voice", 0.5, "conscious")], influences: [{ id: "calm", content: "ゆっくり息をしたい" }] };
}
function running() {
  return AwarenessStartConsciousJob(AwarenessInitialCharacterState(), { id: "job-1", startedAt: 1000, deadlineAt: 16000, snapshot: snapshot() });
}
describe("awareness-v5 pure state transitions", () => {
  it("accepts current observer-safe latent input and rejects history or the other observer", () => {
    const { sourceTick, feltProjection, consciousState, ...context } = snapshot();
    const input = { ...context, tick: sourceTick, currentState: AwarenessInitialCharacterState().latent, influences: [], stimuli: [] };
    assert.equal(AwarenessLatentInputSchema.safeParse(input).success, true);
    assert.equal(AwarenessLatentInputSchema.safeParse({ ...input, utteranceHistory: [] }).success, false);
    assert.equal(AwarenessLatentInputSchema.safeParse({ ...input, side: "b" }).success, false);
  });
  it("uses strength without source precedence, then accepted identity, then lexical id", () => {
    assert.equal(AwarenessSelectDesires([voice("reflex", 0.2), voice("thought", 0.8, "conscious")], 2).voice?.id, "thought");
    assert.equal(AwarenessSelectDesires([voice("a", 0.8), voice("z", 0.8)], 2, ["z"]).voice?.id, "z");
    assert.equal(AwarenessSelectDesires([voice("z", 0.8), voice("a", 0.8)], 2).voice?.id, "a");
    assert.equal(AwarenessSelectDesires([voice("a", 1)], 4).voice, null);
    const state = { ...AwarenessInitialCharacterState(), desires: [voice("a", 1)], acceptedDesireIds: ["a"] };
    assert.deepEqual(AwarenessExpireDesires(state, 4).acceptedDesireIds, []);
  });
  it("freezes source snapshot and accepts genuine late completion after three continuing ticks", () => {
    const input = snapshot();
    const state = AwarenessStartConsciousJob(AwarenessInitialCharacterState(), { id: "job-1", startedAt: 1000, deadlineAt: 16000, snapshot: input });
    input.feltProjection = "mutated-current-state";
    assert.equal(state.job?.input.feltProjection, "落ち着かない");
    const ready = AwarenessMarkConsciousReady(state, { jobId: "job-1", generation: 1, fence: 0, completedAt: 4000, output: output() });
    const merged = AwarenessApplyConsciousReady(ready, 4);
    assert.equal(merged.conscious.updatedTick, 4);
    assert.equal(merged.desires[0].startTick, 4);
    assert.equal(merged.desires[0].validUntilTick, 7);
    assert.equal(AwarenessApplyConsciousReady(merged, 5), merged);
    assert.equal(AwarenessAvailableInfluences(merged, 4).length, 0);
    assert.equal(AwarenessAvailableInfluences(merged, 5).length, 1);
    const consumed = AwarenessConsumeMailbox(merged, ["job-1:calm"], 5);
    assert.equal(AwarenessAvailableInfluences(consumed, 6).length, 0);
    assert.throws(() => AwarenessConsumeMailbox(consumed, ["job-1:calm"], 6), /NOT_AVAILABLE/);
  });
  it("logical cancellation retains physical slot and rejects old generation merge", () => {
    const cancelled = AwarenessCancelGeneration(running());
    assert.equal(cancelled.job?.physicalStatus, "outstanding");
    assert.throws(() => AwarenessStartConsciousJob(cancelled, { id: "job-2", startedAt: 2000, deadlineAt: 17000, snapshot: snapshot() }), /SLOT_OCCUPIED/);
    const completed = AwarenessMarkConsciousReady(cancelled, { jobId: "job-1", generation: 1, fence: 0, completedAt: 3000, output: output() });
    assert.equal(completed.job?.physicalStatus, "finished");
    assert.equal(AwarenessApplyConsciousReady(completed, 4), completed);
    assert.equal(AwarenessStartConsciousJob(completed, { id: "job-2", startedAt: 4000, deadlineAt: 19000, snapshot: snapshot() }).job?.generation, 3);
  });
  it("does not accept deadline or mismatched fence results", () => {
    const state = running();
    assert.equal(AwarenessMarkConsciousReady(state, { jobId: "job-1", generation: 1, fence: 1, completedAt: 2000, output: output() }), state);
    assert.equal(AwarenessMarkConsciousReady(state, { jobId: "job-1", generation: 1, fence: 0, completedAt: 16000, output: output() }).job?.status, "expired");
    assert.throws(() => AwarenessStartConsciousJob(AwarenessInitialCharacterState(), { id: "bad", startedAt: 1000, deadlineAt: 999, snapshot: snapshot() }), /Deadline/);
  });
  it("rejects stale latent updates and immutable desire id reuse", () => {
    const state = AwarenessInitialCharacterState();
    const result = { state: { ...state.latent, updatedTick: 1 }, reflexDesires: [voice("r", 0.5)], affectiveDesires: [], reconsider: false, cancelThought: false };
    const updated = AwarenessAcceptLatent(state, result, 1);
    assert.throws(() => AwarenessAcceptLatent(updated, result, 2), /TICK_MISMATCH/);
    assert.throws(() => AwarenessAcceptLatent(updated, result, 1), /TICK_MISMATCH/);
    const later = { ...result, state: { ...result.state, updatedTick: 5 }, reflexDesires: [{ ...voice("r", 0.5), startTick: 5, validUntilTick: 6 }] };
    assert.throws(() => AwarenessAcceptLatent(AwarenessExpireDesires(updated, 5), later, 5), /ID_REUSED/);
  });
});
