import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { coerceCharacterSpeech } from "@kshiai/shared";
import { config } from "../config.js";
import {
  CHARACTER_FOCUS_ABLATION_INPUT_REVISION,
  buildCharacterFocusAblationRequests,
  characterFocusAblationProtocolMaterial,
  characterFocusAblationReviewContext,
  type CharacterFocusAblationArm,
  type CharacterFocusAblationProfileId,
} from "../llm/character-focus-ablation.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const RUN_ID = "character-focus-replay-2026-08-13-v1";
const SOURCE_BASELINE_SHA = "9535a3d3090b6e39f465c368d5a23b29da9606d8";
const PROVIDER = "xai";
const BASE_URL = "https://api.x.ai/v1";
const REQUEST_MODEL = "grok-4-fast-non-reasoning";
const EXPECTED_EFFECTIVE_MODEL = "grok-4.3";
const TEMPERATURE = 0.65;
const MAX_COMPLETION_TOKENS = 180;
const TIMEOUT_MS = 30_000;
const CONCURRENCY = 4;
const LOGICAL_CALL_CEILING = 144;
const PHYSICAL_ATTEMPT_CEILING = 160;
const TOTAL_TOKEN_CEILING = 1_000_000;
const MONETARY_CEILING_USD = 1.5;
const INPUT_PRICE_PER_MILLION_USD = 1.25;
const OUTPUT_PRICE_PER_MILLION_USD = 2.5;
const MESSAGE_OVERHEAD_TOKEN_BOUND = 512;
const ACCEPTED_RESPONSE_MODELS = new Set([
  REQUEST_MODEL,
  EXPECTED_EFFECTIVE_MODEL,
]);

type ReplayUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

type ReplayAttempt = {
  attempt: number;
  outputId: string;
  retry: number;
  startedAt: string;
  finishedAt: string | null;
  status: "started" | "succeeded" | "failed";
  httpStatus: number | null;
  responseModel: string | null;
  latencyMs: number | null;
  usage: ReplayUsage;
  errorClass: string | null;
  errorMessage: string | null;
};

type ReplayEntry = {
  outputId: string;
  scenarioCode: string;
  fixtureId: string;
  profileId: CharacterFocusAblationProfileId;
  arm: CharacterFocusAblationArm;
  sample: 1 | 2 | 3;
  replayEffectiveness: "strained" | "steady" | "sharp";
  cueClass: "weak" | "strong" | "none";
  requestDigest: string;
  inputTokenUpperBound: number;
  status: "pending" | "running" | "succeeded" | "failed" | "blocked";
  speech: string | null;
  responseModel: string | null;
  logicalError: string | null;
};

type ReplayState = {
  schemaVersion: 1;
  contractDigest: string;
  protocolDigest: string;
  preparedAt: string;
  completedAt: string | null;
  requests: ReplayEntry[];
  attempts: ReplayAttempt[];
};

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const value = (error as { status?: unknown }).status;
  return typeof value === "number" ? value : null;
}

function safeError(error: unknown): { errorClass: string; errorMessage: string } {
  const errorClass = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  return {
    errorClass: errorClass.slice(0, 120),
    errorMessage: message
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
      .slice(0, 500),
  };
}

function requestTokenUpperBound(system: string, user: string): number {
  return Buffer.byteLength(system, "utf8") +
    Buffer.byteLength(user, "utf8") +
    MESSAGE_OVERHEAD_TOKEN_BOUND +
    MAX_COMPLETION_TOKENS;
}

function upperCostUsd(inputTokenBound: number, outputTokens: number): number {
  const inputOnlyBound = inputTokenBound - outputTokens;
  return inputOnlyBound / 1_000_000 * INPUT_PRICE_PER_MILLION_USD +
    outputTokens / 1_000_000 * OUTPUT_PRICE_PER_MILLION_USD;
}

