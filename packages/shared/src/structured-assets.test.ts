import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAssetAuthoringInFlight,
  toAssetAuthoringProgress,
} from "./structured-assets.js";

describe("asset authoring progress", () => {
  it("maps in-flight statuses to labeled steps", () => {
    assert.equal(isAssetAuthoringInFlight("generating_structure"), true);
    assert.equal(isAssetAuthoringInFlight("awaiting_owner_acceptance"), false);
    assert.deepEqual(toAssetAuthoringProgress("upgrade", "generating_structure"), {
      kind: "upgrade",
      status: "generating_structure",
      label: "既存設定を構造へ移しています",
      step: 2,
      stepCount: 5,
    });
    assert.equal(
      toAssetAuthoringProgress("create", "validating_structure")?.label,
      "機械チェックと自己レビュー中",
    );
    assert.equal(toAssetAuthoringProgress("upgrade", "succeeded"), null);
  });
});
