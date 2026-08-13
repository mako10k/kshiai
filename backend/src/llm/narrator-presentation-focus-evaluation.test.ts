import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildNarratorPresentationFocusRequests,
  narratorPresentationFocusProtocolMaterial,
  narratorPresentationFocusReviewContext,
} from "./narrator-presentation-focus-evaluation.js";

describe("narrator presentation-focus pilot protocol", () => {
  it("freezes eight paired scenarios and one initial sample per arm", () => {
    const requests = buildNarratorPresentationFocusRequests();
    assert.equal(requests.length, 16);
    assert.equal(new Set(requests.map((request) => request.outputId)).size, 16);
    assert.deepEqual(
      [...new Set(requests.map((request) => request.scenarioCode))].sort(),
      ["NPF01", "NPF02", "NPF03", "NPF04", "NPF05", "NPF06", "NPF07", "NPF08"],
    );
    for (const scenarioCode of new Set(requests.map((request) => request.scenarioCode))) {
      const rows = requests.filter((request) => request.scenarioCode === scenarioCode);
      assert.equal(rows.length, 2);
      assert.equal(rows.filter((request) => request.arm === "control").length, 1);
      assert.equal(rows.filter((request) => request.arm === "candidate").length, 1);
    }
  });

  it("changes only the explicit focus prompt when structured focus exists", () => {
    const requests = buildNarratorPresentationFocusRequests();
    for (const scenarioCode of ["NPF01", "NPF02", "NPF03", "NPF04", "NPF05", "NPF06", "NPF07"] as const) {
      const control = requests.find((request) =>
        request.scenarioCode === scenarioCode && request.arm === "control"
      )!;
      const candidate = requests.find((request) =>
        request.scenarioCode === scenarioCode && request.arm === "candidate"
      )!;
      assert.doesNotMatch(control.system, /presentationFocus is an optional/);
      assert.match(candidate.system, /presentationFocus is an optional/);
      assert.equal(JSON.parse(control.user).brief.presentationFocus, undefined);
      assert.notEqual(JSON.parse(candidate.user).brief.presentationFocus, undefined);
    }
  });

  it("is an exact no-op for the no-structured-change scenario", () => {
    const requests = buildNarratorPresentationFocusRequests();
    const control = requests.find((request) =>
      request.scenarioCode === "NPF08" && request.arm === "control"
    )!;
    const candidate = requests.find((request) =>
      request.scenarioCode === "NPF08" && request.arm === "candidate"
    )!;
    assert.equal(candidate.system, control.system);
    assert.equal(candidate.user, control.user);
    assert.equal(
      narratorPresentationFocusProtocolMaterial().scenarios.NPF08
        .controlAndCandidatePromptsEqual,
      true,
    );
  });

  it("keeps arm and sample identity out of blinded review context", () => {
    const context = narratorPresentationFocusReviewContext("N001");
    assert.deepEqual(Object.keys(context), [
      "outputId",
      "presentationPhase",
      "reviewTarget",
      "authoritativeFacts",
      "forbiddenInferences",
    ]);
  });
});
