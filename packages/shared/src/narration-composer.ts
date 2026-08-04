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

  const phaseLead =
    phase === "opening"
      ? `${place}で、互いの位置と気配がまだ定まらない。`
      : phase === "climax"
        ? `${place}の空気が張り詰め、一手が決着へ傾く。`
        : `${place}で、流れが静かに押し合う。`;

  const actionLines = beats.map((beat, index) => {
    const foe = beat.actorLabel === a ? b : a;
    const detail = cleanDescription(beat.description);
    if (index === 0) {
      return detail
        ? `${beat.actorLabel} が ${beat.actionName} を仕掛ける。${detail}`
        : `${beat.actorLabel} が ${beat.actionName} を仕掛ける。`;
    }
    return detail
      ? `${beat.actorLabel} は ${beat.actionName} で応じ、${foe} との間合いが動く。${detail}`
      : `${beat.actorLabel} は ${beat.actionName} で応じる。`;
  });

  const consequence = narrativeConsequence(view, a, b);
  const environment =
    input.drama?.environmentBeatDue
      ? "足元の景色や障害の位置も、二人の動きに合わせて組み替わる。"
      : null;
  const repetition =
    (input.drama?.repeatedActionA ?? 0) >= 2 ||
    (input.drama?.repeatedActionB ?? 0) >= 2
      ? "同じ手の繰り返しに見えるが、角度と間がわずかに違う。"
      : null;

  const recent = new Set(
    (input.recentNarration ?? []).map(normalizeForDedup).filter(Boolean),
  );
  const narrator = [
    phaseLead,
    ...actionLines,
    consequence,
    environment,
    repetition,
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

  const speeches = permittedSpeakers(view).map((speaker, index) => ({
    speaker,
    text: index === 0
      ? (phase === "climax" ? "ここで決める。" : "まだ、動ける。")
      : (phase === "climax" ? "終わらせない。" : "その流れは読んだ。"),
  }));

  return {
    turn: view.turn,
    narrator,
    speeches,
  };
}

function permittedSpeakers(view: NarrationTurnView): string[] {
  const a = view.participantLabels.a;
  const b = view.participantLabels.b;
  if (view.perception.mode === "self") {
    return view.perception.frame.counterpart.currentAccess === "none"
      ? [a]
      : [a, b];
  }
  if (view.perception.mode === "opponent") {
    return view.perception.frame.counterpart.currentAccess === "none"
      ? [b]
      : [a, b];
  }
  return [a, b];
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
): string | null {
  const joined = [
    ...view.actionBeats.flatMap((beat) => beat.outcomes),
    ...view.events.map((event) => event.summary),
  ].join(" ");
  if (/とどめ|決め手|戦闘不能/.test(joined)) {
    return "その一撃が場を決定づけ、一方の継戦を断ち切る。";
  }
  if (/守|防御|構え|防御を/.test(joined)) {
    return "守りが噛み合い、勢いがいったんしぼむ。";
  }
  if (/回復|持ち直|休息|呼吸/.test(joined)) {
    return "短く間を取り、呼吸と力が戻る。";
  }
  if (view.actionBeats.length >= 2) {
    return `${sideA} と ${sideB} の手が交差し、場の重心がわずかに傾く。`;
  }
  if (view.actionBeats.length === 1) {
    return "反応が遅れ、次の一手を選ぶ隙が生まれる。";
  }
  return "まだ決着の気配は薄く、双方が相手の出方を計る。";
}

function normalizeForDedup(value: string): string {
  return value.normalize("NFKC").replace(/[\s「」『』（）()、。！？!?…・]/g, "");
}
