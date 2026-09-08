#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function selectSingleFullTrafficTarget(entries, percentageKey, identityKey, label) {
  if (!Array.isArray(entries)) {
    throw new Error(`${label} status does not contain traffic entries`);
  }
  const active = entries.filter(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      entry[percentageKey] === 100 &&
      typeof entry[identityKey] === "string" &&
      entry[identityKey].length > 0,
  );
  if (active.length !== 1) {
    throw new Error(`Expected exactly one 100% ${label} target, received ${active.length}`);
  }
  return active[0][identityKey];
}

export function selectActiveCloudRunRevision(service) {
  return selectSingleFullTrafficTarget(
    service?.status?.traffic,
    "percent",
    "revisionName",
    "Cloud Run",
  );
}

export function selectActiveWorkerVersion(deployment) {
  return selectSingleFullTrafficTarget(
    deployment?.versions,
    "percentage",
    "version_id",
    "Worker",
  );
}

async function main() {
  const [kind, path] = process.argv.slice(2);
  if (!path || !["cloud-run", "worker"].includes(kind)) {
    throw new Error(
      "Usage: select-release-rollback-target.mjs cloud-run|worker STATUS_JSON",
    );
  }
  const status = JSON.parse(await readFile(path, "utf8"));
  const target =
    kind === "cloud-run"
      ? selectActiveCloudRunRevision(status)
      : selectActiveWorkerVersion(status);
  process.stdout.write(target);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
