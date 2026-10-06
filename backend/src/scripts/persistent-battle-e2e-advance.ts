// R: Decode one advance SSE response and boundedly wait for transient battle-lease contention.
import { BattlePublicSchema, type BattleAdvanceStreamEvent, type BattlePublic } from "@kshiai/shared";
import { SpeechLineSchema } from "@kshiai/shared";
import { z } from "zod";

const ADVANCE_DEADLINE_MS = 600_000;
const MAX_BUSY_RETRIES = 8;
const INITIAL_BUSY_WAIT_MS = 250;
const MAX_BUSY_WAIT_MS = 2_000;

type AdvanceOutcome =
  | { kind: "done"; battle: BattlePublic }
  | { kind: "busy" }
  | { kind: "error"; message: string };

const AdvanceStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("phase"),
    phase: z.enum(["resolving", "agents", "narrating", "finalizing"]),
  }),
  z.object({
    type: z.literal("narrator"),
    lines: z.array(z.string()),
    draft: z.string().nullable().optional(),
    turn: z.number().int().optional(),
  }),
  z.object({ type: z.literal("speeches"), speeches: SpeechLineSchema.array() }),
  z.object({ type: z.literal("done"), battle: BattlePublicSchema }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

function parseStreamEvent(value: unknown): BattleAdvanceStreamEvent {
  const parsed = AdvanceStreamEventSchema.safeParse(value);
  if (!parsed.success) throw new Error("Malformed battle advance SSE event");
  return parsed.data;
}

export function decodeBattleAdvanceStream(body: string): AdvanceOutcome {
  const events: BattleAdvanceStreamEvent[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice("data:".length).trim();
    if (!raw) continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("Malformed battle advance SSE JSON");
    }
    events.push(parseStreamEvent(value));
  }
  const errors = events.filter((event): event is Extract<BattleAdvanceStreamEvent, { type: "error" }> => event.type === "error");
  const done = events.filter((event): event is Extract<BattleAdvanceStreamEvent, { type: "done" }> => event.type === "done");
  if (errors.length > 1 || done.length > 1 || (errors.length > 0 && done.length > 0)) {
    throw new Error("Ambiguous battle advance SSE response");
  }
  if (errors.length > 0) {
    const message = errors[0]!.message;
    if (message === "BATTLE_BUSY") {
      if (events.length !== 1) throw new Error("Ambiguous battle advance SSE response");
      return { kind: "busy" };
    }
    return { kind: "error", message };
  }
  if (done.length === 0) throw new Error("Battle advance stream returned no done event");
  return { kind: "done", battle: done.at(-1)!.battle };
}

export function parseBattleAdvanceStream(body: string): BattlePublic {
  const outcome = decodeBattleAdvanceStream(body);
  if (outcome.kind === "done") return outcome.battle;
  if (outcome.kind === "busy") throw new Error("BATTLE_BUSY");
  throw new Error(`Battle advance stream error: ${outcome.message}`);
}

export async function advanceBattleWithBusyRetry(input: {
  request: (request: { idempotencyKey: string; timeoutMs: number }) => Promise<Response>;
  idempotencyKey: string;
  now?: () => number;
  wait?: (delayMs: number) => Promise<void>;
  deadlineMs?: number;
}): Promise<BattlePublic> {
  const now = input.now ?? Date.now;
  const wait = input.wait ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const deadline = now() + (input.deadlineMs ?? ADVANCE_DEADLINE_MS);
  let retries = 0;
  while (true) {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error("Battle advance busy retry deadline exceeded");
    const response = await input.request({ idempotencyKey: input.idempotencyKey, timeoutMs: remaining });
    if (!response.ok) throw new Error(`Battle advance failed: ${response.status}: ${(await response.text()).replaceAll(/\s+/g, " ").slice(0, 300)}`);
    if (!response.headers.get("content-type")?.startsWith("text/event-stream")) throw new Error("Battle advance returned another content type");
    let bodyTimer: ReturnType<typeof setTimeout> | undefined;
    const body = await Promise.race([
      response.text(),
      new Promise<string>((_resolve, reject) => {
        bodyTimer = setTimeout(() => reject(new Error("Battle advance response deadline exceeded")), Math.max(1, deadline - now()));
      }),
    ]).finally(() => { if (bodyTimer) clearTimeout(bodyTimer); });
    if (now() >= deadline) throw new Error("Battle advance busy retry deadline exceeded");
    const outcome = decodeBattleAdvanceStream(body);
    if (outcome.kind === "done") return outcome.battle;
    if (outcome.kind === "error") throw new Error(`Battle advance stream error: ${outcome.message}`);
    if (retries >= MAX_BUSY_RETRIES) throw new Error("Battle advance busy retry limit exceeded");
    const delay = Math.min(MAX_BUSY_WAIT_MS, INITIAL_BUSY_WAIT_MS * 2 ** retries, Math.max(0, deadline - now()));
    if (delay <= 0) throw new Error("Battle advance busy retry deadline exceeded");
    retries += 1;
    await wait(delay);
  }
}
