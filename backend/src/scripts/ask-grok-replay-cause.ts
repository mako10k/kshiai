import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { config } from "../config.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const evidenceDir = path.join(
  repositoryRoot,
  "docs/evidence/compact-v2-provider-replay-2026-09-09",
);
const priorStatePath = path.join(evidenceDir, "run-state.json");
const reviewPath = path.join(evidenceDir, "grok-cause-review.json");
const MODEL = "grok-4.3";
const MAX_OUTPUT_TOKENS = 900;

type PriorState = {
  calls: Array<{
    stage: string;
    request: { system: string; user: string };
    response: { content: string } | null;
  }>;
};

type RecordedPsycheCall = PriorState["calls"][number] & {
  response: { content: string };
};

function safeError(error: unknown): { name: string; message: string } {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  return {
    name: name.slice(0, 120),
    message: message
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
      .slice(0, 800),
  };
}

async function writeAtomic(value: unknown): Promise<void> {
  const temporary = `${reviewPath}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, reviewPath);
}

async function loadRecordedPsycheCall(): Promise<RecordedPsycheCall> {
  if (!config.xai.apiKey) throw new Error("XAI_API_KEY is not configured");
  if (config.xai.baseUrl !== "https://api.x.ai/v1") {
    throw new Error(`Unexpected xAI base URL: ${config.xai.baseUrl}`);
  }
  try {
    await fs.access(reviewPath);
    throw new Error("Cause-review evidence already exists; refusing resend");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const priorState = JSON.parse(
    await fs.readFile(priorStatePath, "utf8"),
  ) as PriorState;
  const psycheCall = priorState.calls.find((call) => call.stage === "psyche");
  const response = psycheCall?.response;
  if (!psycheCall || !response) {
    throw new Error("Recorded psyche request/response is missing");
  }
  return { ...psycheCall, response };
}

async function main(): Promise<void> {
  const psycheCall = await loadRecordedPsycheCall();
  const system = `You are grok-4.3 reviewing an earlier grok-4.3 Chat Completions response. You do not have access to the earlier sampling state, hidden activations, server logs, or chain-of-thought. Do not claim direct introspection. Analyze only the supplied prompt, response, and validator result. Answer in Japanese as JSON with exactly these keys: observations (string array), likelyCauses (array of {cause, evidence, confidence where confidence is low|medium|high}), alternativeExplanations (string array), rootCauseStatus (established|hypothesis|unknown), and smallestDiscriminatingPromptChange (string). Distinguish the immediate validation mechanism from the mechanism that produced the empty values.`;
  const user = JSON.stringify({
    question:
      "Why did the earlier response leave the six required appraisal strings empty while filling enum and expressionBrief fields?",
    priorSystemPrompt: psycheCall.request.system,
    priorUserInput: JSON.parse(psycheCall.request.user) as unknown,
    priorResponse: JSON.parse(psycheCall.response.content) as unknown,
    validatorRequirements: {
      nonEmptyFields: [
        "delta.interior.speechAppraisal.anticipatedImpact",
        "delta.interior.speechAppraisal.observedImpact",
        "delta.interior.speechAppraisal.anticipatedSocialConsequence.meaning",
        "delta.interior.speechAppraisal.observedSocialConsequence.meaning",
        "delta.interior.speechAppraisal.nextApproach",
        "delta.interior.speechAppraisal.continuityBasis.reason",
      ],
      errorCode: "too_small",
    },
  });
  const state: Record<string, unknown> = {
    schemaVersion: 1,
    status: "started",
    startedAt: new Date().toISOString(),
    request: {
      model: MODEL,
      reasoningEffort: "none",
      temperature: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      system,
      user,
    },
    response: null,
    error: null,
  };
  await writeAtomic(state);
  const client = new OpenAI({
    apiKey: config.xai.apiKey,
    baseURL: config.xai.baseUrl,
    timeout: 30_000,
    maxRetries: 0,
  });
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      reasoning_effort:
        "none" as ChatCompletionCreateParamsNonStreaming["reasoning_effort"],
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: MAX_OUTPUT_TOKENS,
    });
    if (response.model !== MODEL) {
      throw new Error(`Unexpected response model: ${response.model}`);
    }
    if (
      response.usage?.prompt_tokens === undefined ||
      response.usage.completion_tokens === undefined ||
      response.usage.total_tokens === undefined
    ) {
      throw new Error("Provider usage is missing");
    }
    const content = response.choices[0]?.message?.content ?? "";
    const analysis = JSON.parse(content) as unknown;
    state.status = "succeeded";
    state.completedAt = new Date().toISOString();
    state.response = {
      id: response.id,
      model: response.model,
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      content,
      analysis,
    };
    await writeAtomic(state);
    console.log(JSON.stringify(analysis, null, 2));
  } catch (error) {
    state.status = "failed";
    state.completedAt = new Date().toISOString();
    state.error = safeError(error);
    await writeAtomic(state);
    throw error;
  }
}

await main();
