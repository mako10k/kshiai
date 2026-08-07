import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-internal-observe-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "observations.db");

const { closeDatabase, getDb } = await import("../db.js");
const observationService = await import("./internal-observability.js");

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("internal battle observability", () => {
  it("lists retained battles and exposes raw and canonical turn data", async () => {
    const database = getDb();
    database.prepare(
      `INSERT INTO users
        (id, username, password_hash, email, account_kind, created_at)
       VALUES ('observer', 'observer', 'x', 'observer@example.test', 'e2e', ?)`,
    ).run("2026-08-07T00:00:00.000Z");
    database.prepare(
      `INSERT INTO users
        (id, username, password_hash, email, account_kind, created_at)
       VALUES ('general', 'general', 'x', 'general@example.test', 'general', ?)`,
    ).run("2026-08-07T00:00:00.000Z");
    database.prepare(
      `INSERT INTO characters
        (id, owner_user_id, sheet_json, created_at, updated_at)
       VALUES (?, 'observer', '{}', ?, ?)`,
    ).run("char-a", "2026-08-07T00:00:00.000Z", "2026-08-07T00:00:00.000Z");
    database.prepare(
      `INSERT INTO characters
        (id, owner_user_id, sheet_json, created_at, updated_at)
       VALUES (?, 'general', '{}', ?, ?)`,
    ).run("char-general", "2026-08-07T00:00:00.000Z", "2026-08-07T00:00:00.000Z");
    database.prepare(
      `INSERT INTO battles
        (id, state_json, side_a_user_id, side_a_character_id,
         side_b_character_id, created_at, updated_at)
       VALUES (?, ?, 'observer', 'char-a', 'char-a', ?, ?)`,
    ).run(
      "battle-observed",
      JSON.stringify({
        id: "battle-observed",
        status: "finished",
        turn: 1,
        turnLimit: 20,
        sideA: { displayName: "観測者" },
        sideB: { displayName: "対照役" },
        winnerSide: "a",
        finishReason: "incapacitated",
        battlefield: { displayName: "雨の路地" },
        semanticState: { revision: 1 },
        worldState: { revision: 1 },
        latestSemanticTransition: { turn: 1, status: "applied" },
        latestWorldTransition: { turn: 1, status: "applied" },
        turnRecords: [{
          turn: 1,
          actions: [{ id: "act-1" }],
          events: [{ id: "evt-1" }],
          sideAChange: { parameterChanges: {} },
          sideBChange: { parameterChanges: { hp: -10 } },
          worldImpact: { status: "applied", operationKinds: ["set_actor_state"] },
          canonicalTransition: {
            semantic: { turn: 1, status: "applied" },
            world: { turn: 1, status: "applied" },
          },
          pipelineTrace: {
            schemaVersion: 1,
            characterAgents: {
              phase: "turn",
              a: {
                input: { perception: "a" },
                providerStatus: "fulfilled",
                providerOutput: { nextAction: { kind: "wait" } },
                acceptedOutput: { nextAction: { kind: "wait" } },
              },
              b: {
                input: { perception: "b" },
                providerStatus: "fulfilled",
                providerOutput: { nextAction: { kind: "defend" } },
                acceptedOutput: { nextAction: { kind: "defend" } },
              },
            },
            narrator: {
              input: { view: { turn: 1 } },
              disposition: "provider",
              providerOutput: { narrator: ["raw"] },
              publicOutput: { narrator: ["public"] },
            },
          },
        }],
      }),
      "2026-08-07T00:00:00.000Z",
      "2026-08-07T00:01:00.000Z",
    );
    database.prepare(
      `INSERT INTO battles
        (id, state_json, side_a_user_id, side_a_character_id,
         side_b_character_id, created_at, updated_at)
       VALUES (?, ?, 'general', 'char-general', 'char-general', ?, ?)`,
    ).run(
      "battle-general",
      JSON.stringify({ id: "battle-general", status: "active", turnRecords: [] }),
      "2026-08-07T00:00:00.000Z",
      "2026-08-07T00:00:30.000Z",
    );
    database.prepare(
      `INSERT INTO balance_events
        (kind, created_at, battle_id, character_id, payload_json)
       VALUES ('persistent_e2e_observation', ?, 'battle-observed', 'char-a', ?)`,
    ).run(
      "2026-08-07T00:02:00.000Z",
      JSON.stringify({
        runId: "github-test-1",
        observedAt: "2026-08-07T00:02:00.000Z",
      }),
    );

    const list = await observationService.listInternalBattleObservations();
    assert.equal(list.length, 1);
    assert.equal(list[0]?.observationRunId, "github-test-1");
    assert.equal(list[0]?.sideAName, "観測者");
    assert.equal((await observationService.listInternalBattleObservations(30, "all")).length, 2);
    assert.equal(
      await observationService.getInternalBattleObservation("battle-general"),
      null,
    );
    assert.equal(
      (await observationService.getInternalBattleObservation("battle-general", "all"))
        ?.summary.battleId,
      "battle-general",
    );

    const detail = await observationService.getInternalBattleObservation(
      "battle-observed",
    );
    assert.ok(detail);
    assert.equal(detail.rawBattleState.id, "battle-observed");
    assert.equal(detail.canonicalTimeline[0]?.turn, 1);
    assert.deepEqual(detail.canonicalTimeline[0]?.events, [{ id: "evt-1" }]);
    assert.deepEqual(
      detail.canonicalTimeline[0]?.pipelineTrace,
      (detail.rawBattleState.turnRecords as Array<Record<string, unknown>>)[0]
        ?.pipelineTrace,
    );
    assert.equal(detail.capabilities.perTurnCanonicalTransitions, "complete");
    assert.equal(detail.capabilities.pipelineTraceCount, 1);
    assert.equal(detail.canonicalCurrent.worldState &&
      (detail.canonicalCurrent.worldState as { revision: number }).revision, 1);
  });
});
