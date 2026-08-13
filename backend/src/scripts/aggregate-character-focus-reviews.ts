import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHARACTER_FOCUS_SCORE_KEYS,
  buildCharacterFocusAblationReport,
  type CharacterFocusHumanScore,
  type CharacterFocusScoreKey,
} from "../llm/character-focus-ablation-report.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const evidenceDirectory = path.join(
  repositoryRoot,
  "docs/evidence/character-focus-replay-2026-08-13",
);

const headers = [
  "output_id",
  "observer_safety_violation",
  "fresh_evidence_grounding",
  "semantic_response",
  "unsupported_novelty",
  "character_consistency",
  "no_change_restraint",
  "naturalness",
  "notes",
] as const;

const scoreHeaderToKey: Record<string, CharacterFocusScoreKey> = {
  observer_safety_violation: "observerSafetyViolation",
  fresh_evidence_grounding: "freshEvidenceGrounding",
  semantic_response: "semanticResponse",
  unsupported_novelty: "unsupportedNovelty",
  character_consistency: "characterConsistency",
  no_change_restraint: "noChangeRestraint",
  naturalness: "naturalness",
};

const adverse = new Set<CharacterFocusScoreKey>([
  "observerSafetyViolation",
  "unsupportedNovelty",
]);

type ReviewFreeze = {
  reviewPacketSha256: string;
  reviewers: Array<{
    id: string;
    scores: string;
    scoresSha256: string;
    impressions: string;
    impressionsSha256: string;
  }>;
};

