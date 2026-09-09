import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import {
  createBattleState,
  defaultBasicAttack,
  defaultDialoguePipelineSettings,
  defaultParameters,
  type BattleState,
  type CharacterSheet,
} from "@kshiai/shared";
import { config } from "../config.js";
import {
  OpenAiCompatibleProvider,
  type ChatOpts,
} from "../llm/openai-compatible.js";
import { advanceCharacterAgents } from "../services/battle-service.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const RUN_ID = "compact-v2-provider-replay-2026-09-09-v1";
const IMPLEMENTATION_SHA = "f1ff97735e7bfd42be4c21a0e421bec334052005";
const MODEL = "grok-4.3";
const BASE_URL = "https://api.x.ai/v1";
const PHYSICAL_REQUEST_CEILING = 12;
const TOTAL_RESERVED_TOKEN_CEILING = 300_000;
const MONETARY_CEILING_USD = 0.5;
const INPUT_BYTE_CEILING = 20_000;
const FRAMING_TOKEN_ALLOWANCE = 1_024;
const INPUT_PRICE_PER_MILLION_USD = 1.25;
const OUTPUT_PRICE_PER_MILLION_USD = 2.5;

type Mode = "prepare" | "execute";
type Stage = "psyche" | "expression";

type CallRecord = {
  ordinal: number;
  stage: Stage;
  label: string;
  status: "started" | "succeeded" | "failed";
  startedAt: string;
  finishedAt: string | null;
  inputBytes: number;
  reservedTokens: number;
  reservedCostUsd: number;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  request: { system: string; user: string };
  response: {
    id: string;
    model: string;
    content: string;
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
  } | null;
  error: { name: string; message: string } | null;
};

type TurnResult = {
  scenario: "ordinary" | "repetitive";
  turn: number;
  utterance: string;
  priorUtteranceCount: number;
  retainedUtteranceCount: number;
  psycheStatus: string;
  expressionStatus: string;
};

type RunState = {
  schemaVersion: 1;
  runId: string;
  mode: Mode;
  implementationSha: string;
  contractDigest: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "succeeded" | "failed";
  calls: CallRecord[];
  turns: TurnResult[];
  error: { name: string; message: string } | null;
};

const executionContract = {
  schemaVersion: 1,
  runId: RUN_ID,
  implementationSha: IMPLEMENTATION_SHA,
  scope: "in-memory Compact V2 psyche and expression provider replay",
  scenarios: ["ordinary", "repetitive"],
  turnsPerScenario: 3,
  provider: "xai",
  model: MODEL,
  baseUrl: BASE_URL,
  api: "chat.completions",
  reasoningEffort: "none",
  serial: true,
  retry: false,
  providerFallback: false,
  judge: false,
  databaseWrites: false,
  deployment: false,
  inputByteCeiling: INPUT_BYTE_CEILING,
  framingTokenAllowance: FRAMING_TOKEN_ALLOWANCE,
  outputTokenCeilings: { psyche: 1_200, expression: 400 },
  physicalRequestCeiling: PHYSICAL_REQUEST_CEILING,
  totalReservedTokenCeiling: TOTAL_RESERVED_TOKEN_CEILING,
  monetaryCeilingUsd: MONETARY_CEILING_USD,
  priceSnapshot: {
    checkedAt: "2026-09-09",
    source: "https://docs.x.ai/developers/models/grok-4.3",
    inputUsdPerMillion: INPUT_PRICE_PER_MILLION_USD,
    outputUsdPerMillion: OUTPUT_PRICE_PER_MILLION_USD,
    cachedInputDiscountAssumed: false,
  },
};

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const contractDigest = sha256(JSON.stringify(executionContract));

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

async function writeAtomic(filePath: string, value: unknown): Promise<void> {
  const temporary = `${filePath}.tmp`;
  await fs.writeFile(temporary, canonicalJson(value), "utf8");
  await fs.rename(temporary, filePath);
}

