// R: Replace trial HTTP dispatch with deterministic, schema-shaped wire responses.
import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { z } from "zod";

// Keep offline elapsed-time scenarios deterministic if the host wall clock moves backwards.
const epochStartedAt = Date.now();
const monotonicStartedAt = performance.now();
Date.now = () => epochStartedAt + Math.floor(performance.now() - monotonicStartedAt);

const WireSchema = z.object({ model: z.string(), reasoning_effort: z.string().optional(), messages: z.array(z.object({ content: z.string() })) });
type TrialWire = z.infer<typeof WireSchema>;

function parseWire(init: RequestInit | undefined): TrialWire {
  return WireSchema.parse(JSON.parse(String(init?.body)));
}

function traceWire(wire: TrialWire): void {
  const trace = process.env.TRIAL_TEST_TRACE_PATH;
  if (trace) appendFileSync(trace, JSON.stringify({ model: wire.model, reasoning: wire.reasoning_effort,
    systemPrefix: wire.messages[0]?.content.slice(0, 85) }) + "\n");
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: { message } }, { status });
}

function jsonResponse(model: string, output: unknown): Response {
  return Response.json({ id: "test-response", model, choices: [{ message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } } });
}

function encounterOutput(): unknown {
  return { participants: { a: { battleLabel: "アオ" }, b: { battleLabel: "クロ" } },
    social: { a: { relationshipLabel: "未知", counterpartAddress: "相手", selfReference: null }, b: { relationshipLabel: "未知", counterpartAddress: "相手", selfReference: null } }, openingSummary: "訓練場で向き合う" };
}

function psycheOutput(user: string): unknown {
  return { state: { updatedTick: Number(user.match(/"tick"：(\d+)/)?.[1] ?? 0), sensations: [], emotions: [], tendencies: [], feltProjection: "ざわざわ" },
    reflexDesires: process.env.TRIAL_TEST_FAILURE === "shape" ? [{ id: "r", source: "reflex", strength: 0.7, startTick: 0, validUntilTick: 1, resource: "body", action: "defend" }] : [],
    affectiveDesires: [], reconsider: false, cancelThought: false };
}

function renderedValue(block: string, key: string): string | undefined {
  return block.match(new RegExp(`"${key}"：([^\\n]+)`))?.[1]?.trim();
}

function renderedPhase(block: string): string | undefined {
  return block.match(/（phase）\s*：([^\n]+)/)?.[1]?.trim();
}

function narrationIdentity(block: string): { battleId?: string; turnReceiptId?: string; phase?: string; turn: number } {
  return { battleId: renderedValue(block, "battleId"), turnReceiptId: renderedValue(block, "turnReceiptId"),
    phase: renderedPhase(block), turn: Number(renderedValue(block, "turn")) };
}

function narrationReceipt(block: string): unknown {
  const identity = narrationIdentity(block);
  if (identity.phase === "judgment") return { ...identity, before: ["判定を受け止める。"], after: [] };
  if (identity.phase === "aftermath") return { ...identity, before: ["静けさが戻る。"], after: [], speeches: [], recognitionUpdates: [] };
  return { ...identity, narrator: identity.phase === "prologue"
    ? ["場が静まる。", "二つの姿が現れる。", "向き合う。", "始まりを待つ。"]
    : ["向き合う。", "身構える。"], speeches: [], recognitionUpdates: [] };
}

function narrationOutput(user: string): unknown {
  return { receipts: user.split(/## 確定receipt /).slice(1).map(narrationReceipt) };
}

async function dispatchConscious(system: string): Promise<unknown> {
  if (process.env.TRIAL_TEST_FAILURE === "shape") await new Promise((resolve) => setTimeout(resolve, 100));
  return { goal: "相手を見る", thought: "様子を見る", desires: process.env.TRIAL_TEST_FAILURE === "shape"
    ? [{ id: "c", source: "conscious", strength: 0.7, startTick: 0, validUntilTick: 1, resource: "body", action: "defend" }] : [], influences: [] };
}

async function dispatchTrialOutput(wire: TrialWire): Promise<unknown | Response> {
  const system = wire.messages[0]?.content ?? "";
  const user = wire.messages[1]?.content ?? "";
  if (system.includes("Prepare immutable presentation")) return process.env.TRIAL_TEST_FAILURE === "encounter" ? jsonError("test-only rejection", 400) : encounterOutput();
  if (wire.model === "gpt-6-luna") return psycheOutput(user);
  if (system.includes("Return JSON only with exactly one top-level receipts array")) return process.env.TRIAL_TEST_FAILURE === "narration"
    ? jsonError("test-only rejection", 400) : process.env.TRIAL_TEST_FAILURE === "narration-shape" ? { receipts: [] } : narrationOutput(user);
  if (system.includes("Reconcile one already-resolved")) return { patch: { operations: [] }, nextSituation: null, environmentDecision: null };
  if (system.includes("顕在意識")) return dispatchConscious(system);
  throw new Error("UNEXPECTED_TRIAL_TEST_REQUEST");
}

globalThis.fetch = async (_url, init) => {
  const wire = parseWire(init);
  traceWire(wire);
  const output = await dispatchTrialOutput(wire);
  return output instanceof Response ? output : jsonResponse(wire.model, output);
};
