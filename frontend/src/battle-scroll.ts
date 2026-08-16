export const MANUAL_SCROLL_HOLD_MS = 60_000;
export const LATEST_POSITION_THRESHOLD_PX = 48;

/** Every new manual scroll starts a fresh one-minute hold window. */
export function extendManualScrollHold(now: number): number {
  return now + MANUAL_SCROLL_HOLD_MS;
}

/** True when the log-end marker is in the usable scrollport, not under the bottom nav. */
export function hasReachedLatestPosition(input: {
  latestTop: number;
  viewportHeight: number;
  threshold?: number;
  bottomInset?: number;
  scrollportBottom?: number;
}): boolean {
  const threshold = input.threshold ?? LATEST_POSITION_THRESHOLD_PX;
  const usableBottom = input.viewportHeight - (input.bottomInset ?? 0);
  const visibleBottom = Math.min(
    usableBottom,
    input.scrollportBottom ?? usableBottom,
  );
  return input.latestTop <= visibleBottom + threshold;
}

export function latestScrollY(input: {
  scrollY: number;
  latestBottom: number;
  viewportHeight: number;
  bottomInset?: number;
}): number {
  const visibleBottom = input.viewportHeight - (input.bottomInset ?? 0);
  return Math.max(0, input.scrollY + input.latestBottom - visibleBottom);
}
