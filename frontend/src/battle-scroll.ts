export const MANUAL_SCROLL_HOLD_MS = 60_000;
export const LATEST_POSITION_THRESHOLD_PX = 48;

/** Every new manual scroll starts a fresh one-minute hold window. */
export function extendManualScrollHold(now: number): number {
  return now + MANUAL_SCROLL_HOLD_MS;
}

/** True when the log-end marker is visible, nearly visible, or already above us. */
export function hasReachedLatestPosition(input: {
  latestTop: number;
  viewportHeight: number;
  threshold?: number;
}): boolean {
  const threshold = input.threshold ?? LATEST_POSITION_THRESHOLD_PX;
  return input.latestTop <= input.viewportHeight + threshold;
}
