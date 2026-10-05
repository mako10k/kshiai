#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// R: Validate the strict, credential-free consistency contract for a V3 trial receipt.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const IMAGE = /^\S+@sha256:[0-9a-f]{64}$/;
const RELEASE = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function object(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "expected an object");
  return value;
}

function exactKeys(value, expected, path) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(path, `unexpected or missing field (expected ${wanted.join(", ")})`);
  }
}

function string(value, path, pattern = null) {
  if (typeof value !== "string" || value.trim().length === 0) fail(path, "expected a non-empty string");
  if (pattern && !pattern.test(value)) fail(path, "has an invalid format");
  return value;
}

function boolean(value, path) {
  if (typeof value !== "boolean") fail(path, "expected a boolean");
  return value;
}

function url(value, path, hostnameSuffix) {
  string(value, path);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(path, "expected an absolute URL");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(hostnameSuffix) || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
    fail(path, `expected an HTTPS URL on ${hostnameSuffix}`);
  }
  return value;
}

function identity(value, path = "identity") {
  object(value, path);
  exactKeys(value, ["commitSha", "imageRef", "revision", "workerVersion", "previewUrl", "releaseTag"], path);
  string(value.commitSha, `${path}.commitSha`, COMMIT);
  string(value.imageRef, `${path}.imageRef`, IMAGE);
  string(value.revision, `${path}.revision`);
  string(value.workerVersion, `${path}.workerVersion`, UUID);
  url(value.previewUrl, `${path}.previewUrl`, ".workers.dev");
  string(value.releaseTag, `${path}.releaseTag`, RELEASE);
  return value;
}

function equalJson(left, right, path) {
  const fields = ["commitSha", "imageRef", "revision", "workerVersion", "previewUrl", "releaseTag"];
  if (fields.some((field) => left[field] !== right[field])) fail(path, "does not match the preparation identity");
}

function battleObservation(value, path, expectedStatus) {
  object(value, path);
  exactKeys(value, ["battleId", "battleRevision", "turn", "status", "winnerSide", "resultDigest"], path);
  string(value.battleId, `${path}.battleId`);
  if (!Number.isSafeInteger(value.battleRevision) || value.battleRevision < 0) fail(`${path}.battleRevision`, "must be a nonnegative safe integer");
  if (!Number.isSafeInteger(value.turn) || value.turn < 0) fail(`${path}.turn`, "must be a nonnegative safe integer");
  if (value.status !== "active" && value.status !== "finished") fail(`${path}.status`, "must be active or finished");
  if (value.status !== expectedStatus) fail(`${path}.status`, `must be ${expectedStatus}`);
  if (value.winnerSide !== null && value.winnerSide !== "a" && value.winnerSide !== "b" && value.winnerSide !== "draw") fail(`${path}.winnerSide`, "must be null, a, b, or draw");
  if (value.status === "active") {
    if (value.winnerSide !== null || value.resultDigest !== null) fail(path, "active observations must have null winnerSide and resultDigest");
  } else {
    // BattleState permits nullable winnerSide globally, but every engine finish path records a winner.
    if (value.winnerSide === null) fail(`${path}.winnerSide`, "must be a, b, or draw when finished");
    string(value.resultDigest, `${path}.resultDigest`, SHA256);
  }
  return value;
}

function preparation(value) {
  exactKeys(value, ["schemaVersion", "evidenceClass", "kind", "identity", "startup", "directProtection", "worker", "preflight"], "root");
  identity(value.identity);

  object(value.startup, "startup");
  exactKeys(value.startup, ["ok", "database", "auth", "revision"], "startup");
  if (value.startup.ok !== true) fail("startup.ok", "must be true");
  if (value.startup.database !== "postgres") fail("startup.database", "must be postgres");
  if (value.startup.auth !== "supabase") fail("startup.auth", "must be supabase");
  string(value.startup.revision, "startup.revision");
  if (value.startup.revision !== value.identity.revision) fail("startup.revision", "must equal identity.revision");

  object(value.directProtection, "directProtection");
  exactKeys(value.directProtection, ["status"], "directProtection");
  if (value.directProtection.status !== 404) fail("directProtection.status", "must be 404");

  object(value.worker, "worker");
  exactKeys(value.worker, ["backendUrl", "version"], "worker");
  url(value.worker.backendUrl, "worker.backendUrl", ".run.app");
  string(value.worker.version, "worker.version", UUID);
  if (value.worker.version !== value.identity.workerVersion) fail("worker.version", "must equal identity.workerVersion");

  object(value.preflight, "preflight");
  exactKeys(value.preflight, ["packetDigest"], "preflight");
  string(value.preflight.packetDigest, "preflight.packetDigest", SHA256);
  return value;
}

