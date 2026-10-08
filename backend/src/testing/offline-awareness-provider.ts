// R: Supply accounted deterministic awareness ports for the offline browser/API integration fixture.
import { AwarenessLatentOutputSchema, AwarenessConsciousOutputSchema, type AwarenessFrozenNarration } from "@kshiai/shared";
import { MockLlmProvider } from "../llm/mock.js";
import type { LlmProvider } from "../llm/types.js";
import type { AwarenessProviderRoles } from "../llm/awareness-provider-factory.js";
import { currentAwarenessDispatchContext } from "../llm/awareness-dispatch-context.js";
import { renderPromptSections } from "../llm/prompt-prose.js";
import { validateAwarenessFrozenNarrationResults } from "../llm/awareness-frozen-narration.js";
import { freezeAwarenessNarration } from "../llm/awareness-narration-phase.js";

class AccountedEncounterFixture extends MockLlmProvider {
  encounterDispatches = 0;
  constructor(private readonly encounterFixture?: LlmProvider["prepareBattleEncounter"]) {
    super();
  }
  override async prepareBattleEncounter(input: Parameters<LlmProvider["prepareBattleEncounter"]>[0]): ReturnType<LlmProvider["prepareBattleEncounter"]> {
    const guard = currentAwarenessDispatchContext();
    if (!guard) throw new Error("E2E_ENCOUNTER_ADMISSION_REQUIRED");
    // This is a local role double, not a replica of the SDK prompt or observed token usage.
    return guard.run({
      provider: guard.provider, model: guard.model,
      system: "Produce the deterministic offline encounter fixture from the supplied full input.",
      user: renderPromptSections([{ title: "試合資料", value: input }]),
      options: { tier: "engine", timeoutMs: guard.limits.deadlineMs,
        maxCompletionTokens: guard.limits.outputTokens, label: "prepareBattleEncounter",
        responseFormat: { type: "json_object" }, retry: "none" },
    }, async () => {
      this.encounterDispatches += 1;
      return { result: await (this.encounterFixture ? this.encounterFixture(input) : super.prepareBattleEncounter(input)), usage: null };
    });
  }
}

export function createOfflineAwarenessProvider(options?: { encounter: LlmProvider["prepareBattleEncounter"] }) {
  const domain = new AccountedEncounterFixture(options?.encounter);
  const frozenNarrationRequests: AwarenessFrozenNarration[][] = [];
  const identity = { provider: "xai", engineModel: "grok-e2e", fastModel: "grok-e2e" };
  const roles: AwarenessProviderRoles = {
    models: {
      subconscious: async (input) => AwarenessLatentOutputSchema.parse({
        state: { ...input.currentState, updatedTick: input.tick }, reflexDesires: [],
        affectiveDesires: [], reconsider: false, cancelThought: false,
      }),
      conscious: async () => AwarenessConsciousOutputSchema.parse({
        goal: "相手を見守る", thought: "距離を保つ", desires: [], influences: [],
      }),
    },
    adjudication: { identity, requestJson: async () => { throw new Error("E2E_UNEXPECTED_JSON_TRANSPORT"); } },
    adjudicationProvider: domain,
    narration: {
      identity,
      async narrateFrozenBatch(materials) {
        frozenNarrationRequests.push(structuredClone([...materials]));
        return validateAwarenessFrozenNarrationResults(materials, { receipts: materials.map((material) => {
          const base = { battleId: material.battleId, turnReceiptId: material.turnReceiptId,
            phase: material.phase, turn: material.turn };
          if (material.phase === "judgment") return { ...base, before: ["判定を受け止める。"], after: [] };
          const speeches = material.sourceSpeeches.map((speech) => ({ sourceSide: speech.side,
            speaker: speech.side === "a" ? "先手" : "後手", text: speech.text, afterNarratorLine: 0 }));
          if (material.phase === "aftermath") return { ...base, before: ["静けさが戻る。"], after: [], speeches, recognitionUpdates: [] };
          return { ...base, narrator: material.phase === "prologue"
            ? ["場が静まる。", "二つの姿が現れる。", "向き合う。", "始まりを待つ。"]
            : ["二人が向き合う。", "互いの距離を保つ。"], speeches, recognitionUpdates: [] };
        }) });
      },
      async narrateBatch(receipts) {
        const materials = receipts.map((receipt) => freezeAwarenessNarration({ phase: "combat", input: receipt.input },
          { battleId: receipt.battleId, turnReceiptId: receipt.turnReceiptId }));
        const results = await this.narrateFrozenBatch(materials);
        return results.map((result) => {
          if (result.phase !== "combat") throw new Error("E2E_NARRATION_PHASE_MISMATCH");
          return { battleId: result.battleId, turnReceiptId: result.turnReceiptId, narration: result.narration };
        });
      },
    },
  };
  return Object.assign(domain, { awareness: roles, awarenessBillingContracts: [], frozenNarrationRequests });
}
