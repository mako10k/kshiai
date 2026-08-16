import type {
  BattleAdvancePhase,
  BattleNarrationEntryPublic,
  NarrativeBlock,
} from "@kshiai/shared";

const PHASE_HEADING: Record<BattleNarrationEntryPublic["phase"], string> = {
  prologue: "プロローグ",
  combat: "戦闘",
  judgment: "最終判定",
  aftermath: "決着の余波",
};

const PHASE_PROGRESS: Record<BattleAdvancePhase, string> = {
  resolving: "局面を解決しています…",
  agents: "キャラの反応を紡いでいます…",
  narrating: "ナレーションを予約しています…",
  finalizing: "記録しています…",
};

export type BattleStoryBlock = {
  key: string;
  heading: string;
  streaming: boolean;
  narrative: NarrativeBlock | null;
  pendingText: string | null;
};

/** Story is the narration stream. Legacy log is only a first-paint fallback. */
export function battleStoryBlocks(input: {
  entries: readonly BattleNarrationEntryPublic[];
  legacyLog: readonly NarrativeBlock[];
}): BattleStoryBlock[] {
  if (input.entries.length > 0) {
    return input.entries.map((entry) => ({
      key: entry.turnReceiptId,
      heading: PHASE_HEADING[entry.phase],
      streaming: entry.narrative === null,
      narrative: entry.narrative,
      pendingText: pendingNarrationText(entry),
    }));
  }
  return input.legacyLog.map((block, index) => ({
    key: `legacy-${block.turn}-${index}`,
    heading: legacyHeading(block),
    streaming: false,
    narrative: block,
    pendingText: null,
  }));
}

export function battleProgressText(input: {
  paused: boolean;
  error: string | null;
  busy: boolean;
  phase: BattleAdvancePhase | null;
}): string {
  if (input.error) return "進行できませんでした";
  if (input.paused) return "一時停止中";
  if (input.busy) return input.phase ? PHASE_PROGRESS[input.phase] : "進めています…";
  return "自動進行中";
}

function pendingNarrationText(
  entry: BattleNarrationEntryPublic,
): string | null {
  if (entry.narrative) return null;
  if (entry.status === "generating") return "語りを生成しています…";
  if (entry.status === "failed") return "語りを用意できませんでした。";
  return "順番を待っています…";
}

function legacyHeading(block: NarrativeBlock): string {
  if (block.narrator[0]?.includes("判定")) return "最終判定";
  if (
    block.narrator[0]?.includes("開幕") ||
    block.narrator[0]?.includes("プロローグ")
  ) {
    return "プロローグ";
  }
  if (block.turn > 0) return "戦闘";
  return "物語";
}
