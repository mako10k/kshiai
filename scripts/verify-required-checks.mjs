#!/usr/bin/env node

const repository = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
const token = process.env.GITHUB_TOKEN;
if (!repository || !sha || !token) {
  throw new Error("GITHUB_REPOSITORY, GITHUB_SHA, and GITHUB_TOKEN are required");
}

const response = await fetch(
  `https://api.github.com/repos/${repository}/commits/${sha}/check-runs?per_page=100`,
  {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  },
);
if (!response.ok) throw new Error(`GitHub check-runs request failed: ${response.status}`);
const body = await response.json();
const required = ["validate", "security", "backend-image", "worker"];
const failures = [];
for (const name of required) {
  const runs = body.check_runs?.filter((run) => run.name === name) ?? [];
  if (!runs.some((run) => run.status === "completed" && run.conclusion === "success")) {
    failures.push(name);
  }
}
if (failures.length > 0) {
  throw new Error(`Required checks have no successful run on ${sha}: ${failures.join(", ")}`);
}
console.log(`Required checks passed on ${sha}: ${required.join(", ")}`);
