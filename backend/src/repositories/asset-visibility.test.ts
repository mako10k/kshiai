import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canExposeAssetByVisibility,
} from "@kshiai/shared";

describe("owned asset visibility policy", () => {
  it("matches character matchmaking: public anyone, friends list, private owner", () => {
    assert.equal(canExposeAssetByVisibility({
      visibility: "public",
      isOwner: false,
      viewerIsFriendOfOwner: false,
    }), true);
    assert.equal(canExposeAssetByVisibility({
      visibility: "friends",
      isOwner: false,
      viewerIsFriendOfOwner: true,
    }), true);
    assert.equal(canExposeAssetByVisibility({
      visibility: "friends",
      isOwner: false,
      viewerIsFriendOfOwner: false,
    }), false);
    assert.equal(canExposeAssetByVisibility({
      visibility: "private",
      isOwner: false,
      viewerIsFriendOfOwner: true,
    }), false);
  });
});
