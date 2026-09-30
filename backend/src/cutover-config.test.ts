// R: Verify that deployment identity is explicit and paired without an environment phase switch.
import assert from "node:assert/strict";
import { it } from "node:test";
import { parseCutoverDeployment } from "./config.js";
it("requires both immutable deployment identifiers", () => {
  assert.equal(parseCutoverDeployment({}), null);
  assert.throws(() => parseCutoverDeployment({ cutoverId: "cutover" }));
  assert.throws(() => parseCutoverDeployment({ artifactId: "artifact" }));
  assert.deepEqual(parseCutoverDeployment({ cutoverId: " cutover ", artifactId: " artifact " }), { cutoverId: "cutover", artifactId: "artifact" });
  assert.throws(() => parseCutoverDeployment({ cutoverId: "x".repeat(201), artifactId: "artifact" }));
  assert.throws(() => parseCutoverDeployment({ cutoverId: "cutover", artifactId: "x".repeat(501) }));
});
