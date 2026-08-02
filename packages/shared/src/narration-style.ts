import { z } from "zod";

/**
 * How battle narration is voiced — selectable at match start,
 * customizable like characters (system presets + user-owned styles).
 */
export const NarrationStyleSchema = z.object({
  id: z.string(),
  ownerUserId: z.string().nullable().default(null),
  isSystem: z.boolean().default(false),
  displayName: z.string().min(1).max(48),
  /** Short blurb for pickers. */
  description: z.string().default(""),
  /**
   * LLM instruction (Japanese OK). Applied to turn/aftermath narration.
   * Keep style-only; no combat rules.
   */
  instruction: z.string().min(1).max(2000),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NarrationStyle = z.infer<typeof NarrationStyleSchema>;

export const NarrationStylePublicSchema = NarrationStyleSchema.pick({
  id: true,
  ownerUserId: true,
  isSystem: true,
  displayName: true,
  description: true,
  instruction: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
});
export type NarrationStylePublic = z.infer<typeof NarrationStylePublicSchema>;

/** Snapshot stored on BattleState so mid-match edits don't change the fight. */
export const NarrationStyleSnapshotSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  instruction: z.string(),
});
export type NarrationStyleSnapshot = z.infer<typeof NarrationStyleSnapshotSchema>;

export function toPublicNarrationStyle(s: NarrationStyle): NarrationStylePublic {
  return {
    id: s.id,
    ownerUserId: s.ownerUserId,
    isSystem: s.isSystem,
    displayName: s.displayName,
    description: s.description,
    instruction: s.instruction,
    tags: s.tags,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export function toNarrationSnapshot(
  s: Pick<NarrationStyle, "id" | "displayName" | "instruction">,
): NarrationStyleSnapshot {
  return {
    id: s.id,
    displayName: s.displayName,
    instruction: s.instruction,
  };
}

/** Built-in presets (ids fixed for seeding). */
export const SYSTEM_NARRATION_STYLE_SEEDS: Omit<
  NarrationStyle,
  "createdAt" | "updatedAt"
>[] = [
  {
    id: "nst_default",
    ownerUserId: null,
    isSystem: true,
    displayName: "デフォルト",
    description: "落ち着いた三人称の物語調。過不足のない標準スタイル。",
    instruction:
      "落ち着いた三人称で、簡潔に戦況を語る。技名と場面の空気を適度に織り交ぜ、地の文3〜5行＋短いセリフ0〜2を目安に。過度な実況や解説はしない。",
    tags: ["標準", "物語"],
  },
  {
    id: "nst_friendly",
    ownerUserId: null,
    isSystem: true,
    displayName: "フレンドリー",
    description: "親しみやすい語り口。軽くて読みやすい。",
    instruction:
      "親しみやすくフレンドリーな口調で語る。少しだけ軽口やツッコミを交えてよいが下品にはしない。読者が応援したくなる温度感。地の文は短め、セリフは生き生きと。",
    tags: ["気軽", "明るい"],
  },
  {
    id: "nst_detailed",
    ownerUserId: null,
    isSystem: true,
    displayName: "詳細解説",
    description: "動きの意図や間合いを丁寧に解説するスタイル。",
    instruction:
      "戦術・間合い・体勢の変化を丁寧に解説する。ただし数値（HP等）は出さない。「なぜその一手か」を一文添える。地の文は5〜8行程度まで詳しくてよい。",
    tags: ["解説", "丁寧"],
  },
  {
    id: "nst_broadcast",
    ownerUserId: null,
    isSystem: true,
    displayName: "実況風",
    description: "スポーツ実況のようにテンポよく盛り上げる。",
    instruction:
      "スポーツ実況風にテンポよく盛り上げる。「さあ！」「これは…！」など感嘆を適度に。専門的すぎる分析より臨場感。短文を連ねる。",
    tags: ["実況", "テンポ"],
  },
  {
    id: "nst_novel",
    ownerUserId: null,
    isSystem: true,
    displayName: "小説調",
    description: "文学的な描写で雰囲気を重視する。",
    instruction:
      "ライトノベル〜文芸寄りの三人称。風景・呼吸・視線など感覚描写を重視。美文すぎず読みやすく。セリフは情感を込めて短く。",
    tags: ["小説", "雰囲気"],
  },
  {
    id: "nst_laconic",
    ownerUserId: null,
    isSystem: true,
    displayName: "簡潔",
    description: "事実だけを短く。テンポ最優先。",
    instruction:
      "極端に簡潔。各イベントを1行程度で述べ、余計な修飾は削る。地の文は合計2〜4行まで。セリフは0〜1。",
    tags: ["短い", "テンポ"],
  },
];

export const DEFAULT_NARRATION_STYLE_ID = "nst_default";

export function defaultNarrationSnapshot(): NarrationStyleSnapshot {
  const d = SYSTEM_NARRATION_STYLE_SEEDS[0]!;
  return {
    id: d.id,
    displayName: d.displayName,
    instruction: d.instruction,
  };
}
