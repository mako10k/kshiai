import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateCharacterRevisionScopeCandidateV1,
  type CharacterRevisionScopeEvaluationV1,
  type CharacterRevisionScopeExpectationV1,
} from "../services/semantic-authoring/revision-scope-evaluation.js";
import {
  REVISION_SCOPE_OLLAMA_REPLAY_CONTRACT_V1,
  REVISION_SCOPE_SYSTEM_PROMPT_JA_V1,
  REVISION_SCOPE_SYSTEM_PROMPT_JA_FEW_SHOT_V1,
  REVISION_SCOPE_SYSTEM_PROMPT_V1,
  callRevisionScopeOllamaV1,
  revisionScopeOllamaFormatV1,
} from "../services/semantic-authoring/revision-scope-ollama.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const argumentsList = process.argv.slice(2);
const japanesePrompt = argumentsList.includes("--japanese-prompt");
const japaneseFewShot = argumentsList.includes("--japanese-few-shot");
if (argumentsList.some((argument) =>
  argument !== "--japanese-prompt" && argument !== "--japanese-few-shot") ||
  (japanesePrompt && japaneseFewShot)) {
  throw new Error("Use no arguments, --japanese-prompt, or --japanese-few-shot");
}
const runId = japaneseFewShot
  ? "character-revision-scope-ollama-2026-09-16-v3-ja-few-shot"
  : japanesePrompt
    ? "character-revision-scope-ollama-2026-09-16-v2-ja-prompt"
    : "character-revision-scope-ollama-2026-09-16-v1";
const outputDirectory = join(repositoryRoot, "docs/evidence", runId);
const systemPrompt = japaneseFewShot
  ? REVISION_SCOPE_SYSTEM_PROMPT_JA_FEW_SHOT_V1
  : japanesePrompt
    ? REVISION_SCOPE_SYSTEM_PROMPT_JA_V1
    : REVISION_SCOPE_SYSTEM_PROMPT_V1;

type ReplayCase = Readonly<{
  caseId: string;
  origin: "existing-test" | "controlled-synthetic";
  request: string;
  expectation: CharacterRevisionScopeExpectationV1;
}>;

