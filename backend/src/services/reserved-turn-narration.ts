// R: Generate ordered terminal narration from immutable committed facts without changing gameplay.
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { NarrativeBlockSchema, ReservedTurnNarrationSchema, ReservedTurnPolicySchema } from "@kshiai/shared";
import type { AwarenessJsonTransport } from "../llm/awareness-provider-contract.js";
import { reservedNarrationSystem } from "../llm/reserved-turns.js";
import { getReservedRuntime, mutateReservedRuntime } from "../repositories/reserved-turns.js";
import { reservedRequestRunner } from "./reserved-turn-execution.js";

export const ReservedNarrationInputSchema = z.object({
  kind: z.literal("reserved-turns-v2"), battleId: z.string().min(1), turn: z.number().int().positive(),
  policy: ReservedTurnPolicySchema, scene: z.string(), style: z.string().optional(),
  consequences: z.array(z.string()).max(80),
  speeches: NarrativeBlockSchema.shape.speeches,
  verdict: z.string().nullable(),
}).strict();
export type ReservedNarrationInput = z.infer<typeof ReservedNarrationInputSchema>;
export async function generateReservedNarration(raw: unknown, transport: AwarenessJsonTransport, heartbeat: () => Promise<void>) {
  const frozen = ReservedNarrationInputSchema.parse(raw);
  const saved = await getReservedRuntime(frozen.battleId);
  if (!saved || !("canonicalNarration" in saved.runtime.policy) || !isDeepStrictEqual(saved.runtime.policy, frozen.policy) || saved.runtime.turn < frozen.turn) throw new Error("RESERVED_NARRATION_BINDING_INVALID");
  if (transport.identity.provider !== frozen.policy.narration.provider || transport.identity.fastModel !== frozen.policy.narration.model) throw new Error("RESERVED_MODEL_BINDING_MISMATCH");
  let repaired = false;
  const port = {
    async read() { const row = await getReservedRuntime(frozen.battleId); if (!row) throw new Error("RESERVED_RUNTIME_REQUIRED"); return row.runtime; },
    async update(reduce: Parameters<typeof mutateReservedRuntime>[2]) { await heartbeat(); await mutateReservedRuntime(frozen.battleId, undefined, reduce); },
    async account(reduce: Parameters<typeof mutateReservedRuntime>[2]) { await mutateReservedRuntime(frozen.battleId, undefined, reduce); },
  };
  const routes = { battleId: frozen.battleId, port, character: transport, adjudication: transport, narration: transport };
  const repairFlag = () => repaired;
  const request = reservedRequestRunner(routes, saved.runtime, frozen.turn, Date.now, repairFlag);
  const user = JSON.stringify({ turn: frozen.turn, scene: frozen.scene, style: frozen.style,
    consequences: frozen.consequences, characterSpeeches: frozen.speeches });
  const result = await request("narration", null, reservedNarrationSystem, user, (rawOutput) => {
    const parsed = ReservedTurnNarrationSchema.safeParse(rawOutput);
    if (parsed.success) return { role: "narration", narration: parsed.data };
    repaired = true;
    console.warn("[reserved-turns] narration-fallback", { battleId: frozen.battleId, turn: frozen.turn, code: "NARRATION_FALLBACK" });
    const lines = frozen.consequences.length ? frozen.consequences.slice(0, 16).map((line) => Array.from(line).slice(0, 300).join("")) : ["このターンに公開された行動結果はありません。"];
    return { role: "narration", narration: ReservedTurnNarrationSchema.parse({ lines }) };
  });
  if (result.role !== "narration") throw new Error("RESERVED_NARRATION_ROLE");
  return NarrativeBlockSchema.parse({ turn: frozen.turn,
    narrator: [...result.narration.lines, ...(frozen.verdict ? ["——判定——", frozen.verdict] : [])], speeches: frozen.speeches });
}