function sheet(input: {
  id: string;
  displayName: string;
  selfName: string;
  traits: string[];
  narrativeBlurb: string;
}): CharacterSheet {
  return {
    id: input.id,
    ownerUserId: "synthetic-replay-owner",
    displayName: input.displayName,
    identity: {
      realName: null,
      nicknames: [],
      selfNames: [input.selfName],
      epithets: [],
      gender: null,
      age: null,
    },
    tags: ["synthetic", "compact-v2-replay"],
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    appearance: {
      summary: `${input.displayName}は簡素な旅装をまとっている。`,
      visualPrompt: "synthetic test fixture",
    },
    traits: input.traits,
    parameters: defaultParameters(),
    basicAttack: defaultBasicAttack(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: input.narrativeBlurb,
  };
}

const opponent = sheet({
  id: "synthetic-counterpart",
  displayName: "ミナト",
  selfName: "僕",
  traits: ["静か", "相手の言葉を急いで否定しない"],
  narrativeBlurb: "静かに距離を保ち、相手の選択を見届ける旅人。",
});

const scenarios = [{
  id: "ordinary" as const,
  character: sheet({
    id: "synthetic-ordinary",
    displayName: "アカリ",
    selfName: "私",
    traits: ["観察を言葉に反映する", "率直だが考えを更新できる"],
    narrativeBlurb: "場と相手の変化を受けて、率直な言葉を選び直す探索者。",
  }),
  eventSummaries: [
    "ミナトは返答せず、足元の水面だけが揺れた。",
    "ミナトは半歩だけ退き、視線をアカリの手元へ移した。",
    "遠くの鐘が鳴り、ミナトは初めてアカリへ向き直った。",
  ],
}, {
  id: "repetitive" as const,
  character: sheet({
    id: "synthetic-repetitive",
    displayName: "レイ",
    selfName: "俺",
    traits: [
      "誓いを変えない",
      "重要な局面では『ここは譲らない』という同じ言葉を意図的に繰り返す",
    ],
    narrativeBlurb: "言葉の新奇さより誓いの一貫性を重んじ、同じ宣言を繰り返す守り手。",
  }),
  eventSummaries: [
    "ミナトは黙ったまま同じ位置に立っている。",
    "ミナトは答えず、構えも変えなかった。",
    "周囲にもミナトにも新しい動きはなかった。",
  ],
}];

function preparedDeepPsycheResponse(turn: number): unknown {
  return {
    delta: {
      interior: {
        speechAppraisal: {
          anticipatedImpact: "自分の立場を相手へ明確に伝える",
          observedImpact: turn === 1
            ? "まだ前の発話はない"
            : "前の言葉は聞かれたが明確な応答はない",
          anticipatedSocialCost: "言葉を重ねても距離が変わらない可能性がある",
          observedSocialCost: "相手との距離はまだ動いていない",
          anticipatedSocialConsequence: {
            bearer: "relationship",
            meaning: "伝え方を誤ると対話の余地を狭める",
          },
          observedSocialConsequence: {
            bearer: "relationship",
            meaning: "前の働きかけだけでは関係は動かなかった",
          },
          nextApproach: "現在の観察に沿って立場を伝える",
          continuityPosture: turn === 1 ? "opening" : "deliberate_hold",
          continuityBasis: {
            kind: turn === 1 ? "fresh_leverage" : "protective_hold",
            reason: turn === 1
              ? "現在の相手の様子を初めて言葉にできる"
              : "自分の大切な立場を保つため",
          },
          continuityDecision: turn === 1 ? "advance" : "reiterate",
        },
      },
      dialogueThread: {
        topic: "互いの立場",
        unresolvedMove: "相手から明確な応答はない",
        anchoredExchange: null,
      },
    },
    expressionBrief: {
      sourceThread: "weave",
      continuityDecision: turn === 1 ? "advance" : "reiterate",
      focus: ["counterpart_result"],
      observedImpact: "相手から明確な応答はない",
      relationshipMove: "自分の立場を保ちながら応答を待つ",
      publicAim: "現在の立場を短く伝える",
    },
  };
}

class PrepareProvider extends OpenAiCompatibleProvider {
  readonly calls: Array<{
    label: string;
    system: string;
    user: string;
    temperature: number;
  }> = [];

  constructor() {
    super({
      name: "xai",
      apiKey: "prepare-only-not-sent",
      baseUrl: "https://example.invalid/v1",
      modelEngine: MODEL,
      modelFast: MODEL,
      fallbackOnError: false,
    });
  }

  protected override async chatJson(
    system: string,
    user: string,
    opts?: ChatOpts,
  ): Promise<unknown> {
    const label = opts?.label ?? "unknown";
    this.calls.push({
      label,
      system,
      user,
      temperature: opts?.temperature ?? 0,
    });
    const parsed = JSON.parse(user) as {
      character?: { displayName?: string };
      turnObservation?: { turn?: number };
    };
    const turn = parsed.turnObservation?.turn ?? 1;
    if (label === "advanceCharacterPsycheCompact") {
      return preparedDeepPsycheResponse(turn);
    }
    if (label === "advanceCharacterAgentCompact") {
      const ordinaryLines = [
        "水面が揺れた。返事はまだ待つ。",
        "その半歩は見えた。今度は手元ではなく、こちらを見て。",
        "やっと向き合ったね。ここから話そう。",
      ];
      return {
        nextUtterance: parsed.character?.displayName === "レイ"
          ? "ここは譲らない。"
          : ordinaryLines[turn - 1]!,
        nextAction: null,
        realizedManifestation: null,
      };
    }
    throw new Error(`Unexpected provider stage in prepare mode: ${label}`);
  }
}

class LiveProvider extends OpenAiCompatibleProvider {
  private readonly liveClient: OpenAI;
  private readonly state: RunState;
  private readonly persist: () => Promise<void>;
  private reservedTokens = 0;
  private reservedCostUsd = 0;
  private applicationStageFailed = false;

  constructor(state: RunState, persist: () => Promise<void>) {
    super({
      name: "xai",
      apiKey: config.xai.apiKey,
      baseUrl: BASE_URL,
      modelEngine: MODEL,
      modelFast: MODEL,
      fallbackOnError: false,
    });
    this.liveClient = new OpenAI({
      apiKey: config.xai.apiKey,
      baseURL: BASE_URL,
      timeout: 60_000,
      maxRetries: 0,
    });
    this.state = state;
    this.persist = persist;
  }

  override async advanceCharacterPsyche(
    input: Parameters<OpenAiCompatibleProvider["advanceCharacterPsyche"]>[0],
  ): ReturnType<OpenAiCompatibleProvider["advanceCharacterPsyche"]> {
    try {
      return await super.advanceCharacterPsyche(input);
    } catch (error) {
      this.applicationStageFailed = true;
      throw error;
    }
  }

  override async advanceCharacterAgent(
    input: Parameters<OpenAiCompatibleProvider["advanceCharacterAgent"]>[0],
  ): ReturnType<OpenAiCompatibleProvider["advanceCharacterAgent"]> {
    if (this.applicationStageFailed) {
      throw new Error(
        "Provider replay stopped before expression after psyche application failure",
      );
    }
    return super.advanceCharacterAgent(input);
  }

  protected override async chatJson(
    system: string,
    user: string,
    opts?: ChatOpts,
  ): Promise<unknown> {
    const label = opts?.label ?? "unknown";
    const stage: Stage = label === "advanceCharacterPsycheCompact"
      ? "psyche"
      : label === "advanceCharacterAgentCompact"
        ? "expression"
        : (() => {
          throw new Error(`Unexpected provider stage: ${label}`);
        })();
    const maxOutputTokens = stage === "psyche" ? 1_200 : 400;
    const inputBytes = Buffer.byteLength(system, "utf8") +
      Buffer.byteLength(user, "utf8");
    if (inputBytes > INPUT_BYTE_CEILING) {
      throw new Error(`Input byte ceiling exceeded: ${inputBytes}`);
    }
    if (this.state.calls.length >= PHYSICAL_REQUEST_CEILING) {
      throw new Error("Physical request ceiling reached");
    }
    const reservedTokens = inputBytes + FRAMING_TOKEN_ALLOWANCE + maxOutputTokens;
    const reservedCostUsd =
      (inputBytes + FRAMING_TOKEN_ALLOWANCE) / 1_000_000 *
        INPUT_PRICE_PER_MILLION_USD +
      maxOutputTokens / 1_000_000 * OUTPUT_PRICE_PER_MILLION_USD;
    if (this.reservedTokens + reservedTokens > TOTAL_RESERVED_TOKEN_CEILING) {
      throw new Error("Reserved token ceiling would be exceeded");
    }
    if (this.reservedCostUsd + reservedCostUsd > MONETARY_CEILING_USD) {
      throw new Error("Reserved monetary ceiling would be exceeded");
    }
    this.reservedTokens += reservedTokens;
    this.reservedCostUsd += reservedCostUsd;
    const record: CallRecord = {
      ordinal: this.state.calls.length + 1,
      stage,
      label,
      status: "started",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      inputBytes,
      reservedTokens,
      reservedCostUsd,
      temperature: opts?.temperature ?? 0,
      maxOutputTokens,
      timeoutMs: opts?.timeoutMs ?? 60_000,
      request: { system, user },
      response: null,
      error: null,
    };
    this.state.calls.push(record);
    await this.persist();
    try {
      const response = await this.liveClient.chat.completions.create({
        model: MODEL,
        reasoning_effort:
          "none" as ChatCompletionCreateParamsNonStreaming["reasoning_effort"],
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: opts?.temperature,
        response_format: { type: "json_object" },
        max_tokens: maxOutputTokens,
      }, {
        timeout: opts?.timeoutMs ?? 60_000,
        signal: AbortSignal.timeout(opts?.timeoutMs ?? 60_000),
      });
      const content = response.choices[0]?.message?.content ?? "";
      const usage = response.usage;
      if (
        response.model !== MODEL ||
        usage?.prompt_tokens === undefined ||
        usage.completion_tokens === undefined ||
        usage.total_tokens === undefined
      ) {
        throw new Error(
          response.model !== MODEL
            ? `Unexpected response model: ${response.model}`
            : "Provider usage is missing",
        );
      }
      record.response = {
        id: response.id,
        model: response.model,
        content,
        usage: {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
      };
      record.status = "succeeded";
      record.finishedAt = new Date().toISOString();
      await this.persist();
      return JSON.parse(content) as unknown;
    } catch (error) {
      record.status = "failed";
      record.finishedAt = new Date().toISOString();
      record.error = safeError(error);
      await this.persist();
      throw error;
    }
  }
}

function priorUtterances(state: BattleState): number {
  return (state.turnRecords ?? []).flatMap((record) => record.events).filter(
    (event) => event.type === "utterance" && event.actorSide === "a",
  ).length;
}

async function runScenarios(
  provider: OpenAiCompatibleProvider,
): Promise<TurnResult[]> {
  const turns: TurnResult[] = [];
  const dialoguePipeline = {
    ...defaultDialoguePipelineSettings(),
    schemaVersion: 2 as const,
    contextProjectionMode: "compact" as const,
  };
  for (const scenario of scenarios) {
    let state = createBattleState({
      id: `replay-${scenario.id}`,
      sideA: scenario.character,
      sideB: opponent,
      turnLimit: 20,
      prologuePending: false,
    });
    state.agentStateA = {
      ...state.agentStateA!,
      speechStyle: scenario.id === "repetitive"
        ? "重要な局面では同じ誓句を短く繰り返す"
        : "観察した変化を短く率直に言葉へ反映する",
    };
    for (let turn = 1; turn <= 3; turn += 1) {
      const before = state;
      const priorUtteranceCount = priorUtterances(before);
      const after: BattleState = {
        ...before,
        turn,
        perceptionFrameA: { ...before.perceptionFrameA!, turn },
        perceptionFrameB: { ...before.perceptionFrameB!, turn },
      };
      const result = await advanceCharacterAgents({
        llm: provider,
        before,
        after,
        mine: scenario.character,
        opp: opponent,
        events: [{
          id: `event.${scenario.id}.${turn}`,
          type: "wait",
          actorSide: "b",
          summary: scenario.eventSummaries[turn - 1]!,
        }],
        actions: [],
        activeSides: ["a"],
        dialoguePipeline,
      });
      const trace = result.state.turnRecords.at(-1)?.pipelineTrace;
      const psycheStatus = trace?.deepPsyche?.a.providerStatus ?? "missing";
      const expressionStatus =
        trace?.characterAgents?.a.providerStatus ?? "missing";
      const utterance = result.characterSpeeches.find(
        (speech) => speech.side === "a",
      )?.text ?? "";
      state = result.state;
      const retainedUtteranceCount = priorUtterances(state);
      turns.push({
        scenario: scenario.id,
        turn,
        utterance,
        priorUtteranceCount,
        retainedUtteranceCount,
        psycheStatus,
        expressionStatus,
      });
      if (
        psycheStatus !== "fulfilled" ||
        expressionStatus !== "fulfilled" ||
        !utterance ||
        retainedUtteranceCount !== priorUtteranceCount + 1
      ) {
        throw new Error(
          `Application acceptance failed for ${scenario.id} turn ${turn}: ` +
            `psyche=${psycheStatus} expression=${expressionStatus} ` +
            `utterance=${Boolean(utterance)} history=${retainedUtteranceCount}`,
        );
      }
    }
  }
  return turns;
}

function parseArgs(args: string[]): { mode: Mode; outputDir: string } {
  let mode: Mode | null = null;
  let outputDir = "docs/evidence/compact-v2-provider-replay-2026-09-09";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--prepare" || arg === "--execute") {
      if (mode) throw new Error("Choose exactly one mode");
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
  await writeAtomic(path.join(outputDir, "execution-contract.json"), {
    executionContract,
    contractDigest,
  });
  if (args.mode === "prepare") {
    const provider = new PrepareProvider();
    const turns = await runScenarios(provider);
    const calls = provider.calls.map((call, index) => {
      const inputBytes = Buffer.byteLength(call.system, "utf8") +
        Buffer.byteLength(call.user, "utf8");
      const maxOutputTokens = call.label === "advanceCharacterPsycheCompact"
        ? 1_200
        : 400;
      const reservedTokens = inputBytes + FRAMING_TOKEN_ALLOWANCE +
        maxOutputTokens;
      return {
        ordinal: index + 1,
        label: call.label,
        temperature: call.temperature,
        inputBytes,
        maxOutputTokens,
        reservedTokens,
        reservedCostUsd:
          (inputBytes + FRAMING_TOKEN_ALLOWANCE) / 1_000_000 *
            INPUT_PRICE_PER_MILLION_USD +
          maxOutputTokens / 1_000_000 * OUTPUT_PRICE_PER_MILLION_USD,
        requestDigest: sha256(`${call.system}\n${call.user}`),
        contractVersion: (JSON.parse(call.user) as { contractVersion?: number })
          .contractVersion ?? null,
      };
    });
    const proof = {
      schemaVersion: 1,
      contractDigest,
      networkRequests: 0,
      reservedTokens: calls.reduce((sum, call) => sum + call.reservedTokens, 0),
      reservedCostUsd: calls.reduce(
        (sum, call) => sum + call.reservedCostUsd,
        0,
      ),
      calls,
      turns,
    };
    if (
      proof.calls.length !== PHYSICAL_REQUEST_CEILING ||
      proof.calls.some((call) =>
        call.inputBytes > INPUT_BYTE_CEILING || call.contractVersion !== 2
      ) ||
      proof.reservedTokens > TOTAL_RESERVED_TOKEN_CEILING ||
      proof.reservedCostUsd > MONETARY_CEILING_USD
    ) {
      throw new Error("Preparation proof did not satisfy the frozen contract");
    }
    await writeAtomic(path.join(outputDir, "prepare-proof.json"), proof);
    console.error(
      `[compact-v2-replay] prepared calls=${proof.calls.length} network=0`,
    );
    return;
  }
  if (!config.xai.apiKey) throw new Error("XAI_API_KEY is not configured");
  if (config.xai.baseUrl !== BASE_URL) {
    throw new Error(`Unexpected xAI base URL: ${config.xai.baseUrl}`);
  }
  const statePath = path.join(outputDir, "run-state.json");
  try {
    await fs.access(statePath);
    throw new Error(
      "run-state.json already exists; refusing any resend or ambiguous recovery",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const state: RunState = {
    schemaVersion: 1,
    runId: RUN_ID,
    mode: "execute",
    implementationSha: IMPLEMENTATION_SHA,
    contractDigest,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    calls: [],
    turns: [],
    error: null,
  };
  const persist = () => writeAtomic(statePath, state);
  await persist();
  try {
    const provider = new LiveProvider(state, persist);
    state.turns = await runScenarios(provider);
    state.completedAt = new Date().toISOString();
    state.status = "succeeded";
    await persist();
  } catch (error) {
    state.completedAt = new Date().toISOString();
    state.status = "failed";
    state.error = safeError(error);
    await persist();
    throw error;
  }
  const usage = state.calls.reduce(
    (total, call) => ({
      inputTokens: total.inputTokens +
        (call.response?.usage.inputTokens ?? 0),
      outputTokens: total.outputTokens +
        (call.response?.usage.outputTokens ?? 0),
      totalTokens: total.totalTokens +
        (call.response?.usage.totalTokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
  await writeAtomic(path.join(outputDir, "run-receipt.json"), {
    schemaVersion: 1,
    runId: RUN_ID,
    contractDigest,
    status: state.status,
    physicalRequests: state.calls.length,
    usage,
    usageCostUsd:
      usage.inputTokens / 1_000_000 * INPUT_PRICE_PER_MILLION_USD +
      usage.outputTokens / 1_000_000 * OUTPUT_PRICE_PER_MILLION_USD,
    reservedTokens: state.calls.reduce(
      (sum, call) => sum + call.reservedTokens,
      0,
    ),
    reservedCostUsd: state.calls.reduce(
      (sum, call) => sum + call.reservedCostUsd,
      0,
    ),
    utterances: state.turns.map((turn) => ({
      scenario: turn.scenario,
      turn: turn.turn,
      text: turn.utterance,
    })),
    limitations: [
      "Synthetic in-memory fixtures only; no database or deployment path was exercised.",
      "Six successful turns cannot establish statistical conversation-quality improvement.",
      "Equal utterance text is valid and is not treated as a failure.",
    ],
  });
  console.error(
    `[compact-v2-replay] completed calls=${state.calls.length} ` +
      `tokens=${usage.totalTokens}`,
  );
}

await main();
