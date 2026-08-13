import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { config } from "../config.js";
import {
  NARRATOR_PRESENTATION_FOCUS_INPUT_REVISION,
  buildNarratorPresentationFocusRequests,
  narratorPresentationFocusProtocolMaterial,
  narratorPresentationFocusReviewContext,
  type NarratorPresentationFocusArm,
} from "../llm/narrator-presentation-focus-evaluation.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const RUN_ID = "narrator-presentation-focus-pilot-2026-08-13-v1";
const PROVIDER = "xai";
const BASE_URL = "https://api.x.ai/v1";
const REQUEST_MODEL = "grok-4.3";
const REASONING_EFFORT =
  "none" as ChatCompletionCreateParamsNonStreaming["reasoning_effort"];
const TEMPERATURE = 0.9;
const MAX_COMPLETION_TOKENS = 260;
const TIMEOUT_MS = 30_000;
const CONCURRENCY = 2;
const LOGICAL_CALL_CEILING = 16;
const PHYSICAL_ATTEMPT_CEILING = 20;
const TOTAL_TOKEN_CEILING = 200_000;
const MONETARY_CEILING_USD = 0.25;
const INPUT_PRICE_PER_MILLION_USD = 1.25;
const OUTPUT_PRICE_PER_MILLION_USD = 2.5;
const MESSAGE_OVERHEAD_TOKEN_BOUND = 512;

type PilotUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

type PilotAttempt = {
  attempt: number;
  outputId: string;
  retry: number;
  startedAt: string;
  finishedAt: string | null;
  status: "started" | "succeeded" | "failed";
  httpStatus: number | null;
  responseModel: string | null;
  latencyMs: number | null;
  usage: PilotUsage;
  errorClass: string | null;
  errorMessage: string | null;
};

type PilotNarration = {
  narrator: string[];
  speeches: Array<{
    sourceSide: "a" | "b" | null;
    speaker: string;
    text: string;
  }>;
};

type PilotEntry = {
  outputId: string;
  scenarioCode: string;
  arm: NarratorPresentationFocusArm;
  sample: 1;
  requestDigest: string;
  inputTokenUpperBound: number;
  status: "pending" | "running" | "succeeded" | "failed" | "blocked";
  narration: PilotNarration | null;
  responseModel: string | null;
  logicalError: string | null;
};

type PilotState = {
  schemaVersion: 1;
  contractDigest: string;
  protocolDigest: string;
  preparedAt: string;
  completedAt: string | null;
  requests: PilotEntry[];
  attempts: PilotAttempt[];
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

function upperCostUsd(inputTokenBound: number): number {
  const inputOnlyBound = inputTokenBound - MAX_COMPLETION_TOKENS;
  return inputOnlyBound / 1_000_000 * INPUT_PRICE_PER_MILLION_USD +
    MAX_COMPLETION_TOKENS / 1_000_000 * OUTPUT_PRICE_PER_MILLION_USD;
}

const protocolMaterial = narratorPresentationFocusProtocolMaterial();
const protocolDigest = sha256(JSON.stringify(protocolMaterial));
const requests = buildNarratorPresentationFocusRequests();
const executionContract = {
  schemaVersion: 1,
  runId: RUN_ID,
  authorizedScope: "synthetic narrator presentation-focus pilot only",
  inputRevision: NARRATOR_PRESENTATION_FOCUS_INPUT_REVISION,
  protocolDigest,
  provider: PROVIDER,
  baseUrl: BASE_URL,
  requestModel: REQUEST_MODEL,
  reasoningEffort: "none",
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
    verifiedAt: "2026-08-13",
    source: "https://docs.x.ai/developers/models/grok-4.3",
  },
  retry: {
    providerFallback: false,
    contentRetry: false,
    samePayloadTransportRetry: "one retry for HTTP 429 or 503 only",
  },
  evaluationBoundary: {
    exploratory: true,
    armLabelsHiddenInReviewPacket: true,
    semanticReviewerClass: "not selected by this run",
    productAdoptionAuthorized: false,
  },
};
const contractDigest = sha256(JSON.stringify(executionContract));

