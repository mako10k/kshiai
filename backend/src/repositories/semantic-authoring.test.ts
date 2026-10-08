import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import SqliteDatabase from "better-sqlite3";
import type { SemanticAuthoringRunV1 } from "@kshiai/shared";

const directory = mkdtempSync(join(tmpdir(), "kshiai-semantic-authoring-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "authoring.db");

const legacyDatabase = new SqliteDatabase(process.env.DATABASE_PATH);
legacyDatabase.exec(`CREATE TABLE semantic_authoring_provider_requests (
  request_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES semantic_authoring_runs(run_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 8),
  reservation_json TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  provider_route TEXT NOT NULL,
  outcome TEXT CHECK (outcome IN ('succeeded', 'failed', 'unknown_consumption')),
  accounting_json TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE (run_id, ordinal)
);`);
legacyDatabase.close();

const { closeDatabase, query } = await import("../db.js");
const authoring = await import("./semantic-authoring.js");

const now = "2026-09-12T12:00:00.000Z";
const later = "2026-09-12T12:01:00.000Z";

const reservation = {
  requestId: "request-1",
  inputTokens: 1_000,
  inputBytes: 4_000,
  outputTokens: 500,
  outputBytes: 2_000,
  costMicroUsd: 50_000,
  elapsedMs: 60_000,
};

function runInput(runId: string, attemptId: string): Omit<SemanticAuthoringRunV1, "executionFence"> {
  return {
    runId,
    attemptId,
    family: "character",
    mode: "create",
    ownerUserId: "authoring-owner",
    sourceIdentity: {
      assetId: "asset-1",
      generationId: null,
      contentDigest: "a".repeat(64),
    },
    targetContract: { family: "character", version: 3 },
    adapterIdentity: "scripted-v1",
    policyIdentity: "semantic_authoring_policy_v1",
    pricingIdentity: "pricing-v1",
    tokenEstimatorIdentity: "bytes-upper-bound-v1",
    expectedCurrentGenerationId: null,
  };
}

before(async () => {
  await query(
    `INSERT INTO users (id, username, password_hash, created_at)
     VALUES ($1, $2, 'x', $3)`,
    ["authoring-owner", "authoring-owner", now],
  );
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

describe("semantic authoring durable ports", () => {
  it("upgrades the previous SQLite request constraint before timeout settlement", async () => {
    const table = await query<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'semantic_authoring_provider_requests'",
    );
    assert.match(table.rows[0]?.sql ?? "", /provider_transport_timeout/);
  });

  it("enforces the frozen family/mode/policy call allowance in SQLite storage", async () => {
    for (const [key, family, mode, policyIdentity, limit] of [
      ["new-create", "character", "create", "character_complete_review_policy_v2", 10],
      ["new-revise", "character", "revise", "character_complete_review_policy_v2", 10],
      ["old-create", "character", "create", "semantic_authoring_policy_v1", 8],
      ["migration", "character", "migrate", "character_complete_review_policy_v2", 8],
      ["other-family", "narration-style", "create", "character_complete_review_policy_v2", 8],
    ] as const) {
      const runId = `policy-${key}`;
      await authoring.insertPendingSemanticAuthoringRunV1({
        run: { ...runInput(runId, `attempt-${key}`), family, mode, policyIdentity },
        sourcePayloadRef: `source:${key}`, predecessorRunId: null, createdAt: now,
      });
      const insert = (ordinal: number) => query(`INSERT INTO semantic_authoring_provider_requests
        (request_id, run_id, ordinal, reservation_json, request_digest, provider_route, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`${runId}-${ordinal}`, runId, ordinal, JSON.stringify(reservation), "digest", "private-fixture", now]);
      await insert(limit);
      await assert.rejects(insert(limit + 1), /SEMANTIC_AUTHORING_REQUEST_POLICY_LIMIT|CHECK constraint/);
      await assert.rejects(query(`UPDATE semantic_authoring_provider_requests SET ordinal = $2
        WHERE request_id = $1`, [`${runId}-${limit}`, limit + 1]),
      /SEMANTIC_AUTHORING_REQUEST_POLICY_LIMIT|CHECK constraint/);
      const rows = await query<{ ordinal: number; reservation_json: string }>(
        `SELECT ordinal, reservation_json FROM semantic_authoring_provider_requests WHERE run_id = $1`, [runId]);
      assert.deepEqual(rows.rows, [{ ordinal: limit, reservation_json: JSON.stringify(reservation) }]);
    }
  });

  it("claims a pending run and records a reservation only under the live fence", async () => {
    const pending = await authoring.insertPendingSemanticAuthoringRunV1({
      run: runInput("run-claim", "attempt-claim"),
      sourcePayloadRef: "family:character:asset-1:source",
      predecessorRunId: null,
      createdAt: now,
    });
    assert.equal(pending.status, "pending");
    assert.equal(pending.executionFence.fencingToken, 0);

    const claimed = await authoring.claimSemanticAuthoringRunV1("run-claim", "worker-1", now);
    assert.equal(claimed.accepted, true);
    if (!claimed.accepted) {
      assert.fail("claim failed");
    }
    assert.equal(claimed.value.status, "claimed");
    assert.equal(claimed.value.executionFence.ownerId, "worker-1");
    assert.equal(claimed.value.executionFence.fencingToken, 1);

    const stale = await authoring.writeSemanticAuthoringReservationV1({
      runId: "run-claim",
      fence: pending.executionFence,
      reservation,
      requestDigest: "b".repeat(64),
      providerRoute: "scripted-route",
      createdAt: now,
    });
    assert.equal(stale.accepted, false);
    if (stale.accepted) {
      assert.fail("stale fence wrote a reservation");
    }
    assert.equal(stale.reason, "fence_mismatch");

    const recorded = await authoring.writeSemanticAuthoringReservationV1({
      runId: "run-claim",
      fence: claimed.value.executionFence,
      reservation,
      requestDigest: "b".repeat(64),
      providerRoute: "scripted-route",
      createdAt: now,
    });
    assert.equal(recorded.accepted, true);
    if (!recorded.accepted) {
      assert.fail("live fence did not write reservation");
    }
    assert.equal(recorded.value.outcome, null);
    assert.equal(recorded.value.reservation.requestId, "request-1");
  });

  it("recovers process loss by fencing, charging unknown consumption, and rejecting late application", async () => {
    const pending = await authoring.insertPendingSemanticAuthoringRunV1({
      run: runInput("run-loss", "attempt-loss"),
      sourcePayloadRef: "family:character:asset-1:source",
      predecessorRunId: null,
      createdAt: now,
    });
    const claimed = await authoring.claimSemanticAuthoringRunV1("run-loss", "worker-lost", now);
    assert.equal(claimed.accepted, true);
    if (!claimed.accepted) {
      assert.fail("process-loss claim failed");
    }
    const reserved = await authoring.writeSemanticAuthoringReservationV1({
      runId: "run-loss",
      fence: claimed.value.executionFence,
      reservation: { ...reservation, requestId: "request-loss" },
      requestDigest: "c".repeat(64),
      providerRoute: "scripted-route",
      createdAt: now,
    });
    assert.equal(reserved.accepted, true);
    if (!reserved.accepted) {
      assert.fail("process-loss reservation failed");
    }

    const recovered = await authoring.recoverSemanticAuthoringProcessLossV1({
      runId: "run-loss",
      recoveryOwnerId: "worker-recover",
      recoveredAt: later,
    });
    assert.equal(recovered.accepted, true);
    if (!recovered.accepted) {
      assert.fail("process-loss recovery failed");
    }
    assert.equal(recovered.value.status, "failed");
    assert.equal(recovered.value.failureReceipt?.category, "process_or_lease_lost");
    assert.equal(recovered.value.accounting.llmCalls, 1);
    assert.equal(recovered.value.accounting.costMicroUsd, 50_000);
    assert.equal(recovered.value.executionFence.ownerId, "worker-recover");
    assert.notEqual(
      recovered.value.executionFence.fencingToken,
      claimed.value.executionFence.fencingToken,
    );

    const requests = await authoring.listSemanticAuthoringRequestsV1("run-loss");
    assert.equal(requests[0]?.outcome, "unknown_consumption");

    const lateApply = await authoring.settleSemanticAuthoringRequestV1({
      runId: "run-loss",
      requestId: "request-loss",
      fence: claimed.value.executionFence,
      outcome: "succeeded",
      finishedAt: later,
    });
    assert.equal(lateApply.accepted, false);
    if (lateApply.accepted) {
      assert.fail("late result was applied after process loss");
    }
    assert.equal(lateApply.reason, "terminal");

    const afterLate = await authoring.getSemanticAuthoringRunV1("run-loss");
    assert.equal(afterLate?.status, "failed");
    assert.equal(afterLate?.accounting.llmCalls, 1);
  });

  it("records a transport timeout once and retains unknown usage at the reserved maximum", async () => {
    await authoring.insertPendingSemanticAuthoringRunV1({
      run: runInput("run-timeout", "attempt-timeout"),
      sourcePayloadRef: "family:character:asset-1:source",
      predecessorRunId: null,
      createdAt: now,
    });
    const claimed = await authoring.claimSemanticAuthoringRunV1("run-timeout", "worker-timeout", now);
    assert.equal(claimed.accepted, true);
    if (!claimed.accepted) assert.fail("timeout claim failed");
    const reserved = await authoring.writeSemanticAuthoringReservationV1({
      runId: "run-timeout", fence: claimed.value.executionFence,
      reservation: { ...reservation, requestId: "request-timeout" },
      requestDigest: "f".repeat(64), providerRoute: "scripted-route", createdAt: now,
    });
    assert.equal(reserved.accepted, true);
    if (!reserved.accepted) assert.fail("timeout reservation failed");
    const settled = await authoring.settleSemanticAuthoringRequestV1({
      runId: "run-timeout", requestId: "request-timeout",
      fence: (await authoring.getSemanticAuthoringRunV1("run-timeout"))!.executionFence,
      outcome: "provider_transport_timeout", finishedAt: later, measuredElapsedMs: 90_000,
    });
    assert.equal(settled.accepted, true);
    if (!settled.accepted) assert.fail("timeout settlement failed");
    assert.equal(settled.value.outcome, "provider_transport_timeout");
    assert.equal(settled.value.accounting?.costMicroUsd, reservation.costMicroUsd);
    const run = await authoring.getSemanticAuthoringRunV1("run-timeout");
    assert.equal(run?.accounting.llmCalls, 1);
    assert.equal(run?.accounting.elapsedMs, 90_000);
    const late = await authoring.settleSemanticAuthoringRequestV1({
      runId: "run-timeout", requestId: "request-timeout",
      fence: run!.executionFence, outcome: "succeeded", finishedAt: later,
    });
    assert.equal(late.accepted, false);
    assert.equal(late.accepted ? "" : late.reason, "not_outstanding");
  });

  it("replays the same owner command identity to the same pending run", async () => {
    const first = await authoring.replayOrCreateSemanticAuthoringCommandV1({
      ownerUserId: "authoring-owner",
      commandId: "retry-1",
      createdAt: now,
      run: runInput("run-cmd-1", "attempt-cmd-1"),
      sourcePayloadRef: "family:character:asset-1:source",
      predecessorRunId: null,
    });
    const second = await authoring.replayOrCreateSemanticAuthoringCommandV1({
      ownerUserId: "authoring-owner",
      commandId: "retry-1",
      createdAt: later,
      run: runInput("run-cmd-2", "attempt-cmd-2"),
      sourcePayloadRef: "family:character:asset-1:source",
      predecessorRunId: null,
    });
    assert.equal(second.runId, first.runId);
    assert.equal(second.attemptId, "attempt-cmd-1");
    const other = await authoring.getSemanticAuthoringRunV1("run-cmd-2");
    assert.equal(other, null);
  });

  it("writes a terminal failure under the live fence and closes outstanding requests", async () => {
    const pending = await authoring.insertPendingSemanticAuthoringRunV1({
      run: runInput("run-term", "attempt-term"),
      sourcePayloadRef: "family:character:asset-1:source",
      predecessorRunId: null,
      createdAt: now,
    });
    const claimed = await authoring.claimSemanticAuthoringRunV1("run-term", "worker-1", now);
    assert.equal(claimed.accepted, true);
    if (!claimed.accepted) {
      assert.fail("terminal claim failed");
    }
    const reserved = await authoring.writeSemanticAuthoringReservationV1({
      runId: "run-term",
      fence: claimed.value.executionFence,
      reservation: { ...reservation, requestId: "request-term" },
      requestDigest: "d".repeat(64),
      providerRoute: "scripted-route",
      createdAt: now,
    });
    assert.equal(reserved.accepted, true);
    if (!reserved.accepted) {
      assert.fail("terminal reservation failed");
    }
    const fenced = await authoring.getSemanticAuthoringRunV1("run-term");
    assert.ok(fenced);
    const failed = await authoring.writeSemanticAuthoringTerminalV1({
      runId: "run-term",
      fence: fenced.executionFence,
      status: "failed",
      accounting: {
        ...fenced.accounting,
        llmCalls: 1,
        costMicroUsd: 50_000,
        elapsedMs: 60_000,
        inputTokens: 1_000,
        outputTokens: 500,
      },
      failureReceipt: {
        category: "technical_failure",
        accounting: fenced.accounting,
        relevantFindingKeys: [],
        sourceIdentity: fenced.sourceIdentity,
      },
      updatedAt: later,
    });
    assert.equal(failed.accepted, true);
    if (!failed.accepted) {
      assert.fail("terminal write failed");
    }
    assert.equal(failed.value.status, "failed");
    assert.equal(failed.value.accounting.llmCalls, 1);
    const closed = await authoring.listSemanticAuthoringRequestsV1("run-term");
    assert.equal(closed[0]?.outcome, "unknown_consumption");
    const late = await authoring.settleSemanticAuthoringRequestV1({
      runId: "run-term",
      requestId: "request-term",
      fence: failed.value.executionFence,
      outcome: "succeeded",
      finishedAt: later,
    });
    assert.equal(late.accepted, false);
    assert.equal(late.accepted ? "" : late.reason, "terminal");
    void pending;
  });

  it("stores a ready_for_review family payload reference under the live fence", async () => {
    await authoring.insertPendingSemanticAuthoringRunV1({
      run: runInput("run-ready", "attempt-ready"),
      sourcePayloadRef: "family:character:asset-1:source",
      predecessorRunId: null,
      createdAt: now,
    });
    const claimed = await authoring.claimSemanticAuthoringRunV1("run-ready", "worker-1", now);
    assert.equal(claimed.accepted, true);
    if (!claimed.accepted) {
      assert.fail("ready claim failed");
    }
    const ready = await authoring.writeSemanticAuthoringTerminalV1({
      runId: "run-ready",
      fence: claimed.value.executionFence,
      status: "ready_for_review",
      accounting: claimed.value.accounting,
      failureReceipt: null,
      finalCandidate: {
        finalCandidateId: "final-ready",
        digest: "e".repeat(64),
        familyPayloadRef: "family:character:asset-1:final",
        obligationCoverage: {
          resolvedRequiredObligationCount: 1,
          requiredObligationCount: 1,
        },
        reconciliationReceiptIdentity: "reconciliation-1",
        compilerReceiptIdentity: "compiler-1",
        disclosureReceiptIdentity: "disclosure-1",
        expectedCurrentGenerationId: null,
      },
      updatedAt: later,
    });
    assert.equal(ready.accepted, true);
    if (!ready.accepted) {
      assert.fail("ready_for_review write failed");
    }
    const stored = await query<{ family_payload_ref: string; digest: string }>(
      `SELECT family_payload_ref, digest FROM semantic_authoring_final_candidates
        WHERE run_id = $1`,
      ["run-ready"],
    );
    assert.equal(stored.rows[0]?.family_payload_ref, "family:character:asset-1:final");
    const columns = await query<{ name: string }>(
      `PRAGMA table_info(semantic_authoring_final_candidates)`,
    );
    assert.equal(
      columns.rows.some((column) => column.name === "payload" || column.name === "payload_json"),
      false,
    );
  });

  it("writes a needs_owner_answer question and keeps the run closed after an answer", async () => {
    await authoring.insertPendingSemanticAuthoringRunV1({
      run: runInput("run-q", "attempt-q"),
      sourcePayloadRef: "family:character:asset-1:source",
      predecessorRunId: null,
      createdAt: now,
    });
    const claimed = await authoring.claimSemanticAuthoringRunV1("run-q", "worker-1", now);
    assert.equal(claimed.accepted, true);
    if (!claimed.accepted) {
      assert.fail("question claim failed");
    }
    const asked = await authoring.writeSemanticAuthoringTerminalV1({
      runId: "run-q",
      fence: claimed.value.executionFence,
      status: "needs_owner_answer",
      accounting: claimed.value.accounting,
      failureReceipt: null,
      question: {
        questionId: "question-1",
        question: "Which protected name is intended?",
        evidence: {
          explicitProblemClaimIds: ["conflict"],
          materialProtectedImpactClaimIds: ["conflict"],
          materiallyDifferentOutcomeClaimIds: ["conflict"],
          exhaustedRecoveryFindingKeys: ["conflict"],
          unsafeAutomaticResolutionClaimIds: ["conflict"],
        },
        resumption: {
          predecessorRunId: "run-q",
          predecessorAttemptId: "attempt-q",
          questionId: "question-1",
        },
      },
      updatedAt: later,
    });
    assert.equal(asked.accepted, true);
    if (!asked.accepted) {
      assert.fail("needs_owner_answer write failed");
    }
    const question = await authoring.getSemanticAuthoringQuestionV1("question-1");
    assert.equal(question?.state, "open");
    const answered = await authoring.appendSemanticAuthoringAnswerV1({
      answerId: "answer-1",
      questionId: "question-1",
      ownerUserId: "authoring-owner",
      answer: "Keep the source name.",
      createdAt: later,
    });
    assert.equal(answered.accepted, true);
    const afterAnswer = await authoring.getSemanticAuthoringRunV1("run-q");
    assert.equal(afterAnswer?.status, "needs_owner_answer");
    const storedQuestion = await authoring.getSemanticAuthoringQuestionV1("question-1");
    assert.equal(storedQuestion?.state, "answered");
  });

  it("preserves stored old-policy run identities, request values, and receipts during table upgrade", async () => {
    await closeDatabase();
    const fixturePath = join(directory, "previous-policy.db");
    copyFileSync(join(directory, "authoring.db"), fixturePath);
    const fixture = new SqliteDatabase(fixturePath);
    // This isolated fixture represents the old schema, which cannot contain calls 9/10.
    fixture.exec(`
      DROP TRIGGER semantic_authoring_request_policy_insert;
      DROP TRIGGER semantic_authoring_request_policy_update;
      ALTER TABLE semantic_authoring_provider_requests RENAME TO requests_current;
      CREATE TABLE semantic_authoring_provider_requests (
        request_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES semantic_authoring_runs(run_id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 8),
        reservation_json TEXT NOT NULL, request_digest TEXT NOT NULL, provider_route TEXT NOT NULL,
        outcome TEXT CHECK (outcome IN ('succeeded', 'failed', 'unknown_consumption', 'provider_transport_timeout')),
        accounting_json TEXT, created_at TEXT NOT NULL, finished_at TEXT,
        UNIQUE (run_id, ordinal)
      );
      INSERT INTO semantic_authoring_provider_requests SELECT * FROM requests_current WHERE ordinal <= 8;
      DROP TABLE requests_current;
    `);
    const expected = {
      requests: fixture.prepare("SELECT * FROM semantic_authoring_provider_requests ORDER BY request_id").all(),
      runs: fixture.prepare("SELECT * FROM semantic_authoring_runs ORDER BY run_id").all(),
    };
    assert.ok(expected.requests.length > 0, "migration fixture must carry actual settled and reserved requests");
    fixture.close();
    const child = `
      const { query, closeDatabase } = await import(${JSON.stringify(new URL("../db.ts", import.meta.url).href)});
      try {
        const requests = await query("SELECT * FROM semantic_authoring_provider_requests ORDER BY request_id");
        const runs = await query("SELECT * FROM semantic_authoring_runs ORDER BY run_id");
        console.log(JSON.stringify({requests: requests.rows, runs: runs.rows}));
      } finally { await closeDatabase(); }
    `;
    const result = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", child], {
      cwd: process.cwd(), encoding: "utf8",
      env: { ...process.env, DATABASE_PATH: fixturePath, DATABASE_URL: "", DIRECT_URL: "" },
      timeout: 30_000,
    });
    assert.deepEqual(JSON.parse(result), expected);
    const upgraded = new SqliteDatabase(fixturePath);
    try {
      const schema = upgraded.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'semantic_authoring_provider_requests'").get();
      assert.ok(typeof schema === "object" && schema !== null && "sql" in schema && typeof schema.sql === "string");
      assert.match(schema.sql, /ordinal BETWEEN 1 AND 10/);
      assert.equal(upgraded.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'semantic_authoring_request_policy_%'").all().length, 2);
    } finally { upgraded.close(); }
  });

});
