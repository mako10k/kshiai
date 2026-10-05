import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateV3TrialEvidence } from "./verify-v3-trial-evidence.mjs";

// R: Exercise accepted and rejected V3 trial evidence boundary cases.

const identity = {
  commitSha: "a".repeat(40),
  imageRef: "registry.example/image@sha256:" + "b".repeat(64),
  revision: "trial-revision-1",
  workerVersion: "123e4567-e89b-12d3-a456-426614174000",
  previewUrl: "https://trial.workers.dev",
  releaseTag: "v1.2.3",
};

function preparation() {
  return {
    schemaVersion: 1,
    evidenceClass: "actual",
    kind: "preparation",
    identity: structuredClone(identity),
    startup: { ok: true, database: "postgres", auth: "supabase", revision: identity.revision },
    directProtection: { status: 404 },
    worker: { backendUrl: "https://trial-abc-uc.a.run.app", version: identity.workerVersion },
    preflight: { packetDigest: "c".repeat(64) },
  };
}

function game() {
  return {
    schemaVersion: 1,
    evidenceClass: "actual",
    kind: "game",
    identity: structuredClone(identity),
    preparationIdentity: structuredClone(identity),
    google: { provider: "google", ownerUserId: "owner-1", mappingUserId: "owner-1" },
    ownership: { ownerUserId: "owner-1", characterIds: ["char-1", "char-2"] },
    generations: [
      { characterId: "char-1", generationId: "gen-1", digest: "d".repeat(64) },
      { characterId: "char-2", generationId: "gen-2", digest: "e".repeat(64) },
    ],
    battle: {
      id: "battle-1",
      ownerUserId: "owner-1",
      generationIds: ["gen-1", "gen-2"],
      created: true,
      advanced: true,
      sseObserved: true,
      reloaded: true,
      status: "finished",
      resultObserved: true,
      reloadBattleId: "battle-1",
      resultBattleId: "battle-1",
      observations: {
        before: { battleId: "battle-1", battleRevision: 0, turn: 0, status: "active", winnerSide: null, resultDigest: null },
        after: { battleId: "battle-1", battleRevision: 1, turn: 1, status: "finished", winnerSide: "a", resultDigest: "f".repeat(64) },
        reload: { battleId: "battle-1", battleRevision: 1, turn: 1, status: "finished", winnerSide: "a", resultDigest: "f".repeat(64) },
        result: { battleId: "battle-1", battleRevision: 1, turn: 1, status: "finished", winnerSide: "a", resultDigest: "f".repeat(64) },
      },
    },
    media: { used: false, displayed: false },
  };
}

test("accepts complete preparation and game evidence", () => {
  assert.equal(validateV3TrialEvidence(preparation(), "preparation").kind, "preparation");
  assert.equal(validateV3TrialEvidence(game(), "game").kind, "game");
});

test("accepts preparation identity with reordered keys", () => {
  const value = game();
  value.preparationIdentity = {
    releaseTag: identity.releaseTag,
    previewUrl: identity.previewUrl,
    workerVersion: identity.workerVersion,
    revision: identity.revision,
    imageRef: identity.imageRef,
    commitSha: identity.commitSha,
  };
  assert.equal(validateV3TrialEvidence(value, "game").kind, "game");
});

for (const [name, make, mode, mutate] of [
  ["missing evidence", preparation, "preparation", (value) => delete value.preflight],
  ["mixed identity", game, "game", (value) => { value.preparationIdentity.commitSha = "f".repeat(40); }],
  ["different battles", game, "game", (value) => { value.battle.resultBattleId = "battle-2"; }],
  ["different generation", game, "game", (value) => { value.battle.generationIds[1] = "gen-other"; }],
  ["duplicate battle generation IDs", game, "game", (value) => { value.battle.generationIds[1] = "gen-1"; value.generations[1].generationId = "gen-1"; }],
  ["non-progressing battle observation", game, "game", (value) => { value.battle.observations.after.battleRevision = 0; }],
  ["reload observation mismatch", game, "game", (value) => { value.battle.observations.reload.turn = 2; }],
  ["result observation mismatch", game, "game", (value) => { value.battle.observations.result.resultDigest = "a".repeat(64); }],
  ["different mapping", game, "game", (value) => { value.google.mappingUserId = "other-owner"; }],
  ["simulation receipt", game, "game", (value) => { value.evidenceClass = "simulation"; }],
  ["unknown token field", game, "game", (value) => { value.token = "secret"; }],
  ["media mismatch", game, "game", (value) => { value.media = { used: true, displayed: false }; }],
  ["whitespace-only ID", game, "game", (value) => { value.battle.id = "   "; value.battle.reloadBattleId = "   "; value.battle.resultBattleId = "   "; }],
  ["credential in preview URL", preparation, "preparation", (value) => { value.identity.previewUrl = "https://user:secret@trial.workers.dev/"; }],
  ["non-root preview URL", preparation, "preparation", (value) => { value.identity.previewUrl = "https://trial.workers.dev/preview"; }],
  ["query in backend URL", preparation, "preparation", (value) => { value.worker.backendUrl = "https://trial-abc-uc.a.run.app/?token=secret"; }],
]) {
  test(`rejects ${name}`, () => {
    const value = make();
    mutate(value);
    assert.throws(() => validateV3TrialEvidence(value, mode), /invalid|must|expected|unexpected|match|equal|missing|finished/i);
  });
}

test("rejects a mode mismatch", () => {
  assert.throws(() => validateV3TrialEvidence(preparation(), "game"), /kind/);
});

test("CLI rejects extra arguments", () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./verify-v3-trial-evidence.mjs", import.meta.url)),
    "missing.json",
    "--mode",
    "game",
    "extra",
  ], { encoding: "utf8" });
  assert.equal(result.status, 2);
});
