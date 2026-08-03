#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tag = process.argv[2]?.trim();
const match = /^v(\d+\.\d+\.\d+)(?:-rc\.\d+)?$/.exec(tag ?? "");
if (!match) throw new Error("Release tag must match vMAJOR.MINOR.PATCH or vMAJOR.MINOR.PATCH-rc.N");

const expectedVersion = match[1];
const packageFiles = [
  "package.json",
  "backend/package.json",
  "frontend/package.json",
  "packages/shared/package.json",
];
for (const relative of packageFiles) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  if (manifest.version !== expectedVersion) {
    throw new Error(`${relative} has version ${manifest.version}, expected ${expectedVersion}`);
  }
}

const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
for (const workspace of ["", "backend", "frontend", "packages/shared"]) {
  if (lock.packages?.[workspace]?.version !== expectedVersion) {
    throw new Error(`package-lock.json entry ${workspace || "<root>"} does not match ${expectedVersion}`);
  }
}

const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const heading = new RegExp(`^## \\[${expectedVersion.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m");
if (!heading.test(changelog)) {
  throw new Error(`CHANGELOG.md needs a dated ## [${expectedVersion}] release section`);
}

const type = execFileSync("git", ["cat-file", "-t", tag], { cwd: root, encoding: "utf8" }).trim();
if (type !== "tag") throw new Error(`${tag} must be an annotated tag`);
const tagCommit = execFileSync("git", ["rev-list", "-n", "1", tag], {
  cwd: root,
  encoding: "utf8",
}).trim();
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (tagCommit !== head) throw new Error(`${tag} does not point to the checked-out commit`);

console.log(`Verified release ${tag} at ${head}`);
