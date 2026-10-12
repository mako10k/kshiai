// R: Validate terminal narration convergence against the bound battle pipeline's completion contract.
export type NarrationPublicationMode = "inline" | "ordered-outbox";
export interface NarrationConvergenceEntry {
  status?: string;
  attemptCount?: number;
  blockedBySequence?: number | null;
  outbox?: { status?: string } | null;
  lease?: unknown | null;
}

export function assertNarrationConvergence(
  schemaVersion: number,
  entries: readonly NarrationConvergenceEntry[],
  publicationMode: NarrationPublicationMode = "inline",
): void {
  if (schemaVersion === 7 && publicationMode === "inline") {
    if (!entries.length || entries.some((entry) => entry.status !== "completed" || entry.attemptCount !== 0 || entry.blockedBySequence !== null || entry.lease !== null || entry.outbox !== null)) throw new Error("Reserved-turn inline narration did not converge to atomic publication");
    return;
  }
  const successfulQueue = schemaVersion === 5 || schemaVersion === 6 || schemaVersion === 7;
  const invalid = entries.length === 0 || entries.some((entry) => {
    const terminal = successfulQueue
      ? entry.status === "completed"
      : ["completed", "failed", "cancelled"].includes(entry.status ?? "");
    const claims = successfulQueue
      ? Number.isInteger(entry.attemptCount) && Number(entry.attemptCount) > 0
      : entry.attemptCount === 1;
    return !terminal || !claims || entry.blockedBySequence !== null ||
      entry.lease !== null || entry.outbox?.status !== "completed";
  });
  if (invalid) throw new Error(successfulQueue
    ? "Awareness narration receipts did not converge to successful terminal publication"
    : "Narration receipts did not converge to one terminal attempt each");
}

export function narrationConvergenceEvidence(schemaVersion: number, terminalReceiptCount: number, publicationMode: NarrationPublicationMode = "inline") {
  const common = { terminalReceiptCount, orderedProjection: "passed", liveGenerations: 0 };
  if (schemaVersion === 7 && publicationMode === "inline") return { ...common, atomicInlinePublication: "passed", durableWorkerClaims: 0 };
  return (schemaVersion === 5 || schemaVersion === 6 || schemaVersion === 7)
    ? { ...common, oneTerminalSnapshotPerReceipt: "passed",
      claimCountSemantics: "positive integer durable claims; no-send deferrals may increase the count" }
    : { ...common, oneAttemptPerReceipt: "passed" };
}
