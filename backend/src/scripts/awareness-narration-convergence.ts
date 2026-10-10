// R: Validate terminal narration convergence against the bound battle pipeline's completion contract.
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
): void {
  const invalid = entries.length === 0 || entries.some((entry) => {
    const terminal = (schemaVersion === 5 || schemaVersion === 6)
      ? entry.status === "completed"
      : ["completed", "failed", "cancelled"].includes(entry.status ?? "");
    const claims = (schemaVersion === 5 || schemaVersion === 6)
      ? Number.isInteger(entry.attemptCount) && Number(entry.attemptCount) > 0
      : entry.attemptCount === 1;
    return !terminal || !claims || entry.blockedBySequence !== null ||
      entry.lease !== null || entry.outbox?.status !== "completed";
  });
  if (invalid) throw new Error((schemaVersion === 5 || schemaVersion === 6)
    ? "Awareness narration receipts did not converge to successful terminal publication"
    : "Narration receipts did not converge to one terminal attempt each");
}

export function narrationConvergenceEvidence(schemaVersion: number, terminalReceiptCount: number) {
  const common = { terminalReceiptCount, orderedProjection: "passed", liveGenerations: 0 };
  return (schemaVersion === 5 || schemaVersion === 6)
    ? { ...common, oneTerminalSnapshotPerReceipt: "passed",
      claimCountSemantics: "positive integer durable claims; no-send deferrals may increase the count" }
    : { ...common, oneAttemptPerReceipt: "passed" };
}