const protocolMaterial = characterFocusAblationProtocolMaterial();
const protocolDigest = sha256(JSON.stringify(protocolMaterial));
const requests = buildCharacterFocusAblationRequests();
const executionContract = {
  schemaVersion: 1,
  runId: RUN_ID,
  authorizedScope: "synthetic compact-expression ablation only",
  sourceBaselineSha: SOURCE_BASELINE_SHA,
  inputRevision: CHARACTER_FOCUS_ABLATION_INPUT_REVISION,
  protocolDigest,
  provider: PROVIDER,
  baseUrl: BASE_URL,
  requestModel: REQUEST_MODEL,
  expectedEffectiveModel: EXPECTED_EFFECTIVE_MODEL,
  documentedRedirectReasoningEffort: "none",
  api: "chat.completions",
  responseFormat: "json_object",
  temperature: TEMPERATURE,
  maxCompletionTokens: MAX_COMPLETION_TOKENS,
  timeoutMs: TIMEOUT_MS,
  concurrency: CONCURRENCY,
  logicalCallCeiling: LOGICAL_CALL_CEILING,
  physicalAttemptCeiling: PHYSICAL_ATTEMPT_CEILING,
  totalTokenCeiling: TOTAL_TOKEN_CEILING,
  monetaryCeilingUsd: MONETARY_CEILING_USD,
  priceSnapshotUsdPerMillion: {
    input: INPUT_PRICE_PER_MILLION_USD,
    output: OUTPUT_PRICE_PER_MILLION_USD,
    cachedInputDiscountAssumed: false,
  },
  retry: {
    providerFallback: false,
    contentRetry: false,
    samePayloadTransportRetry: "one retry for HTTP 429 or 503 only",
  },
  reviewers: {
    minimumIndependentHumans: 2,
    llmJudge: false,
    armLabelsHiddenUntilScoresFrozen: true,
  },
};
const contractDigest = sha256(JSON.stringify(executionContract));

function initialState(now: string): ReplayState {
  return {
    schemaVersion: 1,
    contractDigest,
    protocolDigest,
    preparedAt: now,
    completedAt: null,
    requests: requests.map((request) => ({
      outputId: request.outputId,
      scenarioCode: request.scenarioCode,
      fixtureId: request.fixtureId,
      profileId: request.profileId,
      arm: request.arm,
      sample: request.sample,
      replayEffectiveness: request.replayEffectiveness,
      cueClass: request.cueClass,
      requestDigest: sha256(`${request.system}\n${request.user}`),
      inputTokenUpperBound: requestTokenUpperBound(request.system, request.user),
      status: "pending",
      speech: null,
      responseModel: null,
      logicalError: null,
    })),
    attempts: [],
  };
}

async function writeAtomic(filePath: string, data: string): Promise<void> {
  const temporary = `${filePath}.tmp`;
  await fs.writeFile(temporary, data, "utf8");
  await fs.rename(temporary, filePath);
}

async function readOrCreateState(
  statePath: string,
  prepareOnly: boolean,
): Promise<ReplayState> {
  try {
    const state = JSON.parse(await fs.readFile(statePath, "utf8")) as ReplayState;
    if (state.contractDigest !== contractDigest || state.protocolDigest !== protocolDigest) {
      throw new Error("Existing replay state belongs to a different frozen contract");
    }
    const ambiguous = state.requests.filter((entry) => entry.status === "running");
    if (ambiguous.length > 0 && !prepareOnly) {
      throw new Error(
        `Ambiguous in-flight attempts require owner disposition; refusing resend: ${ambiguous.map((item) => item.outputId).join(",")}`,
      );
    }
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const state = initialState(new Date().toISOString());
    await writeAtomic(statePath, canonicalJson(state));
    return state;
  }
}

