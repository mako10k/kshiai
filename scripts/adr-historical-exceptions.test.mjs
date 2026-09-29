// R: Verify that legacy ADR exceptions apply only to the recorded snapshots.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { classifyHistoricalAdr } from "./adr-historical-exceptions.mjs";

const adrDirectory = new URL("../docs/adr/", import.meta.url);
const historicalCases = [
  ["0015-e2e-operator-session-reentry", "Accepted"],
  ["0016-scene-beats-batched-narration", "Accepted"],
  ["0017-public-turn-intra-turn-beats", "Accepted"],
  ["0019-observation-token-and-cost-admission", "Proposed"],
];

describe("historical ADR checker exceptions", () => {
  for (const [stem, status] of historicalCases) {
    it(`recognizes only the unchanged ${stem} pair`, () => {
      const source = readFileSync(new URL(`${stem}.think`, adrDirectory), "utf8");
      const markdown = readFileSync(new URL(`${stem}.md`, adrDirectory), "utf8");
      const name = `${stem}.think`;

      assert.equal(classifyHistoricalAdr(name, source, markdown, status).kind, "historical");
      assert.equal(classifyHistoricalAdr(name, `${source}\n`, markdown, status).kind, "changed");
      assert.equal(classifyHistoricalAdr(name, source, `${markdown}\n`, status).kind, "changed");
      assert.equal(classifyHistoricalAdr(name, source, markdown, "Rejected").kind, "changed");
    });
  }

  it("checks new ADRs through the ordinary path", () => {
    assert.equal(
      classifyHistoricalAdr("0038-narration-fragment-commit-and-result-reveal.think", "", "", "Proposed").kind,
      "ordinary",
    );
  });
});
