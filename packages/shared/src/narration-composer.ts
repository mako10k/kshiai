import type { NarrationTurnView } from "./narration-perception.js";

export type ComposedNarration = {
  turn: number;
  narrator: string[];
  speeches: Array<{ speaker: string; text: string }>;
};

type DramaHint = {
  phase?: "opening" | "rising" | "climax";
  environmentBeatDue?: boolean;
  repeatedActionA?: number;
  repeatedActionB?: number;
  progressionHint?: string;
};

/**
 * Last-resort public narration when the LLM narrator fails.
 * Must remain a narrator-shaped product: never dump engine event.summary,
 * action outcome lists, or other internal combat telemetry into the log.
 */
export function composeNarratorTurn(input: {
  view: NarrationTurnView;
  drama?: DramaHint | null;
  recentNarration?: string[];
}): ComposedNarration {
  const { view } = input;
  const place = view.battlefield?.displayName
    ? `${view.scene}（${view.battlefield.displayName}）`
    : view.scene;
  const a = view.participantLabels.a;
  const b = view.participantLabels.b;
  const beats = view.actionBeats.slice(0, 2);
  const phase = input.drama?.phase ?? "rising";

  const hint = input.drama?.progressionHint ?? "change_leverage";
  const lead =
    beats[0]
      ? `${beats[0].actorLabel} が ${beats[0].actionName} を仕掛ける。${cleanDescription(beats[0].description)}`.trim()
      : phase === "climax"
        ? `${place}で、決着の気配が濃くなる。`
        : `${place}で、対峙の重心が動く。`;

  const actionLines = beats.slice(1).map((beat) => {
    const foe = beat.actorLabel === a ? b : a;
    const detail = cleanDescription(beat.description);
    return detail
      ? `${beat.actorLabel} は ${beat.actionName} で応じ、${foe} との間合いが動く。${detail}`
      : `${beat.actorLabel} は ${beat.actionName} で応じる。`;
  });

  const consequence = narrativeConsequence(view, a, b, hint);
  const environment =
    input.drama?.environmentBeatDue
      ? "場の配置が変わり、次の一手の条件が書き換わる。"
      : null;
  const progression =
    hint === "escalate_repeated_action" || hint === "break_stalemate"
      ? "同じ型の押し合いを破り、主導権の所在がはっきり傾く。"
      : hint === "one_sided_pressure"
        ? "一方が動かない分、仕掛ける側の圧が場を占有する。"
        : hint === "force_commitment"
          ? "後戻りしにくい一手が選ばれ、決着への距離が縮まる。"
          : null;

  const recent = new Set(
    (input.recentNarration ?? []).map(normalizeForDedup).filter(Boolean),
  );
  const narrator = [
    lead,
    ...actionLines,
    consequence,
    environment,
    progression,
  ]
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => line.trim())
    .filter((line, index, lines) => {
      const key = normalizeForDedup(line);
      if (!key || recent.has(key)) return false;
      return lines.findIndex((candidate) => normalizeForDedup(candidate) === key) ===
        index;
    })
    .slice(0, 4);

  while (narrator.length < 2) {
    narrator.push(
      narrator.length === 0
        ? `${place}で、${a} と ${b} の対峙が続く。`
        : "息が合い、次の一手を探る沈黙が落ちる。",
    );
  }

  // Last-resort path may omit speeches rather than invent repeating stock lines.
  // Public dialogue should prefer silence over server-authored filler.
  const speeches: Array<{ speaker: string; text: string }> = [];

  return {
    turn: view.turn,
    narrator,
    speeches,
  };
}

function cleanDescription(description: string): string {
  const text = description.trim();
  if (!text) return "";
  // Avoid dumping long skill encyclopedia text into the public log.
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function narrativeConsequence(
  view: NarrationTurnView,
  sideA: string,
  sideB: string,
  hint: string,
): string | null {
  const joined = [
    ...view.actionBeats.flatMap((beat) => beat.outcomes),
    ...view.events.map((event) => event.summary),
  ].join(" ");
  if (/とどめ|決め手|戦闘不能/.test(joined)) {
    return "その一手が場を決定づけ、一方の継戦を断ち切る。";
  }
  if (/守|防御|構え|防御を/.test(joined)) {
    return `${sideB} の守りが通った分、${sideA} の攻めがいったんしぼむ。`;
  }
  if (/回復|持ち直|休息|呼吸/.test(joined)) {
    return "短く間を取り、次の押し込みへ向けて呼吸が戻る。";
  }
  if (hint === "one_sided_pressure" && view.actionBeats.length === 1) {
    return `${view.actionBeats[0]!.actorLabel} が主導を握り、相手は出遅れを払う。`;
  }
  if (view.actionBeats.length >= 2) {
    return `${sideA} と ${sideB} の手が交差し、主導権が一方へ寄る。`;
  }
  if (view.actionBeats.length === 1) {
    return `${view.actionBeats[0]!.actorLabel} が半歩分の地を取り、次の間合いが変わる。`;
  }
  return "双方が探り合い、わずかに有利不利が入れ替わる。";
}

function normalizeForDedup(value: string): string {
  return value.normalize("NFKC").replace(/[\s「」『』（）()、。！？!?…・]/g, "");
}
