// R: Verify parallel barriers, durable no-resend and fenced acceptance without paid providers.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AwarenessNormalPolicy, BattleAssetManifestV6Schema, BattleStateSchema, UnifiedConsciousnessPolicyV1,
  initializeUnifiedConsciousness, applyUnifiedConsciousnessBoundary, defaultCharacterIdentity,
  type UnifiedConsciousnessRuntime, type UnifiedConsciousnessInput } from "@kshiai/shared";
import type { AwarenessJsonTransport } from "../llm/awareness-provider-contract.js";
import { validAwarenessBattleFixture } from "./awareness-test-fixture.js";

const directory = mkdtempSync(join(tmpdir(), "kshiai-unified-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.AUTH_PROVIDER = "legacy";
const { getDb, withTransaction } = await import("../db.js");
const { config } = await import("../config.js");
assert.equal(config.databasePath, join(directory, "test.db"));
const { prepareUnifiedBoundary } = await import("./unified-consciousness-execution.js");
const { prepareUnifiedConsciousnessRequest } = await import("../llm/unified-consciousness.js");
const repo = await import("../repositories/unified-consciousness.js");
const battles = await import("../repositories/battles.js");
const { commitUnifiedWorld } = await import("./unified-consciousness-world.js");
const { unifiedPerceptionDigest } = await import("./unified-consciousness-battle.js");
after(() => { getDb().close(); rmSync(directory, { recursive: true, force: true }); });
const now = Date.now();
function frame(side: "a" | "b"): UnifiedConsciousnessInput {
  return { side, tick: 0, character: { schemaVersion: 1, displayName: side, identity: defaultCharacterIdentity(), tags: [],
    appearanceSummary: "", traits: [], narrativeBlurb: "", basicAction: { name: "待機", description: "待つ" }, skills: [], equipment: { weapon: null, armor: null } },
    characteristics: [], memory: [], events: [], availableActions: [{ kind: "wait", name: "待機", target: { kind: "self", perceivedAs: "自分" } }], facts: [], ongoingAction: null,
    perception: { schemaVersion: 1, observer: { side, self: "self" }, turn: 0, revision: 0,
      self: { subject: { kind: "self" }, currentAccess: "clear", identityKnowledge: "identified", perceivedAs: "自分", percepts: [] },
      counterpart: { subject: { kind: "counterpart" }, currentAccess: "none", identityKnowledge: "unknown", perceivedAs: "不明", percepts: [] },
      others: [], qualitativeChanges: [], reserveCues: [], latestDiff: { fromRevision: 0, toRevision: 0, addedOrUpdatedPerceptIds: [], removedPerceptIds: [] } } };
}
function fixture() {
  let runtime = initializeUnifiedConsciousness(UnifiedConsciousnessPolicyV1, now);
  let fence = true;
  const port = { async read() { return structuredClone(runtime); }, async update(reduce: (value: UnifiedConsciousnessRuntime) => UnifiedConsciousnessRuntime) {
    if (!fence) throw new Error("CONSCIOUSNESS_REVISION_OR_LEASE_CONFLICT"); runtime = reduce(runtime);
  }, async account(reduce: (value: UnifiedConsciousnessRuntime) => UnifiedConsciousnessRuntime) { runtime = reduce(runtime); } };
  return { port, get runtime() { return runtime; }, loseFence() { fence = false; } };
}
function transport(send: AwarenessJsonTransport["requestJson"]): AwarenessJsonTransport {
  return { identity: { provider: "openai", engineModel: "gpt-6-luna", fastModel: "gpt-6-luna" }, requestJson: send };
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => { resolve = done; });
  return { promise, resolve };
}
const frames = { a: frame("a"), b: frame("b") };
async function drain() { for (let index = 0; index < 20; index += 1) await new Promise<void>((done) => setImmediate(done)); }

describe("unified consciousness v1 execution", () => {
  it("always renders private ranked memory, including an empty list", () => {
    const empty = prepareUnifiedConsciousnessRequest(frames.a, UnifiedConsciousnessPolicyV1);
    assert.match(empty.user, /優先順位付き記憶/);
    const request = prepareUnifiedConsciousnessRequest({ ...frames.a, memory: [{ id: "m", text: "まず観察する" }] }, UnifiedConsciousnessPolicyV1);
    assert.match(request.user, /まず観察する/);
    assert.equal(request.options.maxCompletionTokens, 1000);
    assert.doesNotMatch(request.system, /各意欲は|reflexDesires/);
  });
  it("ignores tick and revision alone in perception activation", () => {
    const perception = frames.a.perception;
    assert.equal(unifiedPerceptionDigest(perception), unifiedPerceptionDigest({ ...perception, turn: 2, revision: 3 }));
    assert.notEqual(unifiedPerceptionDigest(perception), unifiedPerceptionDigest({ ...perception, self: { ...perception.self, perceivedAs: "新しい自己知覚" } }));
  });
  it("dispatches both sides before either resolves, reuses preparation and applies once", async () => {
    const f = fixture(); const pending = [deferred(), deferred()]; let calls = 0;
    const model = transport(async () => { const value = pending[calls++]; assert.ok(value); return value.promise; });
    const input = { battleId: "parallel", tick: 0, worldRevision: 0, port: f.port, frames, transport: model, now: () => now };
    let finished = false;
    const result = prepareUnifiedBoundary(input).then((value) => { finished = true; return value; });
    await drain(); assert.equal(calls, 2);
    pending[0]?.resolve({ speech: "観察しよう", memoryOperations: [{ kind: "insert", priority: 1, text: "観察する" }] });
    await drain(); assert.equal(finished, false); assert.deepEqual(f.runtime.sides.a.memory, []);
    pending[1]?.resolve({});
    assert.equal((await result).selected.a.voice?.speech, "観察しよう");
    await prepareUnifiedBoundary(input); assert.equal(calls, 2);
    const committed = applyUnifiedConsciousnessBoundary(f.runtime, 0);
    assert.equal(committed.sides.a.memory[0]?.text, "観察する");
    assert.throws(() => applyUnifiedConsciousnessBoundary(committed, 0), /ALREADY_APPLIED/);
  });
  it("retains partial prepared evidence and never resends an unknown failed send", async () => {
    const f = fixture(); let calls = 0;
    const model = transport(async () => { if (++calls === 1) return {}; throw new Error("network outcome unknown"); });
    const input = { battleId: "partial", tick: 0, worldRevision: 0, port: f.port, frames, transport: model, now: () => now };
    await assert.rejects(prepareUnifiedBoundary(input), /network/);
    assert.equal(f.runtime.decisions[0]?.status, "prepared");
    assert.equal(f.runtime.decisions[1]?.physicalOutstanding, true);
    assert.deepEqual(f.runtime.sides.a.memory, []);
    await assert.rejects(prepareUnifiedBoundary(input), /NOT_REPLAYABLE/); assert.equal(calls, 2);
  });
  it("accounts late replies after lease loss without accepting their output", async () => {
    const f = fixture(); const pending = deferred();
    const result = prepareUnifiedBoundary({ battleId: "late", tick: 0, worldRevision: 0, port: f.port, frames,
      transport: transport(async () => pending.promise), now: () => now });
    await drain(); f.loseFence(); pending.resolve({ speech: "遅い結果" });
    await assert.rejects(result, /LEASE_CONFLICT/);
    assert.ok(f.runtime.decisions.every((decision) => !decision.physicalOutstanding && decision.output === null && decision.status === "reserved"));
  });
  it("rejects responses received past the decision deadline while retaining accounting", async () => {
    const f = fixture(); const pending = deferred(); let time = now;
    const result = prepareUnifiedBoundary({ battleId: "timeout", tick: 0, worldRevision: 0, port: f.port, frames,
      transport: transport(async () => pending.promise), now: () => time });
    await drain(); time += 60001; pending.resolve({ speech: "遅すぎる発言" });
    await assert.rejects(result, /LATE_RESPONSE/);
    assert.ok(f.runtime.decisions.every((decision) => !decision.physicalOutstanding && decision.output === null));
    assert.deepEqual(f.runtime.sides.a.memory, []);
  });
  it("skips unchanged ticks, retains pending events until commit and runs only the stimulated side", async () => {
    const f = fixture(); let calls = 0;
    const model = transport(async () => { calls += 1; return {}; });
    const input = { battleId: "events", tick: 0, worldRevision: 0, port: f.port, frames, transport: model, now: () => now };
    await prepareUnifiedBoundary(input);
    await f.port.update((runtime) => applyUnifiedConsciousnessBoundary(runtime, 0));
    const quiet = await prepareUnifiedBoundary({ ...input, tick: 1, worldRevision: 1 });
    assert.deepEqual(quiet.selected.a, { body: null, voice: null }); assert.equal(calls, 2);
    await f.port.update((runtime) => applyUnifiedConsciousnessBoundary(runtime, 1));
    await f.port.update((runtime) => ({ ...runtime, sides: { ...runtime.sides, b: { ...runtime.sides.b, pendingEvents: [{ id: "new", text: "声が聞こえた" }] } } }));
    await prepareUnifiedBoundary({ ...input, tick: 2, worldRevision: 2 });
    assert.equal(calls, 3); assert.equal(f.runtime.sides.b.pendingEvents.length, 1);
    await f.port.update((runtime) => applyUnifiedConsciousnessBoundary(runtime, 2));
    assert.deepEqual(f.runtime.sides.b.pendingEvents, []); assert.deepEqual(f.runtime.sides.b.consumedEventIds, ["new"]);
  });
  it("requires every due side and rejects unavailable actions atomically", async () => {
    assert.throws(() => applyUnifiedConsciousnessBoundary(fixture().runtime, 0), /NOT_READY/);
    const f = fixture();
    await assert.rejects(prepareUnifiedBoundary({ battleId: "invalid", tick: 0, worldRevision: 0, port: f.port, frames,
      transport: transport(async () => ({ action: { kind: "basic_attack" } })), now: () => now }), /ACTION_UNKNOWN/);
    assert.deepEqual(f.runtime.sides.a.memory, []);
    assert.ok(f.runtime.decisions.every((decision) => decision.status === "failed" && !decision.physicalOutstanding));
  });
});

async function persisted(id: string) {
  const base = validAwarenessBattleFixture(id).state;
  const manifest = BattleAssetManifestV6Schema.parse({ ...base.assetManifest, schemaVersion: 6,
    consciousOutputContract: "unified-consciousness-v1", outputRevision: "unified-consciousness-output-v1",
    awarenessPolicy: AwarenessNormalPolicy, consciousnessPolicy: UnifiedConsciousnessPolicyV1,
    consciousnessPromptRevision: "unified-consciousness-prompt-v1", rules: { ...base.assetManifest?.rules, psycheReaction: "unified-consciousness-v1" } });
  const state = BattleStateSchema.parse({ ...base, assetManifest: manifest });
  const meta = { sideAUserId: "owner", sideACharacterId: "a", sideBCharacterId: "b", expectedRevision: 0 };
  await battles.insertNewBattle(state, meta);
  getDb().prepare("INSERT INTO battle_leases(battle_id,owner_id,fencing_token,acquired_at,expires_at) VALUES (?, 'owner', 1, ?, ?)")
    .run(id, new Date(now).toISOString(), new Date(now + 180000).toISOString());
  const fence = { battleId: id, ownerId: "owner", fencingToken: 1 };
  await withTransaction((connection) => repo.insertUnifiedRuntime(connection, id, initializeUnifiedConsciousness(UnifiedConsciousnessPolicyV1, now), new Date(now).toISOString()));
  await prepareUnifiedBoundary({ battleId: id, tick: 0, worldRevision: 0, frames, now: () => now,
    transport: transport(async () => ({ memoryOperations: [{ kind: "insert", priority: 1, text: "秘密の意図" }] })), port: {
      async read() { const saved = await repo.getUnifiedRuntime(id); assert.ok(saved); return saved.runtime; },
      async update(reduce) { await repo.mutateUnifiedRuntime(id, fence, reduce); },
      async account(reduce) { await repo.mutateUnifiedRuntime(id, undefined, reduce); },
    } });
  return { state, meta, fence, tick: 0, now: () => now + 1000 };
}
describe("unified consciousness v1 world transaction", () => {
  it("commits memory with canonical revision and keeps private state out of saved world", async () => {
    const f = await persisted("unified-world");
    await commitUnifiedWorld({ ...f, state: { ...f.state, battleRevision: 1 } });
    assert.equal((await repo.getUnifiedRuntime(f.state.id))?.runtime.sides.a.memory[0]?.text, "秘密の意図");
    assert.equal((await battles.getBattle(f.state.id))?.battleRevision, 1);
    assert.doesNotMatch(JSON.stringify(await battles.getBattle(f.state.id)), /秘密の意図|memoryOperations|inputDigest/);
  });
  it("rolls back private memory when canonical revision CAS fails", async () => {
    const f = await persisted("unified-rollback"); const before = await repo.getUnifiedRuntime(f.state.id);
    await assert.rejects(commitUnifiedWorld({ ...f, meta: { ...f.meta, expectedRevision: 99 }, state: { ...f.state, battleRevision: 1 } }), /REVISION_CONFLICT/);
    assert.deepEqual(await repo.getUnifiedRuntime(f.state.id), before);
    assert.equal((await battles.getBattle(f.state.id))?.battleRevision, 0);
  });
  it("rolls back the entire boundary if the global deadline passes inside the transaction", async () => {
    const f = await persisted("unified-clock-rollback"); const before = await repo.getUnifiedRuntime(f.state.id); let checks = 0;
    await assert.rejects(commitUnifiedWorld({ ...f, state: { ...f.state, battleRevision: 1 }, now: () => ++checks < 4 ? now + 1000 : now + 600000 }), /WORLD_DEADLINE/);
    assert.deepEqual(await repo.getUnifiedRuntime(f.state.id), before);
    assert.equal((await battles.getBattle(f.state.id))?.battleRevision, 0);
  });
  it("rejects expired fences and stops incomplete without applying prepared memory", async () => {
    const f = await persisted("unified-incomplete");
    await assert.rejects(commitUnifiedWorld({ ...f, fence: { ...f.fence, ownerId: "stale" }, state: { ...f.state, battleRevision: 1 } }), /LEASE_CONFLICT/);
    await commitUnifiedWorld({ ...f, state: { ...f.state, status: "incomplete", incompleteReason: "provider failure" } });
    const runtime = (await repo.getUnifiedRuntime(f.state.id))?.runtime;
    assert.equal(runtime?.status, "incomplete"); assert.deepEqual(runtime?.sides.a.memory, []);
    assert.equal(runtime?.decisions[0]?.status, "prepared");
  });
});
