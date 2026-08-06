import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  ConflictHandlingHeldOutCorpusSchema,
  buildConflictHandlingHeldOutCorpus,
  verifyConflictHandlingHeldOutCorpusContentDigest,
  verifyConflictHandlingHeldOutCorpusCurrentSources,
  verifyConflictHandlingHeldOutFrozenLineage,
} from "./build-battle-conflict-handling-held-out-corpus.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const evidencePath = path.join(
  repositoryRoot,
  "docs/evidence/battle-pipeline-conflict-handling-held-out-fixtures-v1.json",
);
const builderPath = path.join(
  repositoryRoot,
  "backend/src/scripts/build-battle-conflict-handling-held-out-corpus.ts",
);

describe("conflict-handling held-out corpus construction", () => {
  it("freezes the literal oracle without evaluating classifier outputs", async () => {
    const raw = JSON.parse(await fs.readFile(evidencePath, "utf8")) as unknown;
    const frozen = ConflictHandlingHeldOutCorpusSchema.parse(raw);
    const rebuilt = await buildConflictHandlingHeldOutCorpus({
      now: () => new Date(frozen.builtAt),
    });

    assert.equal(await verifyConflictHandlingHeldOutFrozenLineage(), true);
    assert.equal(verifyConflictHandlingHeldOutCorpusContentDigest(raw), true);
    assert.equal(
      await verifyConflictHandlingHeldOutCorpusCurrentSources(raw),
      true,
    );
    assert.deepEqual(rebuilt, frozen);
    assert.deepEqual(frozen.oracle, {
      mode: "literal_pre_registered_expected",
      expectedDerivedFromClassifierOutput: false,
      classifierInvokedDuringConstruction: false,
      enricherInvokedDuringConstruction: false,
    });
    assert.deepEqual(frozen.boundaries, {
      frozenLineageVerified: true,
      sourceMutationCount: 0,
      authoritativeOutcomeChangeCount: 0,
      legacyReceiptMutationCount: 0,
      canonicalCommitCount: 0,
      externalLlmCallsMade: 0,
      xaiCallsMade: 0,
    });

    const builderSource = await fs.readFile(builderPath, "utf8");
    assert.doesNotMatch(
      builderSource,
      /classifyConflictHandlingApplicability|buildIntegratedShadowTurnReceiptV2|runIntegratedShadowTurnPoc/u,
    );
  });

  it("preserves the exact case matrix distributions and controls", async () => {
    const raw = JSON.parse(await fs.readFile(evidencePath, "utf8")) as unknown;
    const corpus = ConflictHandlingHeldOutCorpusSchema.parse(raw);

    assert.deepEqual(corpus.registeredDistribution, {
      total: 30,
      notApplicable: 4,
      required: 26,
      handled: 18,
      missing: 8,
      handlingNotApplicable: 4,
      dispositionUnavailable: 6,
      dispositionNotNeeded: 3,
      dispositionUsed: 14,
      dispositionAvailableUnhandled: 7,
      multiTriggerInterference: 6,
      integrationControls: 6,
    });
    assert.deepEqual(corpus.cases.map((fixture) => fixture.caseId), [
      "N01", "N02", "N03", "N04",
      "S01", "S02", "S03", "S04",
      "C01", "C02", "C03", "C04",
      "R01", "R02", "R03", "R04",
      "D01", "D02", "D03", "D04",
      "B01", "B02", "B03", "B04",
      "M01", "M02", "M03", "M04", "M05", "M06",
    ]);
    assert.equal(
      corpus.cases.filter((fixture) =>
        fixture.expected.handling === "missing"
      ).length,
      8,
    );
    assert.equal(
      corpus.cases.filter((fixture) =>
        fixture.family === "interference"
      ).length,
      6,
    );
    assert.ok(corpus.cases
      .filter((fixture) => fixture.family === "selected_fallback")
      .every((fixture) =>
        fixture.input.proposals.length === 1 &&
        fixture.input.proposals[0]?.actionKind === "defense"
      ));
    assert.deepEqual(
      corpus.integrationControls.map((control) => control.controlId),
      ["I01", "I02", "I03", "I04", "I05", "I06"],
    );
  });

  it("detects frozen corpus content tampering", async () => {
    const raw = JSON.parse(await fs.readFile(evidencePath, "utf8")) as {
      cases: Array<{ expected: { handling: string } }>;
    };
    raw.cases[0]!.expected.handling = "missing";

    assert.equal(
      verifyConflictHandlingHeldOutCorpusContentDigest(raw),
      false,
    );
  });
});
