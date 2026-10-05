// R: Verify atomic canonical awareness commits preserve concurrent subjective receipts.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AwarenessInitialize, AwarenessStartConsciousJob, defaultCharacterIdentity, type AwarenessConsciousInput,
} from "@kshiai/shared";
import { validAwarenessBattleFixture } from "./awareness-test-fixture.js";

const directory = mkdtempSync(join(tmpdir(), "kshiai-awareness-world-commit-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.AUTH_PROVIDER = "legacy";
const { getDb } = await import("../db.js");
const battles = await import("../repositories/battles.js");
const awareness = await import("../repositories/battle-awareness.js");
const { commitAwarenessWorld } = await import("./awareness-world-commit.js");
const { battleAwarenessSchemaSql } = await import("../repositories/battle-awareness-schema.js");
getDb().exec(battleAwarenessSchemaSql);
after(() => { getDb().close(); rmSync(directory, { recursive: true, force: true }); });
const now = Date.parse("2026-10-05T06:00:00.000Z");

async function fixture(id: string) {
  const { state } = validAwarenessBattleFixture(id);
  const meta = { sideAUserId: "owner", sideACharacterId: "a", sideBCharacterId: "b", expectedRevision: 0 };
  assert.equal(await battles.insertNewBattle(state, meta), "created");
  getDb().prepare(`INSERT INTO battle_leases (battle_id, owner_id, fencing_token, acquired_at, expires_at)
    VALUES (?, 'test-owner', 1, ?, ?)`).run(id, new Date(now).toISOString(), new Date(now + 180000).toISOString());
  const fence = { battleId: id, ownerId: "test-owner", fencingToken: 1 };
  await awareness.initializeAwarenessRuntime({ battleId: id, fence, now: new Date(now).toISOString(),
    runtime: { ...AwarenessInitialize({ startedAt: now, promptRevision: "awareness-prompt-v1", outputRevision: "awareness-output-v1" }), preparedTick: 0, cutoffTick: 0 } });
  return { state, meta, fence, tick: 0, committedAt: now + 1000, clock: () => now + 1000 };
}

function frozenInput(): AwarenessConsciousInput {
  return { side: "a", sourceTick: 0,
    character: { schemaVersion: 1, displayName: "a", identity: defaultCharacterIdentity(), tags: [], appearanceSummary: "", traits: [],
      narrativeBlurb: "", basicAction: { name: "防御", description: "構える" }, skills: [], equipment: { weapon: null, armor: null } },
    characteristics: [], training: [], availableActions: [], facts: [],
    perception: { schemaVersion: 1, observer: { side: "a", self: "self" }, turn: 0, revision: 0,
      self: { subject: { kind: "self" }, currentAccess: "clear", identityKnowledge: "identified", perceivedAs: "自分", percepts: [] },
      counterpart: { subject: { kind: "counterpart" }, currentAccess: "none", identityKnowledge: "unknown", perceivedAs: "見えない", percepts: [] },
      others: [], qualitativeChanges: [], reserveCues: [], latestDiff: { fromRevision: 0, toRevision: 0, addedOrUpdatedPerceptIds: [], removedPerceptIds: [] } },
    feltProjection: "曖昧", consciousState: { goal: null, thought: "", updatedTick: null } };
}

describe("atomic awareness world commit", () => {
  it("rolls back all writes when the actual clock crosses the deadline inside the transaction", async () => {
    const input = await fixture("world-clock-late");
    const before = await awareness.getAwarenessRuntime(input.state.id);
    let checks = 0;
    await assert.rejects(commitAwarenessWorld({ ...input,
      state: { ...input.state, battleRevision: 1, turn: input.state.turn + 1 },
      clock: () => ++checks < 3 ? now + 1000 : now + 180000,
    }), /AWARENESS_WORLD_COMMIT_DEADLINE/);
    assert.equal(checks, 3);
    assert.deepEqual(await awareness.getAwarenessRuntime(input.state.id), before);
    assert.equal((await battles.getBattle(input.state.id))?.turn, input.state.turn);
    assert.deepEqual(getDb().prepare("SELECT revision FROM battles WHERE id = ?").get(input.state.id), { revision: 0 });
  });

  it("rejects a prepared world commit at the global deadline without writing either store", async () => {
    const input = await fixture("world-deadline");
    const before = await awareness.getAwarenessRuntime(input.state.id);
    await assert.rejects(commitAwarenessWorld({ ...input, committedAt: now + 180000 }), /AWARENESS_WORLD_COMMIT_DEADLINE/);
    assert.deepEqual(await awareness.getAwarenessRuntime(input.state.id), before);
    assert.deepEqual(getDb().prepare("SELECT revision FROM battles WHERE id = ?").get(input.state.id), { revision: 0 });
  });

  it("requires the exact prepared boundary and leaves both stores unchanged on mismatch", async () => {
    const input = await fixture("world-prepared");
    await assert.rejects(commitAwarenessWorld({ ...input, tick: 1 }), /AWARENESS_WORLD_BOUNDARY_NOT_PREPARED/);
    assert.equal((await awareness.getAwarenessRuntime(input.state.id))?.revision, 0);
    assert.deepEqual(getDb().prepare("SELECT revision FROM battles WHERE id = ?").get(input.state.id), { revision: 0 });
  });

  it("rejects an early prepared marker before the latent cutoff has committed", async () => {
    const input = await fixture("world-before-cutoff");
    const before = await awareness.mutateAwarenessRuntime({ battleId: input.state.id, expectedRevision: 0,
      fence: input.fence, now: new Date(now).toISOString() }, (runtime) => ({ ...runtime, cutoffTick: null }));
    await assert.rejects(commitAwarenessWorld(input), /AWARENESS_WORLD_BOUNDARY_NOT_PREPARED/);
    assert.deepEqual(await awareness.getAwarenessRuntime(input.state.id), before);
    assert.deepEqual(getDb().prepare("SELECT revision FROM battles WHERE id = ?").get(input.state.id), { revision: 0 });
  });

  it("rolls back the sidecar update when canonical revision CAS fails", async () => {
    const input = await fixture("world-rollback");
    getDb().prepare("UPDATE battles SET revision = 1 WHERE id = ?").run(input.state.id);
    const before = await awareness.getAwarenessRuntime(input.state.id);
    await assert.rejects(commitAwarenessWorld({ ...input,
      state: { ...input.state, battleRevision: 1, turn: input.state.turn + 1 } }), /BATTLE_REVISION_CONFLICT/);
    assert.deepEqual(await awareness.getAwarenessRuntime(input.state.id), before);
    const saved = await battles.getBattle(input.state.id);
    assert.ok(saved);
    assert.equal(saved.turn, input.state.turn);
  });

  it("preserves a ready thought and accounting that arrive after subjective preparation", async () => {
    const input = await fixture("world-late-ready");
    const started = await awareness.mutateAwarenessRuntime({ battleId: input.state.id, expectedRevision: 0,
      fence: input.fence, now: new Date(now).toISOString() }, (runtime) => ({ ...runtime,
      sides: { ...runtime.sides, a: AwarenessStartConsciousJob(runtime.sides.a,
        { id: "job-late", snapshot: frozenInput(), startedAt: now, deadlineAt: now + 15000 }) } }));
    const job = started.runtime.sides.a.job;
    assert.ok(job);
    await awareness.reserveAwarenessAttempt({ battleId: input.state.id, expectedRevision: started.revision,
      fence: input.fence, now: new Date(now).toISOString() }, { id: "job-late", role: "conscious", maximumUsd: 0.02 });
    await awareness.completeAwarenessConsciousJob({ battleId: input.state.id, side: "a", jobId: job.id,
      generation: job.generation, jobFence: job.fence, finishedAt: now + 500,
      outcome: { kind: "succeeded", result: { goal: "待つ", thought: "少し考える", desires: [], influences: [] } },
      settlement: { id: job.id, outcome: "settled", actualUsd: 0.003, physicalOutstanding: false } });
    const before = await awareness.getAwarenessRuntime(input.state.id);
    assert.ok(before);
    await commitAwarenessWorld({ ...input, state: { ...input.state, battleRevision: 1, turn: input.state.turn + 1 } });
    const afterCommit = await awareness.getAwarenessRuntime(input.state.id);
    assert.ok(afterCommit);
    assert.deepEqual(afterCommit.runtime.sides.a.job, before.runtime.sides.a.job);
    assert.deepEqual(afterCommit.runtime.budget, before.runtime.budget);
    assert.equal(afterCommit.runtime.sides.a.conscious.updatedTick, null);
    assert.equal(afterCommit.runtime.preparedTick, null);
    assert.equal(afterCommit.runtime.lastCommittedAt, input.committedAt);
    assert.equal((await battles.getBattle(input.state.id))?.turn, input.state.turn + 1);
  });

  it("persists technical incomplete without advancing canonical turn or assigning a winner", async () => {
    const input = await fixture("world-incomplete");
    await awareness.mutateAwarenessRuntime({ battleId: input.state.id, expectedRevision: 0,
      fence: input.fence, now: new Date(now).toISOString() }, (runtime) => ({ ...runtime,
      status: "incomplete", incompleteReason: "required_latent_failure" }));
    await commitAwarenessWorld({ ...input, state: { ...input.state, status: "incomplete",
      incompleteReason: "required_latent_failure", battleRevision: 1 } });
    const saved = await battles.getBattle(input.state.id);
    assert.ok(saved);
    assert.equal(saved.status, "incomplete");
    assert.equal(saved.turn, input.state.turn);
    assert.equal(saved.winnerSide, null);
    assert.deepEqual(saved.worldState, input.state.worldState);
    assert.equal((await awareness.getAwarenessRuntime(input.state.id))?.runtime.lastCommittedAt, null);
  });

  for (const change of ["turn", "world"] as const) {
    it(`rejects ${change} mutation disguised as technical incomplete and preserves both stores`, async () => {
      const input = await fixture(`world-incomplete-${change}`);
      await awareness.mutateAwarenessRuntime({ battleId: input.state.id, expectedRevision: 0,
        fence: input.fence, now: new Date(now).toISOString() }, (runtime) => ({ ...runtime,
        status: "incomplete", incompleteReason: "required_latent_failure" }));
      const before = await awareness.getAwarenessRuntime(input.state.id);
      const candidate = { ...input.state, status: "incomplete" as const,
        incompleteReason: "required_latent_failure", battleRevision: 1,
        ...(change === "turn" ? { turn: input.state.turn + 1 } :
          { situation: { ...input.state.situation, scene: "技術失敗の間に世界を変えてしまった" } }),
      };
      await assert.rejects(commitAwarenessWorld({ ...input, state: candidate }), /AWARENESS_INCOMPLETE_CANONICAL_CHANGE/);
      assert.deepEqual(await awareness.getAwarenessRuntime(input.state.id), before);
      assert.deepEqual(getDb().prepare("SELECT revision FROM battles WHERE id = ?").get(input.state.id), { revision: 0 });
    });
  }

  it("invalidates outstanding thought generations on canonical terminal completion", async () => {
    const input = await fixture("world-terminal");
    const started = await awareness.mutateAwarenessRuntime({ battleId: input.state.id, expectedRevision: 0,
      fence: input.fence, now: new Date(now).toISOString() }, (runtime) => ({ ...runtime,
      sides: { ...runtime.sides, a: AwarenessStartConsciousJob(runtime.sides.a,
        { id: "job-terminal", snapshot: frozenInput(), startedAt: now, deadlineAt: now + 15000 }) } }));
    await commitAwarenessWorld({ ...input, state: { ...input.state, status: "finished", battleRevision: 1,
      winnerSide: "a", finishReason: "turn_limit" } });
    const runtime = (await awareness.getAwarenessRuntime(input.state.id))?.runtime;
    assert.ok(runtime);
    assert.equal(runtime.status, "terminal");
    assert.equal(runtime.sides.a.generation, started.runtime.sides.a.generation + 1);
    assert.equal(runtime.sides.a.job?.status, "cancelled");
    assert.equal(runtime.sides.a.job?.physicalStatus, "outstanding");
    const job = started.runtime.sides.a.job;
    assert.ok(job);
    const late = await awareness.completeAwarenessConsciousJob({ battleId: input.state.id, side: "a", jobId: job.id,
      generation: job.generation, jobFence: job.fence, finishedAt: now + 2000,
      outcome: { kind: "succeeded", result: { goal: "続ける", thought: "遅着", desires: [], influences: [] } } });
    assert.equal(late.accepted, false);
    assert.equal(late.snapshot.runtime.sides.a.job?.status, "cancelled");
    assert.equal(late.snapshot.runtime.sides.a.job?.result, null);
  });
});
