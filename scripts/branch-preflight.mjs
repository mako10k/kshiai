#!/usr/bin/env node

import { execFileSync } from "node:child_process";

function git(args, cwd = process.cwd()) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trimEnd();
}

function usage() {
  console.error("Usage: node scripts/branch-preflight.mjs [--new BRANCH] [--reason JUSTIFICATION]");
  process.exit(2);
}

const args = process.argv.slice(2);
let proposed = null;
let reason = null;
for (let index = 0; index < args.length; index += 2) {
  if (args[index] === "--new" && args[index + 1]) proposed = args[index + 1];
  else if (args[index] === "--reason" && args[index + 1]) reason = args[index + 1];
  else usage();
}
if (reason && !proposed) usage();

const root = git(["rev-parse", "--show-toplevel"]);
const localBranches = new Set(git(["for-each-ref", "--format=%(refname:short)", "refs/heads"], root).split("\n"));
const blocks = git(["worktree", "list", "--porcelain"], root).split(/\n\s*\n/);
const worktrees = blocks.map((block) => {
  const path = block.match(/^worktree (.+)$/m)?.[1];
  const branch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? "(detached)";
  if (!path) throw new Error("Could not parse git worktree list");
  const dirty = git(["status", "--porcelain"], path).length > 0;
  let ahead = null;
  if (branch !== "(detached)") {
    const remote = `refs/remotes/origin/${branch}`;
    try {
      git(["show-ref", "--verify", "--quiet", remote], root);
      ahead = Number(git(["rev-list", "--count", `${remote}..refs/heads/${branch}`], root));
    } catch {
      ahead = null;
    }
  }
  return { path, branch, dirty, ahead };
});

console.log(`Local branches: ${localBranches.size}; worktrees: ${worktrees.length}`);
for (const item of worktrees) {
  const sync = item.ahead === null ? "no matching origin ref" : `${item.ahead} local commit(s) ahead of origin`;
  console.log(`${item.branch}: ${item.path} | ${item.dirty ? "dirty" : "clean"} | ${sync}`);
}

if (!proposed) process.exit(0);

const blockers = [];
if (localBranches.has(proposed)) blockers.push(`branch already exists: ${proposed}`);
if (worktrees.some((item) => item.dirty)) blockers.push("a worktree has uncommitted changes");
if (worktrees.some((item) => item.ahead !== null && item.ahead > 0)) blockers.push("an active branch has unpushed commits");
if (worktrees.some((item) => item.branch !== "(detached)" && item.ahead === null)) {
  blockers.push("an active branch has no matching origin ref");
}
if (worktrees.filter((item) => item.branch !== "main" && item.branch !== "(detached)").length > 1) {
  blockers.push("multiple non-main worktrees are active");
}
if (blockers.length === 0) {
  console.log(`Preflight passed for ${proposed}. Confirm the remote base and current task fit before creation.`);
  process.exit(0);
}
console.error(`New branch ${proposed} requires disposition:`);
for (const blocker of blockers) console.error(`- ${blocker}`);
if (blockers.some((blocker) => blocker.startsWith("branch already exists"))) process.exit(1);
if (!reason) {
  console.error("Reuse or finish existing work first. For a necessary isolated branch, rerun with --reason and record that reason in the task handoff.");
  process.exit(1);
}
console.log(`Exception recorded for this preflight: ${reason}`);
console.log("This command is read-only and does not create a branch or authorize unrelated actions.");