const cases: readonly ReplayCase[] = [
  {
    caseId: "appearance-existing",
    origin: "existing-test",
    request: "外套を青に変更",
    expectation: { kind: "resolved", clusters: ["appearance"] },
  },
  {
    caseId: "mechanics-action-norm",
    origin: "controlled-synthetic",
    request: "戦闘では相手の隙を待ってから反撃するようにして",
    expectation: { kind: "resolved", clusters: ["mechanics"] },
  },
  {
    caseId: "relationship-expression-speech",
    origin: "controlled-synthetic",
    request: "口調を丁寧にして、相手を『あなた』と呼ぶようにして",
    expectation: { kind: "resolved", clusters: ["relationship-expression"] },
  },
  {
    caseId: "skeleton-display-name",
    origin: "controlled-synthetic",
    request: "表示名をナギに変更",
    expectation: { kind: "resolved", clusters: ["skeleton"] },
  },
  {
    caseId: "cross-mechanics-expression",
    origin: "controlled-synthetic",
    request: "戦い方を荒々しくし、口調もぶっきらぼうに",
    expectation: { kind: "resolved", clusters: ["mechanics", "relationship-expression"] },
  },
  {
    caseId: "cross-skeleton-appearance",
    origin: "controlled-synthetic",
    request: "表示名をナギに変え、外套を白にして",
    expectation: { kind: "resolved", clusters: ["skeleton", "appearance"] },
  },
  {
    caseId: "material-ambiguity",
    origin: "controlled-synthetic",
    request: "もっと鋭い感じにして",
    expectation: {
      kind: "ambiguous",
      alternativeScopes: [["appearance"], ["mechanics"]],
    },
  },
  {
    caseId: "negative-mechanics-mention",
    origin: "controlled-synthetic",
    request: "外套を赤にして。戦い方は変えない",
    expectation: { kind: "resolved", clusters: ["appearance"] },
  },
];

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function writeNew(name: string, value: unknown): Promise<void> {
  await writeFile(join(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

function safeError(error: unknown): Readonly<{ name: string; message: string }> {
  return {
    name: (error instanceof Error ? error.name : "UnknownError").slice(0, 120),
    message: (error instanceof Error ? error.message : String(error))
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
      .slice(0, 800),
  };
}

function passed(
  expectation: CharacterRevisionScopeExpectationV1,
  evaluation: CharacterRevisionScopeEvaluationV1,
): boolean {
  if (expectation.kind === "ambiguous") return evaluation.outcome === "ambiguous";
  return evaluation.outcome === (expectation.clusters.length === 1
    ? "single_cluster"
    : "cross_cluster");
}

function replayContract(format: ReturnType<typeof revisionScopeOllamaFormatV1>) {
  return {
    schema: "character-revision-scope-ollama-replay-contract-v1",
    runId,
    scope: "Local non-production revision-scope classification only.",
    provider: "ollama-local",
    ...REVISION_SCOPE_OLLAMA_REPLAY_CONTRACT_V1,
    serial: true,
    retry: false,
    fallback: false,
    credentials: false,
    databaseWrites: false,
    publicRouteConnection: false,
    productionConfigurationChange: false,
    systemPrompt,
    changedFactorFromV1: japaneseFewShot
      ? "japanese-system-prompt-with-disjoint-demonstrations"
      : japanesePrompt ? "system-prompt-language-only" : null,
    format,
    corpus: cases,
    limitations: [
      "The corpus is small and mostly synthetic.",
      "The local 3B model is not production-provider evidence.",
      "This run does not authorize route connection, budget changes, or product acceptance.",
    ],
  };
}

async function main(): Promise<void> {
  if (cases.length !== REVISION_SCOPE_OLLAMA_REPLAY_CONTRACT_V1.maxRequests) {
    throw new Error("REVISION_SCOPE_REPLAY_CASE_COUNT_DRIFT");
  }
  await mkdir(outputDirectory);
  const format = revisionScopeOllamaFormatV1();
  const contract = replayContract(format);
  await writeNew("00-contract.json", {
    ...contract,
    contractDigestSha256: digest(contract),
    startedAt: new Date().toISOString(),
  });

  const results: Array<Readonly<{
    caseId: string;
    passed: boolean;
    evaluation: CharacterRevisionScopeEvaluationV1 | null;
    inputTokens: number;
    outputTokens: number;
    elapsedMs: number;
    error: ReturnType<typeof safeError> | null;
  }>> = [];

  for (const [index, replayCase] of cases.entries()) {
    let result: (typeof results)[number];
    try {
      const receipt = await callRevisionScopeOllamaV1({
        request: replayCase.request,
        systemPrompt,
      });
      const evaluation = evaluateCharacterRevisionScopeCandidateV1({
        request: replayCase.request,
        expectation: replayCase.expectation,
        candidate: receipt.candidate,
      });
      result = {
        caseId: replayCase.caseId,
        passed: passed(replayCase.expectation, evaluation),
        evaluation,
        inputTokens: receipt.inputTokens,
        outputTokens: receipt.outputTokens,
        elapsedMs: receipt.elapsedMs,
        error: null,
      };
      await writeNew(`${String(index + 1).padStart(2, "0")}-${replayCase.caseId}.json`, {
        schema: "character-revision-scope-ollama-case-v1",
        runId,
        case: replayCase,
        candidate: receipt.candidate,
        rawContent: receipt.rawContent,
        validationIssues: receipt.validationIssues,
        evaluation,
        passed: result.passed,
        accounting: {
          inputTokens: receipt.inputTokens,
          outputTokens: receipt.outputTokens,
          elapsedMs: receipt.elapsedMs,
          providerDurationNs: receipt.providerDurationNs,
          estimatedCostUsd: 0,
        },
      });
    } catch (error) {
      result = {
        caseId: replayCase.caseId,
        passed: false,
        evaluation: null,
        inputTokens: 0,
        outputTokens: 0,
        elapsedMs: 0,
        error: safeError(error),
      };
      await writeNew(`${String(index + 1).padStart(2, "0")}-${replayCase.caseId}.json`, {
        schema: "character-revision-scope-ollama-case-v1",
        runId,
        case: replayCase,
        passed: false,
        error: result.error,
        retryPerformed: false,
      });
    }
    results.push(result);
  }

  const summary = {
    schema: "character-revision-scope-ollama-replay-summary-v1",
    runId,
    completedAt: new Date().toISOString(),
    requestsAttempted: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    inputTokens: results.reduce((sum, result) => sum + result.inputTokens, 0),
    outputTokens: results.reduce((sum, result) => sum + result.outputTokens, 0),
    elapsedMs: results.reduce((sum, result) => sum + result.elapsedMs, 0),
    results,
    conclusionBoundary: "Development experiment only; no production or product acceptance claim.",
  };
  await writeNew("99-summary.json", summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(`Revision-scope local replay stopped: ${safeError(error).message}. No automatic retry.`);
  process.exitCode = 1;
});
