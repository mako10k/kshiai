// R: Keep private model/provider error text out of public battle failure reasons.
export function reservedTurnPublicFailure(error: unknown): string {
  if (!(error instanceof Error)) return "RESERVED_TURN_FAILED";
  return /^RESERVED_[A-Z0-9_]+(?=:|$)/.exec(error.message)?.[0] ?? "RESERVED_TURN_FAILED";
}
