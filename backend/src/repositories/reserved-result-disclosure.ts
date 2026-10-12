// R: Delay public outcomes until every ordered narration receipt has a terminal snapshot.
import type { BattleState } from "@kshiai/shared";
import { query } from "../db.js";
export async function reservedResultDisclosure(state: BattleState): Promise<{ state: BattleState; pending: boolean }> {
  if (state.assetManifest?.schemaVersion !== 7 || !("canonicalNarration" in state.assetManifest.reservedTurnPolicy) || state.status !== "finished") return { state, pending: false };
  const receipts = state.phaseReceipts ?? [];
  const entries = await query<{ receipt_id: string; status: string }>("SELECT receipt_id,status FROM battle_narration_entries WHERE battle_id=$1", [state.id]);
  const pending = receipts.length === 0 || receipts.some((receipt) => !entries.rows.some((entry) => entry.receipt_id === receipt.id && ["completed", "failed", "cancelled"].includes(entry.status)));
  return pending ? { state: { ...state, status: "active", winnerSide: null, finishReason: null, ratingSettlement: undefined, adjudication: undefined }, pending: true } : { state, pending: false };
}
