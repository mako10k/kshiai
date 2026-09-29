// R: Identify exact historical ADR snapshots exempt from current DSL rules.
import { createHash } from "node:crypto";

const historicalExceptions = new Map([
  ["0015-e2e-operator-session-reentry.think", {
    status: "Accepted",
    sourceSha256: "85470fd2ce9db4ec6b832d2c550c77ced689e5fbaa611f2aeaa06f21cbb8d9b5",
    markdownSha256: "192f4b12763e91531fad86922a8609ae1d3dd306b5e24326875fa2e02fa7d8b3",
    reason: "Pre-DSL Accepted record; current syntax and OWNER_ACCEPTANCE markers are absent",
  }],
  ["0016-scene-beats-batched-narration.think", {
    status: "Accepted",
    sourceSha256: "a51c9a49cc64150a98063ee190b5066d88b56975107f16e111ec3b57372e7d65",
    markdownSha256: "d58cf83b157d478ff788c4af80a9551c6e17cbc27313a5c036beb7f391bc8aca",
    reason: "Pre-DSL Accepted record; current syntax and OWNER_ACCEPTANCE markers are absent",
  }],
  ["0017-public-turn-intra-turn-beats.think", {
    status: "Accepted",
    sourceSha256: "81e742113703e82d48c863e6fe15a09827614e39fb526a62ae0f82dc1d599a7b",
    markdownSha256: "fd317b9d85471f6412e2d15c27d6b9ffd590d19a6e9efa75814fdad271f11877",
    reason: "Pre-DSL Accepted record; current syntax and OWNER_ACCEPTANCE markers are absent",
  }],
  ["0019-observation-token-and-cost-admission.think", {
    status: "Proposed",
    sourceSha256: "70d681fa10a08cce8cdb3fb998c8e3ce3090d16135edf301165b6d3c59195a04",
    markdownSha256: "7aaea17cf1d4a227a591bb9c123e339c1bc8747cdfd84a59d30275689be0ec30",
    reason: "Historical Proposed record; legacy premise syntax and acceptance markers predate current checker",
  }],
]);

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

export function classifyHistoricalAdr(name, source, markdown, status) {
  const entry = historicalExceptions.get(name);
  if (!entry) return { kind: "ordinary" };

  if (
    status !== entry.status ||
    sha256(source) !== entry.sourceSha256 ||
    sha256(markdown) !== entry.markdownSha256
  ) {
    return {
      kind: "changed",
      reason: "Historical ADR snapshot changed; review and remove or update its explicit exception",
    };
  }

  return { kind: "historical", reason: entry.reason };
}
