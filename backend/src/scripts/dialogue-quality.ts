import { isStageReaction, type NarrativeBlock } from "@kshiai/shared";

export type DialogueSpeakerQuality = {
  speaker: string;
  totalLines: number;
  reactionLines: number;
  uniqueLines: number;
  exactDuplicateLines: number;
  exactUniqueRate: number;
  longestExactRepeatRun: number;
  wordCount: number;
  uniqueWordCount: number;
  lexicalDiversity: number | null;
  counterpartUtteranceContexts: number;
  nonReactionLinesAfterCounterpartUtterance: number;
};

export type DialogueQualityMetrics = {
  schemaVersion: 2;
  totalLines: number;
  reactionLines: number;
  uniqueLines: number;
  exactDuplicateLines: number;
  exactUniqueRate: number | null;
  worstSpeakerExactUniqueRate: number | null;
  longestExactRepeatRun: number;
  speakerMetrics: DialogueSpeakerQuality[];
};

type OrderedSpeech = {
  speaker: string;
  normalizedText: string;
  isReaction: boolean;
  words: string[];
};

const wordSegmenter = new Intl.Segmenter("ja", { granularity: "word" });

function normalizeSpeech(text: string): string {
  return text.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function wordsIn(text: string): string[] {
  return [...wordSegmenter.segment(text)]
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment.normalize("NFKC").toLocaleLowerCase("ja"));
}

function orderedSpeeches(log: readonly NarrativeBlock[]): OrderedSpeech[] {
  return log.flatMap((block) => block.speeches.map((speech) => {
    const normalizedText = normalizeSpeech(speech.text);
    return {
      speaker: speech.speaker,
      normalizedText,
      isReaction: isStageReaction(normalizedText),
      words: wordsIn(normalizedText),
    };
  }));
}

function longestRepeatRun(lines: readonly OrderedSpeech[]): number {
  let longest = 0;
  let current = 0;
  let previous: string | null = null;
  for (const line of lines) {
    current = line.normalizedText === previous ? current + 1 : 1;
    previous = line.normalizedText;
    longest = Math.max(longest, current);
  }
  return longest;
}

/**
 * Measures text shape only. It is a test-observation aid and is never read by
 * battle resolution, agent action selection, persistence rules, or narration.
 */
export function assessDialogueQuality(
  log: readonly NarrativeBlock[],
): DialogueQualityMetrics {
  const speeches = orderedSpeeches(log);
  const bySpeaker = new Map<string, OrderedSpeech[]>();
  for (const speech of speeches) {
    bySpeaker.set(speech.speaker, [...(bySpeaker.get(speech.speaker) ?? []), speech]);
  }

  const speakerMetrics = [...bySpeaker.entries()].map(([speaker, lines]) => {
    const uniqueLines = new Set(lines.map((line) => line.normalizedText)).size;
    const words = lines.flatMap((line) => line.words);
    const uniqueWords = new Set(words).size;
    let counterpartUtteranceContexts = 0;
    let nonReactionLinesAfterCounterpartUtterance = 0;
    for (const line of lines) {
      const index = speeches.indexOf(line);
      const hasCounterpartUtterance = speeches
        .slice(0, index)
        .some((prior) => prior.speaker !== speaker);
      if (!hasCounterpartUtterance) continue;
      counterpartUtteranceContexts += 1;
      if (!line.isReaction) nonReactionLinesAfterCounterpartUtterance += 1;
    }
    return {
      speaker,
      totalLines: lines.length,
      reactionLines: lines.filter((line) => line.isReaction).length,
      uniqueLines,
      exactDuplicateLines: lines.length - uniqueLines,
      exactUniqueRate: uniqueLines / lines.length,
      longestExactRepeatRun: longestRepeatRun(lines),
      wordCount: words.length,
      uniqueWordCount: uniqueWords,
      lexicalDiversity: words.length > 0 ? uniqueWords / words.length : null,
      counterpartUtteranceContexts,
      nonReactionLinesAfterCounterpartUtterance,
    } satisfies DialogueSpeakerQuality;
  });
  const uniqueLines = new Set(speeches.map((speech) => speech.normalizedText)).size;
  return {
    schemaVersion: 2,
    totalLines: speeches.length,
    reactionLines: speeches.filter((speech) => speech.isReaction).length,
    uniqueLines,
    exactDuplicateLines: speeches.length - uniqueLines,
    exactUniqueRate: speeches.length > 0 ? uniqueLines / speeches.length : null,
    worstSpeakerExactUniqueRate: speakerMetrics.length > 0
      ? Math.min(...speakerMetrics.map((metric) => metric.exactUniqueRate))
      : null,
    longestExactRepeatRun: speakerMetrics.length > 0
      ? Math.max(...speakerMetrics.map((metric) => metric.longestExactRepeatRun))
      : 0,
    speakerMetrics,
  };
}
