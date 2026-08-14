import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const adrDirectory = join(repositoryRoot, "docs", "adr");
const canonicalFiles = readdirSync(adrDirectory)
  .filter((name) => /^\d{4}-.+\.think$/.test(name))
  .filter((name) => Number.parseInt(name.slice(0, 4), 10) >= 15)
  .sort();

if (canonicalFiles.length === 0) {
  throw new Error("No canonical ADR .think files were found");
}

const failures = [];

for (const name of canonicalFiles) {
  const thinkPath = join(adrDirectory, name);
  const markdownPath = thinkPath.replace(/\.think$/, ".md");
  const relativeThinkPath = `docs/adr/${name}`;

  if (!existsSync(markdownPath)) {
    failures.push(`${relativeThinkPath}: same-basename Markdown projection is missing`);
    continue;
  }

  const source = readFileSync(thinkPath, "utf8");
  const markdown = readFileSync(markdownPath, "utf8");
  const status = markdown.match(/^- Status: (Proposed|Accepted|Rejected|Superseded|Deprecated)$/m)?.[1];

  if (!status) {
    failures.push(`${relativeThinkPath}: Markdown projection has no recognized Status`);
  }

  const hasOwnerAcceptance = /^evidence OWNER_ACCEPTANCE:/m.test(source);
  const hasAcceptanceDecision = /^decision ACCEPTANCE based_on\b/m.test(source);
  const hasPendingAcceptance = /^pending OWNER_ACCEPTANCE:/m.test(source);

  if (status === "Accepted" && (!hasOwnerAcceptance || !hasAcceptanceDecision || hasPendingAcceptance)) {
    failures.push(`${relativeThinkPath}: Accepted requires OWNER_ACCEPTANCE evidence and ACCEPTANCE decision without pending acceptance`);
  }
  if (status === "Proposed" && (!hasPendingAcceptance || hasAcceptanceDecision)) {
    failures.push(`${relativeThinkPath}: Proposed requires pending OWNER_ACCEPTANCE and no ACCEPTANCE decision`);
  }

  const audit = spawnSync(
    "llmthink",
    ["dsl", "audit", relativeThinkPath, "--pretty", "--limit", "1000", "--min-severity", "warning"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );

  if (audit.error) {
    failures.push(`${relativeThinkPath}: failed to start llmthink: ${audit.error.message}`);
    continue;
  }

  const output = `${audit.stdout ?? ""}${audit.stderr ?? ""}`;
  const summary = output.match(/summary: fatal=(\d+) error=(\d+) warning=(\d+)/);
  if (audit.status !== 0 || !summary) {
    failures.push(`${relativeThinkPath}: llmthink did not return a recognized audit summary\n${output.trim()}`);
    continue;
  }

  const [, fatalCount, errorCount, warningCount] = summary.map(Number);
  if (fatalCount > 0 || errorCount > 0 || warningCount > 0) {
    failures.push(`${relativeThinkPath}: llmthink audit failed\n${output.trim()}`);
    continue;
  }

  console.log(`${relativeThinkPath}: LLMTHINK audit clean; projection status=${status}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n\n"));
  process.exitCode = 1;
} else {
  console.log(`ADR checks passed for ${canonicalFiles.length} canonical file(s)`);
}
