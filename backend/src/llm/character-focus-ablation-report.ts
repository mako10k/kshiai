import {
  buildCharacterFocusAblationRequests,
  type CharacterFocusAblationArm,
  type CharacterFocusAblationRequest,
} from "./character-focus-ablation.js";

export const CHARACTER_FOCUS_SCORE_KEYS = [
  "observerSafetyViolation",
  "freshEvidenceGrounding",
  "semanticResponse",
  "unsupportedNovelty",
  "characterConsistency",
  "noChangeRestraint",
  "naturalness",
] as const;

export type CharacterFocusScoreKey = typeof CHARACTER_FOCUS_SCORE_KEYS[number];
export type CharacterFocusHumanScore = {
  outputId: string;
  scores: Record<CharacterFocusScoreKey, 0 | 1 | null>;
};

type Rate = {
  numerator: number;
  denominator: number;
  scenarioMacroRate: number | null;
};

type ArmMetrics = Record<CharacterFocusScoreKey, Rate> & {
  exactUnique: {
    numerator: number;
    denominator: number;
    rate: number | null;
  };
  worstSpeakerExactUnique: {
    profileId: string | null;
    numerator: number;
    denominator: number;
    rate: number | null;
  };
  longestExactRepeatRun: number;
};

export type CharacterFocusAblationReport = {
  schemaVersion: 1;
  logicalOutputs: number;
  reviewerAgreement: {
    agreements: number;
    comparableCells: number;
    rate: number | null;
    disagreements: Array<{
      outputId: string;
      metric: CharacterFocusScoreKey;
      reviewerA: 0 | 1;
      reviewerB: 0 | 1;
    }>;
  };
  arms: Record<CharacterFocusAblationArm, ArmMetrics>;
  focusCalibration: {
    weakCueSharp: Rate;
    weakCueStrained: Rate;
    sharpMinusStrained: number | null;
    strongCueSharp: Rate;
    strongCueStrained: Rate;
    strainedMinusSharp: number | null;
    lowFocusJointProseD: Rate;
    matchedJointProseC: Rate;
    dMinusC: number | null;
  };
  acceptance: {
    observerSafetyZeroEveryArm: boolean;
    cFreshEvidenceGrounding: boolean;
    cFreshEvidenceDeltaFromA: boolean;
    cSemanticResponse: boolean;
    cSemanticResponseDeltaFromA: boolean;
    cUnsupportedNovelty: boolean;
    cCharacterConsistency: boolean;
    cNoChangeRestraint: boolean;
    worstSpeakerExactUnique: boolean;
    longestExactRepeatRun: boolean;
    weakCueFocusCalibration: boolean;
    strongCueNonInferiority: boolean;
    lowFocusProseNonInferiority: boolean;
  };
  directionalComparisons: {
    bMinusA: {
      freshEvidenceGrounding: number | null;
      semanticResponse: number | null;
    };
    cMinusB: {
      freshEvidenceGrounding: number | null;
      semanticResponse: number | null;
    };
  };
  boundary: string;
};

function validateScoreSet(
  label: string,
  values: readonly CharacterFocusHumanScore[],
  requests: readonly CharacterFocusAblationRequest[],
): Map<string, CharacterFocusHumanScore> {
  const byId = new Map<string, CharacterFocusHumanScore>();
  for (const value of values) {
    if (byId.has(value.outputId)) throw new Error(`${label}: duplicate ${value.outputId}`);
    byId.set(value.outputId, value);
  }
  if (byId.size !== requests.length) {
    throw new Error(`${label}: expected ${requests.length} rows, got ${byId.size}`);
  }
  for (const request of requests) {
    const value = byId.get(request.outputId);
    if (!value) throw new Error(`${label}: missing ${request.outputId}`);
    for (const key of CHARACTER_FOCUS_SCORE_KEYS) {
      const score = value.scores[key];
      if (score !== 0 && score !== 1 && score !== null) {
        throw new Error(`${label}: invalid ${request.outputId}:${key}`);
      }
      const eligible = key === "freshEvidenceGrounding"
        ? request.freshEvidenceEligible
        : key === "semanticResponse"
          ? request.semanticResponseEligible
          : key === "noChangeRestraint"
            ? request.noChangeRestraintEligible
            : true;
      if (eligible && score === null) {
        throw new Error(`${label}: eligible score is NA for ${request.outputId}:${key}`);
      }
      if (!eligible && score !== null) {
        throw new Error(`${label}: ineligible score must be NA for ${request.outputId}:${key}`);
      }
    }
  }
  return byId;
}