function game(value) {
  exactKeys(value, ["schemaVersion", "evidenceClass", "kind", "identity", "preparationIdentity", "google", "ownership", "generations", "battle", "media"], "root");
  identity(value.identity);
  identity(value.preparationIdentity, "preparationIdentity");
  equalJson(value.preparationIdentity, value.identity, "preparationIdentity");

  object(value.google, "google");
  exactKeys(value.google, ["provider", "ownerUserId", "mappingUserId"], "google");
  if (value.google.provider !== "google") fail("google.provider", "must be google");
  string(value.google.ownerUserId, "google.ownerUserId");
  string(value.google.mappingUserId, "google.mappingUserId");
  if (value.google.mappingUserId !== value.google.ownerUserId) fail("google.mappingUserId", "must equal google.ownerUserId");

  object(value.ownership, "ownership");
  exactKeys(value.ownership, ["ownerUserId", "characterIds"], "ownership");
  string(value.ownership.ownerUserId, "ownership.ownerUserId");
  if (value.ownership.ownerUserId !== value.google.ownerUserId) fail("ownership.ownerUserId", "must equal google.ownerUserId");
  if (!Array.isArray(value.ownership.characterIds) || value.ownership.characterIds.length !== 2) fail("ownership.characterIds", "must contain exactly two characters");
  value.ownership.characterIds.forEach((id, index) => string(id, `ownership.characterIds[${index}]`));
  if (value.ownership.characterIds[0] === value.ownership.characterIds[1]) fail("ownership.characterIds", "must contain distinct characters");

  if (!Array.isArray(value.generations) || value.generations.length !== 2) fail("generations", "must contain exactly two generations");
  value.generations.forEach((generation, index) => {
    const path = `generations[${index}]`;
    object(generation, path);
    exactKeys(generation, ["characterId", "generationId", "digest"], path);
    string(generation.characterId, `${path}.characterId`);
    string(generation.generationId, `${path}.generationId`);
    string(generation.digest, `${path}.digest`, SHA256);
    if (generation.characterId !== value.ownership.characterIds[index]) fail(`${path}.characterId`, "must match ownership character at the same position");
  });
  if (value.generations[0].characterId === value.generations[1].characterId) fail("generations", "must contain distinct characters");

  object(value.battle, "battle");
  exactKeys(value.battle, ["id", "ownerUserId", "generationIds", "created", "advanced", "sseObserved", "reloaded", "status", "resultObserved", "reloadBattleId", "resultBattleId", "observations"], "battle");
  string(value.battle.id, "battle.id");
  string(value.battle.ownerUserId, "battle.ownerUserId");
  if (value.battle.ownerUserId !== value.google.ownerUserId) fail("battle.ownerUserId", "must equal google.ownerUserId");
  if (!Array.isArray(value.battle.generationIds) || value.battle.generationIds.length !== 2) fail("battle.generationIds", "must contain exactly two IDs");
  const generationIds = value.generations.map(({ generationId }) => generationId);
  if (JSON.stringify(value.battle.generationIds) !== JSON.stringify(generationIds)) fail("battle.generationIds", "must match the two generation IDs in order");
  if (value.battle.generationIds[0] === value.battle.generationIds[1]) fail("battle.generationIds", "must contain distinct IDs");
  for (const field of ["created", "advanced", "sseObserved", "reloaded", "resultObserved"]) boolean(value.battle[field], `battle.${field}`);
  if (value.battle.created !== true || value.battle.advanced !== true || value.battle.sseObserved !== true || value.battle.reloaded !== true || value.battle.resultObserved !== true) fail("battle", "must contain a completed observed lifecycle");
  if (value.battle.status !== "finished") fail("battle.status", "must be finished");
  string(value.battle.reloadBattleId, "battle.reloadBattleId");
  string(value.battle.resultBattleId, "battle.resultBattleId");
  if (value.battle.reloadBattleId !== value.battle.id) fail("battle.reloadBattleId", "must equal battle.id");
  if (value.battle.resultBattleId !== value.battle.id) fail("battle.resultBattleId", "must equal battle.id");
  object(value.battle.observations, "battle.observations");
  exactKeys(value.battle.observations, ["before", "after", "reload", "result"], "battle.observations");
  const before = battleObservation(value.battle.observations.before, "battle.observations.before", "active");
  const after = battleObservation(value.battle.observations.after, "battle.observations.after", "finished");
  const reload = battleObservation(value.battle.observations.reload, "battle.observations.reload", "finished");
  const result = battleObservation(value.battle.observations.result, "battle.observations.result", "finished");
  for (const [name, observation] of Object.entries({ before, after, reload, result })) {
    if (observation.battleId !== value.battle.id) fail(`battle.observations.${name}.battleId`, "must equal battle.id");
  }
  if (after.battleRevision <= before.battleRevision) fail("battle.observations.after.battleRevision", "must be greater than before.battleRevision");
  if (after.turn < before.turn) fail("battle.observations.after.turn", "must not be less than before.turn");
  for (const name of ["reload", "result"]) {
    const observation = value.battle.observations[name];
    for (const field of ["battleRevision", "turn", "winnerSide", "resultDigest"]) {
      if (observation[field] !== after[field]) fail(`battle.observations.${name}.${field}`, `must match after.${field}`);
    }
  }

  object(value.media, "media");
  exactKeys(value.media, ["used", "displayed"], "media");
  boolean(value.media.used, "media.used");
  boolean(value.media.displayed, "media.displayed");
  if (value.media.displayed !== value.media.used) fail("media.displayed", "must equal media.used");
  return value;
}

export function validateV3TrialEvidence(value, mode) {
  if (mode !== "preparation" && mode !== "game") fail("mode", "must be preparation or game");
  object(value, "root");
  if (value.schemaVersion !== 1) fail("schemaVersion", "must be 1");
  if (value.evidenceClass !== "actual") fail("evidenceClass", "must be actual; simulated evidence is rejected");
  if (value.kind !== mode) fail("kind", `must be ${mode}`);
  return mode === "preparation" ? preparation(value) : game(value);
}

function usage() {
  console.error("Usage: node scripts/verify-v3-trial-evidence.mjs FILE --mode preparation|game");
  process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const [file, modeFlag, mode] = args;
  if (args.length !== 3 || !file || modeFlag !== "--mode" || !mode) {
    usage();
  } else {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      validateV3TrialEvidence(parsed, mode);
      console.log(`valid ${mode} evidence`);
    } catch (error) {
      console.error(`invalid evidence: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}
