import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assetVisibilityLabel,
  assetVisibilityOf,
  canExposeAssetByVisibility,
} from "./asset-visibility.js";

describe("asset visibility", () => {
  it("treats omitted or unknown values as private under ADR0060", () => {
    assert.equal(assetVisibilityOf(undefined), "private");
    assert.equal(assetVisibilityOf("secret"), "private");
    assert.equal(assetVisibilityOf(null), "private");
    assert.equal(canExposeAssetByVisibility({
      isOwner: false,
      viewerIsFriendOfOwner: true,
    }), false);
    assert.equal(assetVisibilityOf("friends"), "friends");
  });

  it("exposes owner and system assets regardless of visibility", () => {
    assert.equal(canExposeAssetByVisibility({
      visibility: "private",
      isOwner: true,
      viewerIsFriendOfOwner: false,
    }), true);
    assert.equal(canExposeAssetByVisibility({
      visibility: "private",
      isOwner: false,
      isSystem: true,
      viewerIsFriendOfOwner: false,
    }), true);
  });

  it("hides private and friends-only assets from strangers", () => {
    assert.equal(canExposeAssetByVisibility({
      visibility: "private",
      isOwner: false,
      viewerIsFriendOfOwner: true,
    }), false);
    assert.equal(canExposeAssetByVisibility({
      visibility: "friends",
      isOwner: false,
      viewerIsFriendOfOwner: false,
    }), false);
    assert.equal(canExposeAssetByVisibility({
      visibility: "friends",
      isOwner: false,
      viewerIsFriendOfOwner: true,
    }), true);
    assert.equal(assetVisibilityLabel("friends"), "フレンド");
  });
});
