// R: Verify authenticated SSE transport with an isolated terminal battle and clean its temporary state.
import { randomUUID } from "node:crypto";
import { createBattleState, type CharacterSheet } from "@kshiai/shared";
import { query } from "../db.js";
import { insertNewBattle } from "../repositories/battles.js";

export async function smokeAuthenticatedSse(input: {
  apiBaseUrl: string;
  accessToken: string;
  originSecret?: string;
  ownerUserId: string;
  fixture: CharacterSheet;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const battleId = `btl_auth_sse_${randomUUID()}`;
  const state = createBattleState({
    id: battleId,
    sideA: input.fixture,
    sideB: input.fixture,
    turnLimit: 1,
    prologuePending: false,
  });
  state.status = "finished";
  state.winnerSide = "draw";
  state.finishReason = "turn_limit";
  state.aftermathPending = false;
  const inserted = await insertNewBattle(state, {
    sideAUserId: input.ownerUserId,
    sideACharacterId: input.fixture.id,
    sideBCharacterId: input.fixture.id,
  });
  if (inserted !== "created") throw new Error("AUTH_SSE_FIXTURE_CONFLICT");
  try {
    const request = input.fetchImpl ?? fetch;
    const response = await request(
      `${input.apiBaseUrl.replace(/\/$/, "")}/api/battles/${battleId}/advance/stream`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Idempotency-Key": `auth-sse-${battleId}`,
          ...(input.originSecret ? { "x-kshiai-origin": input.originSecret } : {}),
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      throw new Error(`Authenticated SSE smoke failed: ${response.status}: ${detail}`);
    }
    if (!response.headers.get("content-type")?.startsWith("text/event-stream")) {
      throw new Error("Authenticated SSE smoke returned another content type");
    }
    const body = await response.text();
    if (!body.includes(": stream-open") ||
        !body.includes('"type":"error"') || !body.includes("BATTLE_FINISHED")) {
      throw new Error("Authenticated SSE smoke returned an incomplete event stream");
    }
  } finally {
    // Delete only this run's temporary state, including failed-request bookkeeping.
    await query("DELETE FROM idempotency_keys WHERE user_id=$1 AND scope=$2", [
      input.ownerUserId, `battle-advance:${battleId}`,
    ]);
    await query("DELETE FROM battle_leases WHERE battle_id=$1", [battleId]);
    await query("DELETE FROM battles WHERE id=$1", [battleId]);
  }
}
