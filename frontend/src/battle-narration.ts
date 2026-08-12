import type {
  BattleNarrationEntryPublic,
  BattleNarrationEventPublic,
  BattleNarrationSnapshot,
} from "@kshiai/shared";

export type BattleNarrationClientState = {
  entries: BattleNarrationEntryPublic[];
  cursor: string | null;
  seenEventIds: string[];
};

export function narrationStateFromSnapshot(
  snapshot: BattleNarrationSnapshot,
): BattleNarrationClientState {
  return {
    entries: [...snapshot.entries].sort((a, b) => a.sequence - b.sequence),
    cursor: snapshot.cursor,
    seenEventIds: [],
  };
}

export function reduceNarrationEvent(
  state: BattleNarrationClientState,
  event: BattleNarrationEventPublic,
): BattleNarrationClientState {
  if (state.seenEventIds.includes(event.eventId)) return state;
  const byReceipt = new Map(state.entries.map((entry) => [entry.turnReceiptId, entry]));
  byReceipt.set(event.entry.turnReceiptId, event.entry);
  return {
    entries: [...byReceipt.values()].sort((a, b) => a.sequence - b.sequence),
    cursor: event.cursor,
    seenEventIds: [...state.seenEventIds.slice(-199), event.eventId],
  };
}