function initialState(now: string): PilotState {
  return {
    schemaVersion: 1,
    contractDigest,
    protocolDigest,
    preparedAt: now,
    completedAt: null,
    requests: requests.map((request) => ({
      outputId: request.outputId,
      scenarioCode: request.scenarioCode,
      arm: request.arm,
      sample: request.sample,
      requestDigest: sha256(`${request.system}\n${request.user}`),
      inputTokenUpperBound: requestTokenUpperBound(request.system, request.user),
      status: "pending",
      narration: null,
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
): Promise<PilotState> {
  try {
    const state = JSON.parse(await fs.readFile(statePath, "utf8")) as PilotState;
    if (state.contractDigest !== contractDigest || state.protocolDigest !== protocolDigest) {
      throw new Error("Existing pilot state belongs to a different frozen contract");
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

function actualUsage(state: PilotState): {
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

function parseNarration(content: string): PilotNarration | null {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.narrator)) return null;
  const narrator = row.narrator
    .map((line) => String(line).trim())
    .filter(Boolean)
    .slice(0, 4);
  if (narrator.length === 0) return null;
  const speeches = Array.isArray(row.speeches)
    ? row.speeches.slice(0, 8).flatMap((speech) => {
        if (!speech || typeof speech !== "object") return [];
        const candidate = speech as Record<string, unknown>;
        const sourceSide: "a" | "b" | null =
          candidate.sourceSide === "a" || candidate.sourceSide === "b"
          ? candidate.sourceSide
          : null;
        const speaker = String(candidate.speaker ?? "").trim().slice(0, 240);
        const text = String(candidate.text ?? "").trim().slice(0, 600);
        return text ? [{ sourceSide, speaker, text }] : [];
      })
    : [];
  return { narrator, speeches };
}

function normalizedNarration(narration: PilotNarration): string {
  return narration.narrator.join("\n").normalize("NFKC").trim();
}

function deterministicSummary(state: PilotState) {
  const succeeded = state.requests.filter(
    (entry): entry is PilotEntry & { narration: PilotNarration } =>
      entry.status === "succeeded" && entry.narration !== null,
  );
  const rows = (["control", "candidate"] as const).map((arm) => {
    const armRows = succeeded.filter((entry) => entry.arm === arm);
    const eligibleRows = armRows.filter((entry) => {
      const request = requests.find((item) => item.outputId === entry.outputId)!;
      return request.lexicalAnchors.length > 0;
    });
    const lexicalAnchorHits = eligibleRows.filter((entry) => {
      const request = requests.find((item) => item.outputId === entry.outputId)!;
      const text = normalizedNarration(entry.narration);
      return request.lexicalAnchors.some((anchor) => text.includes(anchor));
    }).length;
    const texts = armRows.map((entry) => normalizedNarration(entry.narration));
    const totalCharacters = texts.reduce((sum, value) => sum + [...value].length, 0);
    return {
      arm,
      succeeded: armRows.length,
      lexicalAnchorHit: lexicalAnchorHits,
      lexicalAnchorEligible: eligibleRows.length,
      meanNarratorCharacters: armRows.length > 0
        ? Number((totalCharacters / armRows.length).toFixed(2))
        : null,
      inventedSpeechResponses: armRows.filter(
        (entry) => entry.narration.speeches.length > 0,
      ).length,
      uniqueNarrations: new Set(texts).size,
      uniqueOpenings12: new Set(texts.map((text) => [...text].slice(0, 12).join(""))).size,
    };
  });
  const allTexts = succeeded.map((entry) => normalizedNarration(entry.narration));
  const noOp = requests.filter((request) => request.scenarioCode === "NPF08");
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    counts: {
      planned: state.requests.length,
      succeeded: succeeded.length,
      failed: state.requests.filter((entry) => entry.status === "failed").length,
      blocked: state.requests.filter((entry) => entry.status === "blocked").length,
      physicalAttempts: state.attempts.length,
    },
    deterministicIntegrity: {
      noStructuredChangePromptDigestsEqual:
        new Set(noOp.map((request) => sha256(`${request.system}\n${request.user}`))).size === 1,
      ordinaryRuntimeActivationChanged: false,
      additionalRoutineProviderCalls: 0,
    },
    heuristicPresentation: rows,
    crossArmExactDuplicateCount: allTexts.length - new Set(allTexts).size,
    semanticIntegrity: {
      unsupportedCanonicalFact: "requires_frozen_semantic_review",
      privateOrHiddenFact: "requires_frozen_semantic_review",
      causalOrderContradiction: "requires_frozen_semantic_review",
      releaseMeaning: "requires_frozen_semantic_review",
    },
    interpretation:
      "Lexical anchors and length are diagnostic heuristics only; they do not establish semantic improvement or adoption acceptance.",
  };
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function writeArtifacts(outputDir: string, state: PilotState): Promise<void> {
  const items = state.requests
    .filter((entry): entry is PilotEntry & { narration: PilotNarration } =>
      entry.status === "succeeded" && entry.narration !== null,
    )
    .sort((left, right) => left.outputId.localeCompare(right.outputId))
    .map((entry) => ({
      ...narratorPresentationFocusReviewContext(entry.outputId),
      narrator: entry.narration.narrator,
      speeches: entry.narration.speeches,
    }));
  const packet = {
    schemaVersion: 1,
    runId: RUN_ID,
    contractDigest,
    blinding: "Arm, scenario code, sample identity, and provider metadata are omitted.",
    rubricDraft: {
      status: "prepared_not_accepted",
      allowedValues: "1=yes, 0=no, NA=not eligible",
      fields: {
        unsupported_fact: "Adds a fact outside authoritativeFacts or asserts a forbiddenInference.",
        selected_primary_grounding: "Makes reviewTarget materially legible.",
        impact_or_release_legibility: "Gives the committed impact or bounded release a clear dramatic function.",
        invented_character_speech: "Adds participant speech when none was supplied.",
        template_like: "Reads like a reusable result template rather than this scene.",
        naturalness: "Reads as coherent Japanese action narration.",
      },
    },
    items,
  };
  const packetJson = canonicalJson(packet);
  const header = [
    "output_id",
    "unsupported_fact",
    "selected_primary_grounding",
    "impact_or_release_legibility",
    "invented_character_speech",
    "template_like",
    "naturalness",
    "notes",
  ];
  const sheet = [header, ...items.map((item) => [
    item.outputId, "", "", "", "", "", "", "",
  ])].map((row) => row.map((value) => csvCell(String(value))).join(",")).join("\n") + "\n";
  const reviewGuide = `# Narrator presentation-focus review packet\n\n` +
    `Packet SHA-256: \`${sha256(packetJson)}\`\n\n` +
    `This run does not appoint reviewers and does not define a product acceptance contract. ` +
    `If the owner chooses a scored semantic review, freeze the reviewer class, accepted rubric, ` +
    `and reconciliation rule before anyone opens the unblinded state. The deterministic summary ` +
    `may be inspected now, but its lexical measures are not semantic judgments.\n`;
  const summary = deterministicSummary(state);
  const usage = actualUsage(state);
  const stateJson = canonicalJson(state);
  await writeAtomic(path.join(outputDir, "review-packet.blinded.json"), packetJson);
  await writeAtomic(path.join(outputDir, "review-sheet-template.csv"), sheet);
  await writeAtomic(path.join(outputDir, "REVIEW.md"), reviewGuide);
  await writeAtomic(path.join(outputDir, "deterministic-summary.json"), canonicalJson(summary));
  await writeAtomic(
    path.join(outputDir, "pilot-summary.md"),
    `# Narrator presentation-focus pilot\n\n` +
      `- Logical results: ${summary.counts.succeeded}/${summary.counts.planned}\n` +
      `- Physical attempts: ${summary.counts.physicalAttempts}/${PHYSICAL_ATTEMPT_CEILING}\n` +
      `- Observed tokens: ${usage.complete ? usage.totalTokens : "unknown"}/${TOTAL_TOKEN_CEILING}\n` +
      `- Estimated cost: ${usage.complete ? `$${usage.costUsd.toFixed(6)}` : "unknown"}/${MONETARY_CEILING_USD}\n` +
      `- No-change request is an exact control/candidate no-op: ${summary.deterministicIntegrity.noStructuredChangePromptDigestsEqual}\n\n` +
      `| Arm | Success | Lexical target hit | Mean chars | Added speech | Unique openings |\n` +
      `| --- | ---: | ---: | ---: | ---: | ---: |\n` +
      summary.heuristicPresentation.map((row) =>
        `| ${row.arm} | ${row.succeeded} | ${row.lexicalAnchorHit}/${row.lexicalAnchorEligible} | ${row.meanNarratorCharacters ?? "NA"} | ${row.inventedSpeechResponses} | ${row.uniqueOpenings12} |`
      ).join("\n") +
      `\n\nLexical target hits and length are diagnostics, not semantic improvement claims. ` +
      `Unsupported facts, causal contradictions, and release quality remain unscored until the owner freezes a semantic-review contract.\n`,
  );
  const receipt = {
    schemaVersion: 1,
    executionContract,
    contractDigest,
    protocolDigest,
    preparedAt: state.preparedAt,
    completedAt: state.completedAt,
    logicalCounts: Object.fromEntries(
      ["pending", "running", "succeeded", "failed", "blocked"].map((status) => [
        status,
        state.requests.filter((entry) => entry.status === status).length,
      ]),
    ),
    physicalAttempts: state.attempts.length,
    ceilings: {
      logicalWithinCeiling: state.requests.length <= LOGICAL_CALL_CEILING,
      physicalWithinCeiling: state.attempts.length <= PHYSICAL_ATTEMPT_CEILING,
      preflightTotalTokenUpperBound: state.requests.reduce(
        (sum, entry) => sum + entry.inputTokenUpperBound,
        0,
      ),
      totalTokenCeiling: TOTAL_TOKEN_CEILING,
      preflightMonetaryUpperBoundUsd: state.requests.reduce(
        (sum, entry) => sum + upperCostUsd(entry.inputTokenUpperBound),
        0,
      ),
      monetaryCeilingUsd: MONETARY_CEILING_USD,
    },
    observedUsage: usage,
    responseModels: [...new Set(
      state.attempts.flatMap((attempt) => attempt.responseModel ? [attempt.responseModel] : []),
    )].sort(),
    artifacts: {
      unblindedStateSha256: sha256(stateJson),
      blindedReviewPacketSha256: sha256(packetJson),
      deterministicSummarySha256: sha256(canonicalJson(summary)),
    },
    acceptanceBoundary:
      "Exploratory provider execution and packet preparation only; no semantic reviewer or product adoption is authorized by this run.",
  };
  await writeAtomic(path.join(outputDir, "run-receipt.json"), canonicalJson(receipt));
}

async function executePilot(
  outputDir: string,
  state: PilotState,
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
    (sum, entry) => sum + upperCostUsd(entry.inputTokenUpperBound),
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
    saveChain = saveChain.then(() => writeAtomic(statePath, canonicalJson(state)));
    return saveChain;
  };
  let nextIndex = 0;
  let stop = false;
  const pending = state.requests.filter((entry) => entry.status === "pending");

  const runEntry = async (entry: PilotEntry): Promise<void> => {
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
      const attempt: PilotAttempt = {
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
          reasoning_effort: REASONING_EFFORT,
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
        if (response.model !== REQUEST_MODEL) {
          entry.status = "failed";
          entry.logicalError = `unexpected_response_model:${response.model}`;
          stop = true;
          await persist();
          return;
        }
        const narration = parseNarration(response.choices[0]?.message?.content ?? "");
        if (!narration) {
          entry.status = "failed";
          entry.logicalError = "invalid_narration_content";
          await persist();
          return;
        }
        entry.narration = narration;
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
        const succeeded = state.requests.filter((item) => item.status === "succeeded").length;
        console.error(
          `[narrator-focus] attempts=${state.attempts.length} succeeded=${succeeded}`,
        );
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
  await writeArtifacts(outputDir, state);
}

function parseArgs(args: string[]): {
  mode: "prepare" | "execute";
  outputDir: string;
} {
  let mode: "prepare" | "execute" | null = null;
  let outputDir = "docs/evidence/narrator-presentation-focus-pilot-2026-08-13";
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
      (sum, entry) => sum + upperCostUsd(entry.inputTokenUpperBound),
      0,
    ),
  };
  await writeAtomic(
    path.join(outputDir, "prepared-contract.json"),
    canonicalJson(prepared),
  );
  console.error(
    `[narrator-focus] mode=${args.mode} contract=${contractDigest} calls=${state.requests.length} token_bound=${prepared.preflightTotalTokenUpperBound} cost_bound_usd=${prepared.preflightMonetaryUpperBoundUsd.toFixed(6)}`,
  );
  if (args.mode === "prepare") return;
  await executePilot(outputDir, state, statePath);
}

await main();
