import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LATEST_POSITION_THRESHOLD_PX,
  MANUAL_SCROLL_HOLD_MS,
  extendManualScrollHold,
  hasReachedLatestPosition,
} from "./battle-scroll.js";

describe("battle auto scroll", () => {
  it("holds manual scroll for one minute", () => {
    assert.equal(MANUAL_SCROLL_HOLD_MS, 60_000);
  });

  it("extends the hold for a full minute after every manual scroll", () => {
    assert.equal(extendManualScrollHold(1_000), 61_000);
    assert.equal(extendManualScrollHold(30_000), 90_000);
  });

  it("re-enables following when the latest marker reaches the viewport", () => {
    assert.equal(
      hasReachedLatestPosition({
        latestTop: 800 + LATEST_POSITION_THRESHOLD_PX,
        viewportHeight: 800,
      }),
      true,
    );
    assert.equal(
      hasReachedLatestPosition({ latestTop: 900, viewportHeight: 800 }),
      false,
    );
  });

  it("stays enabled after scrolling below the latest marker", () => {
    assert.equal(
      hasReachedLatestPosition({ latestTop: -100, viewportHeight: 800 }),
      true,
    );
  });
});
