// R: Verify awareness persistence fencing, atomicity, and durable recovery boundaries.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AwarenessInitialize, AwarenessObservedPolicy, defaultCharacterIdentity, AwarenessStartConsciousJob, type AwarenessConsciousInput } from "@kshiai/shared";
import { battleAwarenessSchemaSql } from "./battle-awareness-schema.js";

const directory = mkdtempSync(join(tmpdir(), "kshiai-awareness-persistence-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.AUTH_PROVIDER = "legacy";
const { getDb, withTransaction } = await import("../db.js");
const repository = await import("./battle-awareness.js");
const now = "2026-10-05T06:00:00.000Z";
const expires = "2026-10-05T06:10:00.000Z";
getDb().exec(battleAwarenessSchemaSql);
after(() => { getDb().close(); rmSync(directory, { recursive: true, force: true }); });

function runtime() {
  return AwarenessInitialize({ startedAt: Date.parse(now), promptRevision: "test-v1", outputRevision: "test-v1" });
}

function frozenInput(): AwarenessConsciousInput {
  return { side: "a", sourceTick: 0,
    character: { schemaVersion: 1, displayName: "A", identity: defaultCharacterIdentity(), tags: [], appearanceSummary: "", traits: [], narrativeBlurb: "", basicAction: { name: "防御", description: "構える" }, skills: [], equipment: { weapon: null, armor: null } },
    characteristics: [], training: [], availableActions: [{ kind: "defend", name: "構える", target: { kind: "self", perceivedAs: "自分" } }], facts: [],
    perception: { schemaVersion: 1, observer: { side: "a", self: "self" }, turn: 0, revision: 0,
      self: { subject: { kind: "self" }, currentAccess: "clear", identityKnowledge: "identified", perceivedAs: "自分", percepts: [] },
      counterpart: { subject: { kind: "counterpart" }, currentAccess: "none", identityKnowledge: "unknown", perceivedAs: "見えない", percepts: [] },
      others: [], qualitativeChanges: [], reserveCues: [], latestDiff: { fromRevision: 0, toRevision: 0, addedOrUpdatedPerceptIds: [], removedPerceptIds: [] } },
    feltProjection: "落ち着かない", consciousState: { goal: null, thought: "", updatedTick: null } };
}

async function fixture(id: string) {
  getDb().prepare(`INSERT INTO battles (id,state_json,side_a_user_id,side_a_character_id,
    side_b_character_id,created_at,updated_at) VALUES (?, '{}', 'u','a','b',?,?)`).run(id, now, now);
  getDb().prepare(`INSERT INTO battle_leases (battle_id,owner_id,fencing_token,acquired_at,expires_at)
    VALUES (?, 'owner', 1, ?, ?)`).run(id, now, expires);
  const fence = { battleId: id, ownerId: "owner", fencingToken: 1 };
  assert.equal(await repository.initializeAwarenessRuntime({ battleId: id, runtime: runtime(), fence, now }), true);
  return { battleId: id, fence, expectedRevision: 0, now };
}

describe("durable awareness runtime", () => {
  it("keeps observed unknown maxima explicit while retaining physical limits and old certified refusal", async () => {
    const input = await fixture("observed-runtime");
    const observed = await repository.mutateAwarenessRuntime(input, (state) => ({ ...state, policy: AwarenessObservedPolicy }));
    const first = await repository.reserveAwarenessAttempt({ ...input, expectedRevision: observed.revision },
      { id: "observed-send", role: "adjudication", maximumUsd: null });
    assert.equal(first.runtime.budget.reservedUsd, 0);
    assert.equal(first.runtime.budget.reservations[0]?.maximumUsd, null);
    assert.deepEqual(first.runtime.budget.unknownAttemptIds, ["observed-send"]);
    assert.equal(first.runtime.budget.physicalOutstanding, 1);
    await assert.rejects(repository.reserveAwarenessAttempt({ ...input, expectedRevision: first.revision },
      { id: "observed-send-2", role: "adjudication", maximumUsd: null }), /ADMISSION_REJECTED/);
    const finished = await repository.settleAwarenessAttempt({ battleId: input.battleId, id: "observed-send", outcome: "settled",
      actualUsd: 0.75, physicalOutstanding: false, finishedAt: Date.parse(now) + 1000 });
    assert.equal(finished.runtime.budget.settledUsd, 0.75);
    assert.deepEqual(finished.runtime.budget.unknownAttemptIds, []);
    const continued = await repository.reserveAwarenessAttempt({ ...input, expectedRevision: finished.revision },
      { id: "observed-send-3", role: "adjudication", maximumUsd: null });
    await assert.rejects(repository.reserveAwarenessAttempt({ ...input, expectedRevision: continued.revision,
      now: new Date(continued.runtime.deadlineAt).toISOString() }, { id: "too-late", role: "conscious", maximumUsd: null }), /DEADLINE/);
    const certified = await fixture("certified-no-null");
    await assert.rejects(repository.reserveAwarenessAttempt(certified, { id: "no-proof", role: "adjudication", maximumUsd: null }), /VERIFIED_ADMISSION_REQUIRED/);
  });
  it("initializes once and rejects stale revisions without replacing accepted state", async () => {
    const input = await fixture("awareness-cas");
    const saved = await repository.mutateAwarenessRuntime(input, (state) => ({ ...state, tick: 1 }));
    assert.equal(saved.revision, 1);
    assert.equal(await repository.initializeAwarenessRuntime({ ...input, runtime: runtime() }), false);
    await assert.rejects(repository.mutateAwarenessRuntime(input, (state) => ({ ...state, tick: 2 })), /AWARENESS_REVISION_OR_LEASE_CONFLICT/);
    assert.equal((await repository.getAwarenessRuntime(input.battleId))?.runtime.tick, 1);
  });

  it("rejects superseded and expired leases while allowing the current owner", async () => {
    const input = await fixture("awareness-fence");
    getDb().prepare("UPDATE battle_leases SET owner_id = 'next', fencing_token = 2 WHERE battle_id = ?").run(input.battleId);
    await assert.rejects(repository.mutateAwarenessRuntime(input, (state) => state), /AWARENESS_REVISION_OR_LEASE_CONFLICT/);
    const current = { ...input, fence: { ...input.fence, ownerId: "next", fencingToken: 2 } };
    const saved = await repository.mutateAwarenessRuntime(current, (state) => state);
    assert.equal(saved.fencingToken, 2);
    await assert.rejects(repository.mutateAwarenessRuntime({ ...current, expectedRevision: 1, now: expires }, (state) => state), /AWARENESS_REVISION_OR_LEASE_CONFLICT/);
  });

  it("rolls back sidecar and canonical writes together when the outer transaction fails", async () => {
    const input = await fixture("awareness-atomic");
    await assert.rejects(withTransaction(async (connection) => {
      await repository.commitAwarenessRuntimeInTransaction(connection, input, { ...runtime(), tick: 1 });
      await connection.query("UPDATE battles SET revision = 1 WHERE id = $1", [input.battleId]);
      throw new Error("SIMULATED_CANONICAL_COMMIT_FAILURE");
    }), /SIMULATED_CANONICAL_COMMIT_FAILURE/);
    assert.equal((await repository.getAwarenessRuntime(input.battleId))?.revision, 0);
    assert.deepEqual(getDb().prepare("SELECT revision FROM battles WHERE id = ?").get(input.battleId), { revision: 0 });
  });

  it("rejects mismatched scope before invoking a transition", async () => {
    const input = await fixture("awareness-scope");
    let invoked = false;
    await assert.rejects(repository.mutateAwarenessRuntime({ ...input, fence: { ...input.fence, battleId: "another" } }, (state) => {
      invoked = true; return state;
    }), /AWARENESS_LEASE_SCOPE_MISMATCH/);
    assert.equal(invoked, false);
  });

  it("keeps unknown and cancelled maximum cost reserved and never reuses send IDs", async () => {
    const input = await fixture("awareness-budget");
    const reserved = await repository.reserveAwarenessAttempt(input, { id: "send-1", role: "conscious", maximumUsd: 0.1 });
    assert.equal(reserved.runtime.budget.physicalAttempts, 1);
    await assert.rejects(repository.reserveAwarenessAttempt({ ...input, expectedRevision: 1 }, {
      id: "send-1", role: "conscious", maximumUsd: 0.1,
    }), /AWARENESS_ATTEMPT_ALREADY_RESERVED/);
    const unknown = await repository.settleAwarenessAttempt({ battleId: input.battleId, id: "send-1",
      outcome: "unknown", actualUsd: null, physicalOutstanding: false, finishedAt: Date.parse(now) + 1000 });
    assert.equal(unknown.runtime.budget.reservedUsd, 0.1);
    assert.equal(unknown.runtime.budget.physicalOutstanding, 0);
    assert.deepEqual(unknown.runtime.budget.unknownAttemptIds, ["send-1"]);
    await assert.rejects(repository.reserveAwarenessAttempt({ ...input, expectedRevision: unknown.revision }, {
      id: "send-2", role: "conscious", maximumUsd: 0.03,
    }), /AWARENESS_BUDGET_ADMISSION_REJECTED/);
    const cancelled = await repository.settleAwarenessAttempt({ battleId: input.battleId, id: "send-1",
      outcome: "cancelled", actualUsd: null, physicalOutstanding: false, finishedAt: Date.parse(now) + 2000 });
    assert.equal(cancelled.runtime.budget.reservedUsd, 0.1);
    const settled = await repository.settleAwarenessAttempt({ battleId: input.battleId, id: "send-1",
      outcome: "settled", actualUsd: 0.02, physicalOutstanding: false, finishedAt: Date.parse(now) + 3000 });
    assert.equal(settled.runtime.budget.reservedUsd, 0);
    assert.equal(settled.runtime.budget.settledUsd, 0.02);
    const replay = await repository.settleAwarenessAttempt({ battleId: input.battleId, id: "send-1",
      outcome: "settled", actualUsd: 0.02, physicalOutstanding: false, finishedAt: Date.parse(now) + 4000 });
    assert.equal(replay.revision, settled.revision);
    await assert.rejects(repository.settleAwarenessAttempt({ battleId: input.battleId, id: "send-1",
      outcome: "settled", actualUsd: 0.01, physicalOutstanding: false, finishedAt: Date.parse(now) + 4000 }), /AWARENESS_ACCOUNTING_RECEIPT_CONFLICT/);
  });

  it("reserves concurrent sends atomically and rejects admission beyond a role's physical limit", async () => {
    const input = await fixture("awareness-concurrent");
    const results = await Promise.allSettled(["send-a", "send-b"].map((id) => repository.reserveAwarenessAttempt(input, {
      id, role: "adjudication", maximumUsd: 0.01,
    })));
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
    const current = await repository.getAwarenessRuntime(input.battleId);
    assert.ok(current);
    assert.equal(current.runtime.budget.physicalAttempts, 1);
    await assert.rejects(repository.reserveAwarenessAttempt({ ...input, expectedRevision: current.revision }, {
      id: "send-c", role: "adjudication", maximumUsd: 0.01,
    }), /AWARENESS_BUDGET_ADMISSION_REJECTED/);
  });

  it("accepts a frozen thought once after world lease release and settles cancelled late replies without application", async () => {
    const input = await fixture("awareness-thought");
    const initial = runtime();
    const startedAt = Date.parse(now);
    const side = AwarenessStartConsciousJob(initial.sides.a, { id: "thought-1", snapshot: frozenInput(), startedAt, deadlineAt: startedAt + 15000 });
    await repository.mutateAwarenessRuntime(input, (state) => ({ ...state, sides: { ...state.sides, a: side } }));
    getDb().prepare("DELETE FROM battle_leases WHERE battle_id = ?").run(input.battleId);
    assert.ok(side.job);
    const job = side.job;
    const completion = { battleId: input.battleId, side: "a" as const, jobId: job.id,
      generation: job.generation, jobFence: job.fence, finishedAt: startedAt + 3000,
      outcome: { kind: "succeeded" as const, result: { goal: "落ち着く", thought: "一息つく", desires: [], influences: [] } } };
    const first = await repository.completeAwarenessConsciousJob(completion);
    assert.equal(first.accepted, true);
    assert.equal(first.snapshot.runtime.sides.a.job?.status, "ready");
    assert.deepEqual(first.snapshot.runtime.sides.a.mailbox, []);
    assert.deepEqual(first.snapshot.runtime.sides.a.desires, []);
    assert.deepEqual(first.snapshot.runtime.sides.a.job?.input, frozenInput());
    const duplicate = await repository.completeAwarenessConsciousJob(completion);
    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.snapshot.revision, first.snapshot.revision);

    const cancelledInput = await fixture("awareness-thought-cancelled");
    await repository.mutateAwarenessRuntime(cancelledInput, (state) => ({ ...state,
      sides: { ...state.sides, a: { ...side, generation: side.generation + 1, job: { ...job, status: "cancelled" } } },
    }));
    const cancelled = await repository.completeAwarenessConsciousJob({ ...completion, battleId: cancelledInput.battleId });
    assert.equal(cancelled.accepted, false);
    assert.equal(cancelled.snapshot.runtime.sides.a.job?.status, "cancelled");
    assert.equal(cancelled.snapshot.runtime.sides.a.job?.physicalStatus, "finished");
    assert.equal(cancelled.snapshot.runtime.sides.a.job?.result, null);
  });

  it("admits only terminal narration inside the immutable drain and global deadlines", async () => {
    const input = await fixture("awareness-terminal-budget");
    const terminal = await repository.mutateAwarenessRuntime(input, (state) => ({ ...state,
      status: "terminal", terminalAt: Date.parse(now) }));
    const narration = await repository.reserveAwarenessAttempt({ ...input, expectedRevision: terminal.revision }, {
      id: "terminal-narration", role: "narration", maximumUsd: 0.01,
    });
    assert.equal(narration.runtime.budget.physicalAttempts, 1);
    await assert.rejects(repository.reserveAwarenessAttempt({ ...input, expectedRevision: narration.revision }, {
      id: "terminal-thought", role: "conscious", maximumUsd: 0.01,
    }), /AWARENESS_RUNTIME_INACTIVE/);
    await assert.rejects(repository.reserveAwarenessAttempt({ ...input, expectedRevision: narration.revision,
      now: new Date(Date.parse(now) + 15000).toISOString() }, {
      id: "expired-drain", role: "narration", maximumUsd: 0.01,
    }), /AWARENESS_RUNTIME_INACTIVE/);

    const lateInput = await fixture("awareness-terminal-global-budget");
    const late = await repository.mutateAwarenessRuntime(lateInput, (state) => ({ ...state,
      status: "terminal", terminalAt: Date.parse(now) + 179000 }));
    await assert.rejects(repository.reserveAwarenessAttempt({ ...lateInput, expectedRevision: late.revision,
      now: new Date(Date.parse(now) + 180000).toISOString() }, {
      id: "expired-global", role: "narration", maximumUsd: 0.01,
    }), /AWARENESS_RUNTIME_INACTIVE/);
  });
});