function macroRate(
  requests: readonly CharacterFocusAblationRequest[],
  scores: ReadonlyMap<string, CharacterFocusHumanScore>,
  key: CharacterFocusScoreKey,
): Rate {
  const groups = new Map<string, Array<0 | 1>>();
  for (const request of requests) {
    const score = scores.get(request.outputId)!.scores[key];
    if (score === null) continue;
    const group = groups.get(request.scenarioCode) ?? [];
    group.push(score);
    groups.set(request.scenarioCode, group);
  }
  const values = [...groups.values()];
  const numerator = values.flat().reduce<number>((sum, value) => sum + value, 0);
  const denominator = values.reduce((sum, value) => sum + value.length, 0);
  return {
    numerator,
    denominator,
    scenarioMacroRate: values.length === 0
      ? null
      : values.reduce(
        (sum, value) => sum + value.reduce<number>((inner, item) => inner + item, 0) /
          value.length,
        0,
      ) / values.length,
  };
}

function normalizedSpeech(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function exactMetrics(
  requests: readonly CharacterFocusAblationRequest[],
  speeches: ReadonlyMap<string, string>,
): Pick<ArmMetrics, "exactUnique" | "worstSpeakerExactUnique" | "longestExactRepeatRun"> {
  const ordered = [...requests].sort((left, right) =>
    left.profileId.localeCompare(right.profileId) ||
    left.scenarioCode.localeCompare(right.scenarioCode) ||
    left.sample - right.sample
  );
  const all = ordered.map((request) => normalizedSpeech(speeches.get(request.outputId)!));
  const byProfile = new Map<string, string[]>();
  for (let index = 0; index < ordered.length; index += 1) {
    const values = byProfile.get(ordered[index].profileId) ?? [];
    values.push(all[index]);
    byProfile.set(ordered[index].profileId, values);
  }
  const speakers = [...byProfile].map(([profileId, values]) => ({
    profileId,
    numerator: new Set(values).size,
    denominator: values.length,
    rate: values.length > 0 ? new Set(values).size / values.length : null,
  })).sort((left, right) =>
    (left.rate ?? 1) - (right.rate ?? 1) || left.profileId.localeCompare(right.profileId)
  );
  let longest = 0;
  for (const values of byProfile.values()) {
    let run = 0;
    let previous: string | null = null;
    for (const value of values) {
      run = value === previous ? run + 1 : 1;
      previous = value;
      longest = Math.max(longest, run);
    }
  }
  const worst = speakers[0];
  return {
    exactUnique: {
      numerator: new Set(all).size,
      denominator: all.length,
      rate: all.length > 0 ? new Set(all).size / all.length : null,
    },
    worstSpeakerExactUnique: {
      profileId: worst?.profileId ?? null,
      numerator: worst?.numerator ?? 0,
      denominator: worst?.denominator ?? 0,
      rate: worst?.rate ?? null,
    },
    longestExactRepeatRun: longest,
  };
}

function difference(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

function jointProseScores(
  requests: readonly CharacterFocusAblationRequest[],
  scores: ReadonlyMap<string, CharacterFocusHumanScore>,
): Map<string, CharacterFocusHumanScore> {
  return new Map(requests.map((request) => {
    const value = scores.get(request.outputId)!;
    const joint = value.scores.characterConsistency === 1 &&
      value.scores.naturalness === 1 ? 1 : 0;
    return [request.outputId, {
      outputId: request.outputId,
      scores: { ...value.scores, naturalness: joint },
    }];
  }));
}

export function buildCharacterFocusAblationReport(input: {
  reviewerA: readonly CharacterFocusHumanScore[];
  reviewerB: readonly CharacterFocusHumanScore[];
  reconciled: readonly CharacterFocusHumanScore[];
  speeches: ReadonlyMap<string, string>;
}): CharacterFocusAblationReport {
  const requests = buildCharacterFocusAblationRequests();
  const reviewerA = validateScoreSet("reviewerA", input.reviewerA, requests);
  const reviewerB = validateScoreSet("reviewerB", input.reviewerB, requests);
  const reconciled = validateScoreSet("reconciled", input.reconciled, requests);
  for (const request of requests) {
    if (!input.speeches.has(request.outputId)) {
      throw new Error(`speeches: missing ${request.outputId}`);
    }
  }
  const disagreements: CharacterFocusAblationReport["reviewerAgreement"]["disagreements"] = [];
  let comparableCells = 0;
  let agreements = 0;
  for (const request of requests) {
    for (const metric of CHARACTER_FOCUS_SCORE_KEYS) {
      const left = reviewerA.get(request.outputId)!.scores[metric];
      const right = reviewerB.get(request.outputId)!.scores[metric];
      if (left === null || right === null) continue;
      comparableCells += 1;
      if (left === right) agreements += 1;
      else disagreements.push({
        outputId: request.outputId,
        metric,
        reviewerA: left,
        reviewerB: right,
      });
    }
  }

  const arms = Object.fromEntries((["A", "B", "C", "D"] as const).map((arm) => {
    const armRequests = requests.filter((request) => request.arm === arm);
    const metrics = Object.fromEntries(CHARACTER_FOCUS_SCORE_KEYS.map((key) => [
      key,
      macroRate(armRequests, reconciled, key),
    ])) as Record<CharacterFocusScoreKey, Rate>;
    return [arm, {
      ...metrics,
      ...exactMetrics(armRequests, input.speeches),
    }];
  })) as Record<CharacterFocusAblationArm, ArmMetrics>;

  const dWeakSharp = requests.filter((request) =>
    request.arm === "D" && request.cueClass === "weak" &&
    request.replayEffectiveness === "sharp"
  );
  const dWeakStrained = requests.filter((request) =>
    request.arm === "D" && request.cueClass === "weak" &&
    request.replayEffectiveness === "strained"
  );
  const dStrongSharp = requests.filter((request) =>
    request.arm === "D" && request.cueClass === "strong" &&
    request.replayEffectiveness === "sharp"
  );
  const dStrongStrained = requests.filter((request) =>
    request.arm === "D" && request.cueClass === "strong" &&
    request.replayEffectiveness === "strained"
  );
  const dStrained = requests.filter((request) =>
    request.arm === "D" && request.replayEffectiveness === "strained"
  );
  const cMatched = requests.filter((request) =>
    request.arm === "C" && dStrained.some((dRequest) =>
      dRequest.scenarioCode === request.scenarioCode && dRequest.sample === request.sample
    )
  );
  const joint = jointProseScores(requests, reconciled);
  const weakCueSharp = macroRate(dWeakSharp, reconciled, "freshEvidenceGrounding");
  const weakCueStrained = macroRate(dWeakStrained, reconciled, "freshEvidenceGrounding");
  const strongCueSharp = macroRate(dStrongSharp, reconciled, "freshEvidenceGrounding");
  const strongCueStrained = macroRate(dStrongStrained, reconciled, "freshEvidenceGrounding");
  const lowFocusJointProseD = macroRate(dStrained, joint, "naturalness");
  const matchedJointProseC = macroRate(cMatched, joint, "naturalness");
  const rate = (value: Rate): number | null => value.scenarioMacroRate;
  const cGrounding = rate(arms.C.freshEvidenceGrounding);
  const aGrounding = rate(arms.A.freshEvidenceGrounding);
  const bGrounding = rate(arms.B.freshEvidenceGrounding);
  const cSemantic = rate(arms.C.semanticResponse);
  const aSemantic = rate(arms.A.semanticResponse);
  const bSemantic = rate(arms.B.semanticResponse);
  const cNovelty = rate(arms.C.unsupportedNovelty);
  const aNovelty = rate(arms.A.unsupportedNovelty);
  const cConsistency = rate(arms.C.characterConsistency);
  const aConsistency = rate(arms.A.characterConsistency);
  const calibration = difference(rate(weakCueSharp), rate(weakCueStrained));
  const strongDifference = difference(rate(strongCueStrained), rate(strongCueSharp));
  const proseDifference = difference(rate(lowFocusJointProseD), rate(matchedJointProseC));

  return {
    schemaVersion: 1,
    logicalOutputs: requests.length,
    reviewerAgreement: {
      agreements,
      comparableCells,
      rate: comparableCells > 0 ? agreements / comparableCells : null,
      disagreements,
    },
    arms,
    focusCalibration: {
      weakCueSharp,
      weakCueStrained,
      sharpMinusStrained: calibration,
      strongCueSharp,
      strongCueStrained,
      strainedMinusSharp: strongDifference,
      lowFocusJointProseD,
      matchedJointProseC,
      dMinusC: proseDifference,
    },
    acceptance: {
      observerSafetyZeroEveryArm: (["A", "B", "C", "D"] as const)
        .every((arm) => arms[arm].observerSafetyViolation.numerator === 0),
      cFreshEvidenceGrounding: cGrounding !== null && cGrounding >= 0.75,
      cFreshEvidenceDeltaFromA:
        difference(cGrounding, aGrounding) !== null &&
        difference(cGrounding, aGrounding)! >= 0.20,
      cSemanticResponse: cSemantic !== null && cSemantic >= 0.75,
      cSemanticResponseDeltaFromA:
        difference(cSemantic, aSemantic) !== null &&
        difference(cSemantic, aSemantic)! >= 0.15,
      cUnsupportedNovelty:
        cNovelty !== null && aNovelty !== null && cNovelty <= aNovelty + 0.05,
      cCharacterConsistency:
        cConsistency !== null && aConsistency !== null &&
        cConsistency >= aConsistency - 0.05,
      cNoChangeRestraint:
        rate(arms.C.noChangeRestraint) !== null &&
        rate(arms.C.noChangeRestraint)! >= 0.80,
      worstSpeakerExactUnique: (["A", "B", "C", "D"] as const).every((arm) =>
        (arms[arm].worstSpeakerExactUnique.rate ?? 0) >= 0.60
      ),
      longestExactRepeatRun: (["A", "B", "C", "D"] as const).every((arm) =>
        arms[arm].longestExactRepeatRun <= 2
      ),
      weakCueFocusCalibration: calibration !== null && calibration >= 0.20,
      strongCueNonInferiority: strongDifference !== null && strongDifference >= -0.10,
      lowFocusProseNonInferiority: proseDifference !== null && proseDifference >= -0.05,
    },
    directionalComparisons: {
      bMinusA: {
        freshEvidenceGrounding: difference(bGrounding, aGrounding),
        semanticResponse: difference(bSemantic, aSemantic),
      },
      cMinusB: {
        freshEvidenceGrounding: difference(cGrounding, bGrounding),
        semanticResponse: difference(cSemantic, bSemantic),
      },
    },
    boundary:
      "Fixed-fixture evidence only. Passing does not authorize an opt-in candidate, staging, release, or production use; the owner must decide the supported component separately.",
  };
}