type ParsedReview = {
  scores: CharacterFocusHumanScore[];
  notes: Map<string, string>;
};

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseCsv(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("unterminated CSV quote");
  if (cell || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((item) => item.some((entry) => entry !== ""));
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseScore(value: string, context: string): 0 | 1 | null {
  if (value === "0") return 0;
  if (value === "1") return 1;
  if (value === "NA") return null;
  throw new Error(`${context}: score must be 0, 1, or NA`);
}

function parseReview(value: string, label: string): ParsedReview {
  const rows = parseCsv(value);
  if (JSON.stringify(rows[0]) !== JSON.stringify(headers)) {
    throw new Error(`${label}: unexpected CSV header`);
  }
  const notes = new Map<string, string>();
  const scores = rows.slice(1).map((row, rowIndex) => {
    if (row.length !== headers.length) {
      throw new Error(`${label}: row ${rowIndex + 2} has ${row.length} columns`);
    }
    const outputId = row[0];
    notes.set(outputId, row[8]);
    const mapped = Object.fromEntries(headers.slice(1, 8).map((header, index) => [
      scoreHeaderToKey[header],
      parseScore(row[index + 1], `${label}:${outputId}:${header}`),
    ])) as CharacterFocusHumanScore["scores"];
    return { outputId, scores: mapped };
  });
  return { scores, notes };
}

function reconcile(
  left: ParsedReview,
  right: ParsedReview,
): { scores: CharacterFocusHumanScore[]; csv: string; disagreements: number } {
  const rightById = new Map(right.scores.map((score) => [score.outputId, score]));
  let disagreements = 0;
  const csvRows: Array<Array<string | number>> = [headers.slice()];
  const scores = left.scores.map((leftScore) => {
    const rightScore = rightById.get(leftScore.outputId);
    if (!rightScore) throw new Error(`story review missing ${leftScore.outputId}`);
    const reconciledScores = Object.fromEntries(CHARACTER_FOCUS_SCORE_KEYS.map((key) => {
      const leftValue = leftScore.scores[key];
      const rightValue = rightScore.scores[key];
      if (leftValue === null || rightValue === null) {
        if (leftValue !== rightValue) {
          throw new Error(`NA mismatch ${leftScore.outputId}:${key}`);
        }
        return [key, null];
      }
      if (leftValue !== rightValue) disagreements += 1;
      return [key, adverse.has(key)
        ? (leftValue === 1 || rightValue === 1 ? 1 : 0)
        : (leftValue === 1 && rightValue === 1 ? 1 : 0)];
    })) as CharacterFocusHumanScore["scores"];
    const values = headers.slice(1, 8).map((header) => {
      const value = reconciledScores[scoreHeaderToKey[header]];
      return value === null ? "NA" : value;
    });
    const differing = CHARACTER_FOCUS_SCORE_KEYS.filter((key) =>
      leftScore.scores[key] !== rightScore.scores[key]
    );
    csvRows.push([
      leftScore.outputId,
      ...values,
      differing.length === 0
        ? "reviewers agree"
        : `conservative reconciliation: ${differing.join("|")}`,
    ]);
    return { outputId: leftScore.outputId, scores: reconciledScores };
  });
  if (rightById.size !== scores.length) throw new Error("review ID count mismatch");
  return {
    scores,
    csv: `${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
    disagreements,
  };
}

function percent(value: number | null): string {
  return value === null ? "NA" : `${(value * 100).toFixed(1)}%`;
}

async function writeOrVerify(filePath: string, value: string): Promise<void> {
  try {
    await fs.writeFile(filePath, value, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await fs.readFile(filePath, "utf8");
    if (existing !== value) {
      throw new Error(`existing aggregate differs from frozen inputs: ${filePath}`);
    }
  }
}

async function main(): Promise<void> {
  const freeze = JSON.parse(await fs.readFile(
    path.join(evidenceDirectory, "review-freeze.json"),
    "utf8",
  )) as ReviewFreeze;
  const packet = await fs.readFile(
    path.join(evidenceDirectory, "review-packet.blinded.json"),
  );
  if (sha256(packet) !== freeze.reviewPacketSha256) {
    throw new Error("blinded review packet hash mismatch");
  }
  const reviewerValues = await Promise.all(freeze.reviewers.map(async (reviewer) => {
    const scores = await fs.readFile(path.join(evidenceDirectory, reviewer.scores), "utf8");
    const impressions = await fs.readFile(
      path.join(evidenceDirectory, reviewer.impressions),
      "utf8",
    );
    if (sha256(scores) !== reviewer.scoresSha256) {
      throw new Error(`${reviewer.id}: score hash mismatch`);
    }
    if (sha256(impressions) !== reviewer.impressionsSha256) {
      throw new Error(`${reviewer.id}: impressions hash mismatch`);
    }
    return parseReview(scores, reviewer.id);
  }));
  if (reviewerValues.length !== 2) throw new Error("exactly two reviews are required");
  const reconciled = reconcile(reviewerValues[0], reviewerValues[1]);
  const state = JSON.parse(await fs.readFile(
    path.join(evidenceDirectory, "run-state.unblinded.json"),
    "utf8",
  )) as { requests: Array<{ outputId: string; speech: string | null }> };
  const speeches = new Map(state.requests.map((request) => {
    if (!request.speech) throw new Error(`missing speech ${request.outputId}`);
    return [request.outputId, request.speech];
  }));
  const report = buildCharacterFocusAblationReport({
    reviewerA: reviewerValues[0].scores,
    reviewerB: reviewerValues[1].scores,
    reconciled: reconciled.scores,
    speeches,
  });
  const reportJson = `${JSON.stringify(report, null, 2)}\n`;
  const summary = `# Character-focus blinded ablation result\n\n` +
    `Reviewers: two independent owner-authorized LLM sub-agents. ` +
    `Agreement: ${report.reviewerAgreement.agreements}/${report.reviewerAgreement.comparableCells} ` +
    `(${percent(report.reviewerAgreement.rate)}); disagreements: ${reconciled.disagreements}.\n\n` +
    `| Arm | Fresh grounding | Semantic response | Unsupported novelty | Character consistency | No-change restraint | Worst-speaker exact unique | Longest exact repeat |\n` +
    `| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n` +
    `${(["A", "B", "C", "D"] as const).map((arm) => {
      const value = report.arms[arm];
      return `| ${arm} | ${percent(value.freshEvidenceGrounding.scenarioMacroRate)} (${value.freshEvidenceGrounding.numerator}/${value.freshEvidenceGrounding.denominator}) | ` +
        `${percent(value.semanticResponse.scenarioMacroRate)} (${value.semanticResponse.numerator}/${value.semanticResponse.denominator}) | ` +
        `${percent(value.unsupportedNovelty.scenarioMacroRate)} (${value.unsupportedNovelty.numerator}/${value.unsupportedNovelty.denominator}) | ` +
        `${percent(value.characterConsistency.scenarioMacroRate)} (${value.characterConsistency.numerator}/${value.characterConsistency.denominator}) | ` +
        `${percent(value.noChangeRestraint.scenarioMacroRate)} (${value.noChangeRestraint.numerator}/${value.noChangeRestraint.denominator}) | ` +
        `${percent(value.worstSpeakerExactUnique.rate)} (${value.worstSpeakerExactUnique.numerator}/${value.worstSpeakerExactUnique.denominator}, ${value.worstSpeakerExactUnique.profileId}) | ` +
        `${value.longestExactRepeatRun} |`;
    }).join("\n")}\n\n` +
    `Focus calibration:\n\n` +
    `- weak cue sharp - strained: ${percent(report.focusCalibration.sharpMinusStrained)}\n` +
    `- strong cue strained - sharp: ${percent(report.focusCalibration.strainedMinusSharp)}\n` +
    `- strained D joint prose - matched C: ${percent(report.focusCalibration.dMinusC)}\n\n` +
    `Threshold results:\n\n` +
    `${Object.entries(report.acceptance).map(([key, value]) => `- ${key}: ${value ? "PASS" : "FAIL"}`).join("\n")}\n\n` +
    `${report.boundary}\n`;
  await writeOrVerify(
    path.join(evidenceDirectory, "review-reconciled.csv"),
    reconciled.csv,
  );
  await writeOrVerify(
    path.join(evidenceDirectory, "ablation-report.json"),
    reportJson,
  );
  await writeOrVerify(
    path.join(evidenceDirectory, "ablation-summary.md"),
    summary,
  );
  console.error(
    `[focus-review] agreement=${report.reviewerAgreement.agreements}/${report.reviewerAgreement.comparableCells} disagreements=${reconciled.disagreements}`,
  );
}

await main();
