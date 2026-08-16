import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LATEST_POSITION_THRESHOLD_PX,
  MANUAL_SCROLL_HOLD_MS,
  extendManualScrollHold,
  hasReachedLatestPosition,
  latestScrollY,
} from "./battle-scroll.js";

describe("battle auto scroll", () => {
  it("holds manual scroll for one minute", () => {
    assert.equal(MANUAL_SCROLL_HOLD_MS, 60_000);
  });

  it("extends the hold for a full minute after every manual scroll", () => {
    assert.equal(extendManualScrollHold(1_000), 61_000);
    assert.equal(extendManualScrollHold(30_000), 90_000);
  });

  it("re-enables following when the latest marker reaches the usable viewport", () => {
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
    assert.equal(
      hasReachedLatestPosition({
        latestTop: 790,
        viewportHeight: 800,
        bottomInset: 80,
      }),
      false,
    );
    assert.equal(
      hasReachedLatestPosition({
        latestTop: 720,
        viewportHeight: 800,
        bottomInset: 80,
      }),
      true,
    );
    assert.equal(
      hasReachedLatestPosition({
        latestTop: 700,
        viewportHeight: 800,
        bottomInset: 80,
        scrollportBottom: 620,
      }),
      false,
    );
    assert.equal(
      hasReachedLatestPosition({
        latestTop: 619,
        viewportHeight: 800,
        bottomInset: 80,
        scrollportBottom: 620,
      }),
      true,
    );
  });

  it("stays enabled after scrolling below the latest marker", () => {
    assert.equal(
      hasReachedLatestPosition({ latestTop: -100, viewportHeight: 800 }),
      true,
    );
  });

  it("scrolls the latest marker to sit above the bottom inset", () => {
    assert.equal(
      latestScrollY({
        scrollY: 200,
        latestBottom: 900,
        viewportHeight: 800,
        bottomInset: 80,
      }),
      380,
    );
  });
});