function actualUsage(state: ReplayState): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  complete: boolean;
  costUsd: number;
} {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let complete = true;
  for (const attempt of state.attempts.filter((item) => item.status === "succeeded")) {
    if (
      attempt.usage.inputTokens === null ||
      attempt.usage.outputTokens === null ||
      attempt.usage.totalTokens === null
    ) {
      complete = false;
      continue;
    }
    inputTokens += attempt.usage.inputTokens;
    outputTokens += attempt.usage.outputTokens;
    totalTokens += attempt.usage.totalTokens;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    complete,
    costUsd: inputTokens / 1_000_000 * INPUT_PRICE_PER_MILLION_USD +
      outputTokens / 1_000_000 * OUTPUT_PRICE_PER_MILLION_USD,
  };
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function reviewCsv(state: ReplayState): string {
  const header = [
    "output_id",
    "observer_safety_violation",
    "fresh_evidence_grounding",
    "semantic_response",
    "unsupported_novelty",
    "character_consistency",
    "no_change_restraint",
    "naturalness",
    "notes",
  ];
  const rows = state.requests
    .filter((entry) => entry.status === "succeeded")
    .sort((left, right) => left.outputId.localeCompare(right.outputId))
    .map((entry) => [entry.outputId, "", "", "", "", "", "", "", ""]);
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

async function writeReviewArtifacts(
  outputDir: string,
  state: ReplayState,
): Promise<void> {
  const items = state.requests
    .filter((entry) => entry.status === "succeeded")
    .sort((left, right) => left.outputId.localeCompare(right.outputId))
    .map((entry) => ({
      ...characterFocusAblationReviewContext(entry.outputId),
      speech: entry.speech,
    }));
  const packet = {
    schemaVersion: 1,
    runId: RUN_ID,
    contractDigest,
    blinding: "Arm, focus band, sample number, and provider metadata are omitted.",
    rubric: {
      allowedValues: "1=yes, 0=no, NA=not eligible; observer_safety_violation and unsupported_novelty are adverse when 1",
      fields: {
        observer_safety_violation: "Uses forbidden, hidden, private, or control evidence.",
        fresh_evidence_grounding: "Materially uses the newest perceived evidence rather than generic variety.",
        semantic_response: "Answers the new counterpart move or present result.",
        unsupported_novelty: "Invents a change or fact to appear responsive.",
        character_consistency: "Matches the frozen identity, traits, and speech style.",
        no_change_restraint: "When eligible, avoids fabricating development from no new evidence.",
        naturalness: "Reads as one organic public Japanese line.",
      },
    },
    items,
  };
  const packetJson = canonicalJson(packet);
  const sheet = reviewCsv(state);
  const guide = `# Character-focus blinded human review\n\n` +
    `Review packet SHA-256: \`${sha256(packetJson)}\`\n\n` +
    `Two people must independently copy \`review-sheet-template.csv\`, score every row from \`review-packet.blinded.json\`, and freeze their files before discussion. Use 1/0, or NA only where the packet marks that measure ineligible. Do not open \`run-state.unblinded.json\` until both independent files and any reconciled score set are frozen. An LLM score is not accepted.\n\n` +
    `A transport/content failure is missing data and must not be replaced by a rerun.\n`;
  await writeAtomic(
    path.join(outputDir, "review-packet.blinded.json"),
    packetJson,
  );
  await writeAtomic(
    path.join(outputDir, "review-sheet-template.csv"),
    sheet,
  );
  await writeAtomic(path.join(outputDir, "REVIEW.md"), guide);
}

async function writeReceipt(outputDir: string, state: ReplayState): Promise<void> {
  const usage = actualUsage(state);
  const upperTokenBound = state.requests.reduce(
    (sum, entry) => sum + entry.inputTokenUpperBound,
    0,
  );
  const upperCostBound = state.requests.reduce(
    (sum, entry) => sum + upperCostUsd(
      entry.inputTokenUpperBound,
      MAX_COMPLETION_TOKENS,
    ),
    0,
  );
  const counts = Object.fromEntries(
    ["pending", "running", "succeeded", "failed", "blocked"].map((status) => [
      status,
      state.requests.filter((entry) => entry.status === status).length,
    ]),
  );
  const stateJson = canonicalJson(state);
  const reviewPath = path.join(outputDir, "review-packet.blinded.json");
  const reviewJson = await fs.readFile(reviewPath, "utf8");
  const receipt = {
    schemaVersion: 1,
    executionContract,
    contractDigest,
    protocolDigest,
    preparedAt: state.preparedAt,
    completedAt: state.completedAt,
    logicalCounts: counts,
    physicalAttempts: state.attempts.length,
    ceilings: {
      logicalWithinCeiling: state.requests.length <= LOGICAL_CALL_CEILING,
      physicalWithinCeiling: state.attempts.length <= PHYSICAL_ATTEMPT_CEILING,
      preflightTotalTokenUpperBound: upperTokenBound,
      totalTokenCeiling: TOTAL_TOKEN_CEILING,
      preflightMonetaryUpperBoundUsd: upperCostBound,
      monetaryCeilingUsd: MONETARY_CEILING_USD,
    },
    observedUsage: usage,
    responseModels: [...new Set(
      state.attempts.flatMap((attempt) => attempt.responseModel ? [attempt.responseModel] : []),
    )].sort(),
    artifacts: {
      unblindedStateSha256: sha256(stateJson),
      blindedReviewPacketSha256: sha256(reviewJson),
    },
    acceptanceBoundary:
      "Provider execution and blinded packet preparation only; two independent human reviews remain required before scoring or arm reveal.",
  };
  await writeAtomic(path.join(outputDir, "run-receipt.json"), canonicalJson(receipt));
}

async function executeReplay(
  outputDir: string,
  state: ReplayState,
  statePath: string,
): Promise<void> {
  if (!config.xai.apiKey) throw new Error("XAI_API_KEY is not configured");
  if (config.xai.baseUrl !== BASE_URL) {
    throw new Error(`Frozen xAI base URL mismatch: ${config.xai.baseUrl}`);
  }
  const upperTokenBound = state.requests.reduce(
    (sum, entry) => sum + entry.inputTokenUpperBound,
    0,
  );
  const upperCostBound = state.requests.reduce(
    (sum, entry) => sum + upperCostUsd(
      entry.inputTokenUpperBound,
      MAX_COMPLETION_TOKENS,
    ),
    0,
  );
  if (state.requests.length !== LOGICAL_CALL_CEILING) {
    throw new Error(`Frozen logical call count mismatch: ${state.requests.length}`);
  }
  if (upperTokenBound > TOTAL_TOKEN_CEILING) {
    throw new Error(`Preflight token bound ${upperTokenBound} exceeds ceiling`);
  }
  if (upperCostBound > MONETARY_CEILING_USD) {
    throw new Error(`Preflight cost bound ${upperCostBound} exceeds ceiling`);
  }

  const client = new OpenAI({
    apiKey: config.xai.apiKey,
    baseURL: BASE_URL,
    timeout: TIMEOUT_MS,
    maxRetries: 0,
  });
  let saveChain = Promise.resolve();
  const persist = (): Promise<void> => {
    saveChain = saveChain.then(() =>
      writeAtomic(statePath, canonicalJson(state))
    );
    return saveChain;
  };
  let nextIndex = 0;
  let stop = false;
  const pending = state.requests.filter((entry) => entry.status === "pending");

  const runEntry = async (entry: ReplayEntry): Promise<void> => {
    const request = requests.find((item) => item.outputId === entry.outputId);
    if (!request || sha256(`${request.system}\n${request.user}`) !== entry.requestDigest) {
      throw new Error(`Request material drift for ${entry.outputId}`);
    }
    entry.status = "running";
    await persist();
    for (let retry = 0; retry <= 1; retry += 1) {
      if (state.attempts.length >= PHYSICAL_ATTEMPT_CEILING) {
        entry.status = "blocked";
        entry.logicalError = "physical_attempt_ceiling";
        stop = true;
        await persist();
        return;
      }
      const attempt: ReplayAttempt = {
        attempt: state.attempts.length + 1,
        outputId: entry.outputId,
        retry,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        status: "started",
        httpStatus: null,
        responseModel: null,
        latencyMs: null,
        usage: { inputTokens: null, outputTokens: null, totalTokens: null },
        errorClass: null,
        errorMessage: null,
      };
      state.attempts.push(attempt);
      await persist();
      const started = Date.now();
      try {
        const response = await client.chat.completions.create({
          model: REQUEST_MODEL,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          temperature: TEMPERATURE,
          response_format: { type: "json_object" },
          max_tokens: MAX_COMPLETION_TOKENS,
        });
        attempt.finishedAt = new Date().toISOString();
        attempt.status = "succeeded";
        attempt.responseModel = response.model;
        attempt.latencyMs = Date.now() - started;
        attempt.usage = {
          inputTokens: response.usage?.prompt_tokens ?? null,
          outputTokens: response.usage?.completion_tokens ?? null,
          totalTokens: response.usage?.total_tokens ?? null,
        };
        entry.responseModel = response.model;
        if (!ACCEPTED_RESPONSE_MODELS.has(response.model)) {
          entry.status = "failed";
          entry.logicalError = `unexpected_response_model:${response.model}`;
          stop = true;
          await persist();
          return;
        }
        const content = response.choices[0]?.message?.content ?? "";
        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          entry.status = "failed";
          entry.logicalError = "invalid_json_content";
          await persist();
          return;
        }
        const speechValue = parsed && typeof parsed === "object" && "speech" in parsed
          ? (parsed as { speech?: unknown }).speech
          : null;
        const speech = coerceCharacterSpeech(
          speechValue === null || speechValue === undefined ? null : String(speechValue),
          { foeName: "ユイ" },
        );
        if (!speech) {
          entry.status = "failed";
          entry.logicalError = "missing_speech_content";
          await persist();
          return;
        }
        entry.speech = speech;
        entry.status = "succeeded";
        entry.logicalError = null;
        const usage = actualUsage(state);
        if (
          (usage.complete && usage.totalTokens > TOTAL_TOKEN_CEILING) ||
          (usage.complete && usage.costUsd > MONETARY_CEILING_USD)
        ) {
          stop = true;
          entry.logicalError = "post_response_budget_ceiling";
        }
        await persist();
        if (attempt.attempt % 8 === 0 || entry.outputId === "R144") {
          const succeeded = state.requests.filter((item) => item.status === "succeeded").length;
          const failed = state.requests.filter((item) => item.status === "failed").length;
          console.error(
            `[focus-replay] attempts=${state.attempts.length} succeeded=${succeeded} failed=${failed}`,
          );
        }
        return;
      } catch (error) {
        const status = errorStatus(error);
        const safe = safeError(error);
        attempt.finishedAt = new Date().toISOString();
        attempt.status = "failed";
        attempt.httpStatus = status;
        attempt.latencyMs = Date.now() - started;
        attempt.errorClass = safe.errorClass;
        attempt.errorMessage = safe.errorMessage;
        await persist();
        const retryable = retry === 0 && (status === 429 || status === 503);
        if (retryable && state.attempts.length < PHYSICAL_ATTEMPT_CEILING) {
          await new Promise((resolve) => setTimeout(resolve, status === 429 ? 800 : 400));
          continue;
        }
        entry.status = "failed";
        entry.logicalError = status ? `http_${status}` : "transport_error";
        await persist();
        return;
      }
    }
  };

  const worker = async (): Promise<void> => {
    while (!stop) {
      const index = nextIndex;
      nextIndex += 1;
      const entry = pending[index];
      if (!entry) return;
      await runEntry(entry);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  if (stop) {
    for (const entry of pending) {
      if (entry.status === "pending") {
        entry.status = "blocked";
        entry.logicalError = "run_stopped_at_ceiling";
      }
    }
  }
  state.completedAt = new Date().toISOString();
  await persist();
  await writeReviewArtifacts(outputDir, state);
  await writeReceipt(outputDir, state);
}

function parseArgs(args: string[]): {
  mode: "prepare" | "execute";
  outputDir: string;
} {
  let mode: "prepare" | "execute" | null = null;
  let outputDir = "docs/evidence/character-focus-replay-2026-08-13";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--prepare" || arg === "--execute") {
      if (mode) throw new Error("Choose exactly one of --prepare or --execute");
      mode = arg === "--prepare" ? "prepare" : "execute";
      continue;
    }
    if (arg === "--output-dir") {
      const value = args[index + 1];
      if (!value) throw new Error("--output-dir requires a value");
      outputDir = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!mode) throw new Error("Choose exactly one of --prepare or --execute");
  return { mode, outputDir };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(repositoryRoot, args.outputDir);
  if (!outputDir.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error("Output directory must be inside the repository");
  }
  await fs.mkdir(outputDir, { recursive: true });
  const statePath = path.join(outputDir, "run-state.unblinded.json");
  const state = await readOrCreateState(statePath, args.mode === "prepare");
  const prepared = {
    executionContract,
    contractDigest,
    protocolDigest,
    logicalCalls: state.requests.length,
    preflightTotalTokenUpperBound: state.requests.reduce(
      (sum, entry) => sum + entry.inputTokenUpperBound,
      0,
    ),
    preflightMonetaryUpperBoundUsd: state.requests.reduce(
      (sum, entry) => sum + upperCostUsd(
        entry.inputTokenUpperBound,
        MAX_COMPLETION_TOKENS,
      ),
      0,
    ),
  };
  await writeAtomic(
    path.join(outputDir, "prepared-contract.json"),
    canonicalJson(prepared),
  );
  console.error(
    `[focus-replay] mode=${args.mode} contract=${contractDigest} calls=${state.requests.length} token_bound=${prepared.preflightTotalTokenUpperBound} cost_bound_usd=${prepared.preflightMonetaryUpperBoundUsd.toFixed(6)}`,
  );
  if (args.mode === "prepare") return;
  await executeReplay(outputDir, state, statePath);
}

await main();
