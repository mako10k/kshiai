// R: Verify the HTTP cutover admission boundary without provisioning users or touching a database.
import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import {
  closedOwnerConfirmInput,
  isExactOwnerReviewPath,
} from "./cutover-http-admission.js";
import type { CutoverControl } from "../repositories/cutover-control.js";

function control(): CutoverControl {
  return {
    cutoverId: "cutover-1",
    artifactId: "artifact-1",
    revision: 1,
    phase: "closed",
    operationId: "op-1",
    operatorId: "operator-1",
    recoveryMode: "snapshot-eligible",
    stoppedBarrierReceiptId: null,
    createdAt: new Date(0).toISOString(),
    policy: {
      cutoverId: "cutover-1",
      artifactId: "artifact-1",
      ownerUserId: "usr-owner",
      ownerCandidates: [
        { attemptId: "attempt-a", candidateDigest: "a".repeat(64) },
        { attemptId: "attempt-b", candidateDigest: "b".repeat(64) },
      ],
      trialBindings: null,
      taskBattleIds: [],
      stageAcceptance: {
        health: null, postgres: null, email: null, google: null,
        ownership: null, r2: null, sse: null, directProtection: null,
      },
      productionReceipt: null,
    },
  };
}

test("only the exact character review and confirm paths are review surfaces", async () => {
  const app = new Hono();
  app.all("*", (c) => c.json({ review: isExactOwnerReviewPath(c) }));
  await Promise.all([
    ["/api/character-drafts/attempt-a", true],
    ["/api/characters/attempt-a/confirm", true],
    ["/api/characters/character-a/confirm/extra", false],
    ["/api/battles", false],
  ].map(async ([path, expected]) => {
    const response = await app.request(path as string);
    assert.deepEqual(await response.json(), { review: expected });
  }));
});

test("closed confirm admission binds owner, attempt, path, and candidate digest", () => {
  const base = {
    control: control(),
    userId: "usr-owner",
    path: "/api/characters/attempt-a/confirm",
    method: "POST",
    candidateDigest: "a".repeat(64),
  };
  assert.equal(closedOwnerConfirmInput(base), true);
  assert.equal(closedOwnerConfirmInput({ ...base, userId: "usr-other" }), false);
  assert.equal(closedOwnerConfirmInput({ ...base, candidateDigest: "c".repeat(64) }), false);
  assert.equal(closedOwnerConfirmInput({ ...base, path: "/api/characters/character-a/confirm" }), false);
  assert.equal(closedOwnerConfirmInput({ ...base, method: "GET" }), false);
});
