#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exceptionPath = path.join(root, "config/npm-audit-exceptions.json");
const configured = JSON.parse(fs.readFileSync(exceptionPath, "utf8"));
const today = new Date().toISOString().slice(0, 10);
const exceptions = new Map();

for (const entry of configured.exceptions ?? []) {
  if (!Number.isInteger(entry.source) || !entry.package || !entry.expires || !entry.reason) {
    throw new Error("Every npm audit exception requires source, package, expires, and reason");
  }
  if (entry.expires < today) {
    throw new Error(`npm audit exception ${entry.source} expired on ${entry.expires}`);
  }
  if (exceptions.has(entry.source)) {
    throw new Error(`Duplicate npm audit exception: ${entry.source}`);
  }
  exceptions.set(entry.source, entry);
}

const audit = spawnSync("npm", ["audit", "--json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
if (!audit.stdout) {
  process.stderr.write(audit.stderr || "npm audit produced no JSON output\n");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  process.stderr.write(audit.stderr || audit.stdout);
  process.exit(1);
}

const advisories = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via === "object" && Number.isInteger(via.source)) {
      advisories.set(via.source, via);
    }
  }
}

const unaccepted = [...advisories.values()].filter((advisory) => {
  const exception = exceptions.get(advisory.source);
  return !exception || exception.package !== advisory.name;
});
const unused = [...exceptions.keys()].filter((source) => !advisories.has(source));

for (const advisory of advisories.values()) {
  const exception = exceptions.get(advisory.source);
  if (exception?.package === advisory.name) {
    console.log(
      `Accepted until ${exception.expires}: ${advisory.name} ${advisory.source} (${advisory.severity})`,
    );
  }
}

if (unused.length > 0) {
  console.error(`Remove resolved npm audit exceptions: ${unused.join(", ")}`);
}
if (unaccepted.length > 0) {
  for (const advisory of unaccepted) {
    console.error(
      `Unaccepted npm advisory: ${advisory.name} ${advisory.source} (${advisory.severity}) ${advisory.title}`,
    );
  }
}
if (unused.length > 0 || unaccepted.length > 0) process.exit(1);

console.log(
  advisories.size === 0
    ? "npm audit found no advisories"
    : `npm audit passed with ${advisories.size} time-bounded exception(s)`,
);
