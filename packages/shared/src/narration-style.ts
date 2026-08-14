import { z } from "zod";
import {
  NarrationPerspectiveSchema,
  PERSPECTIVE_LABELS,
  type NarrationPerspective,
} from "./narration-perspective.js";
import { AssetCompatibilitySchema } from "./structured-assets.js";
import {
  CompiledNarrationPolicyV2Schema,
  type CompiledNarrationPolicyV2,
} from "./structured-narration.js";

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
   * Keep style-only; no combat rules. Does not override perspective gates.
   */
  instruction: z.string().min(1).max(2000),
  /**
   * Information rights for character digests (see narration-perspective.md).
   * Defaults to external for legacy styles.
   */
  perspective: NarrationPerspectiveSchema.default("external"),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NarrationStyle = z.infer<typeof NarrationStyleSchema>;

export const NarrationStylePublicSchema = z.object({
  id: z.string(),
  ownerUserId: z.string().nullable(),
  isSystem: z.boolean(),
  displayName: z.string(),
  description: z.string(),
  perspective: NarrationPerspectiveSchema,
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  compatibility: AssetCompatibilitySchema.optional(),
  selectable: z.boolean().optional(),
  upgradeAction: z.object({
    label: z.string(),
    targetSchemaVersion: z.number().int().positive(),
  }).strict().nullable().optional(),
});
export type NarrationStylePublic = z.infer<typeof NarrationStylePublicSchema>;

/** Snapshot stored on BattleState so mid-match edits don't change the fight. */
export interface NarrationStyleSnapshot {
  id: string;
  displayName: string;
  instruction: string;
  perspective: NarrationPerspective;
  compiledPolicyV2?: CompiledNarrationPolicyV2;
}

export const NarrationStyleSnapshotSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  instruction: z.string(),
  perspective: NarrationPerspectiveSchema.default("external"),
  compiledPolicyV2: CompiledNarrationPolicyV2Schema.optional(),
}).strict() as unknown as z.ZodType<NarrationStyleSnapshot>;

export function toPublicNarrationStyle(
  s: NarrationStyle,
  options?: Pick<NarrationStylePublic, "compatibility" | "selectable" | "upgradeAction">,
): NarrationStylePublic {
  return {
    id: s.id,
    ownerUserId: s.ownerUserId,
    isSystem: s.isSystem,
    displayName: s.displayName,
    description: s.description,
    perspective: s.perspective ?? "external",
    tags: s.tags,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    ...options,
  };
}

export function toNarrationSnapshotV2(
  s: Pick<NarrationStyle, "id" | "displayName">,
  compiledPolicyV2: CompiledNarrationPolicyV2,
): NarrationStyleSnapshot {
  const parsed = CompiledNarrationPolicyV2Schema.parse(compiledPolicyV2);
  return {
    id: s.id,
    displayName: s.displayName,
    instruction: parsed.fallbackInstruction,
    perspective: parsed.perspective,
    compiledPolicyV2: parsed,
  };
}

export function narrationInstructionForPhase(
  snapshot: NarrationStyleSnapshot | undefined,
  phase: "prologue" | "combat" | "judgment" | "aftermath",
): string | undefined {
  if (!snapshot) return undefined;
  const compiled = snapshot.compiledPolicyV2;
  if (!compiled) return snapshot.instruction;
  if (phase === "combat") {
    return [
      compiled.phases.action.instruction.slice(0, 1900),
      compiled.phases.impact.instruction.slice(0, 1900),
      compiled.phases.release.instruction.slice(0, 1900),
    ].join("\n\n").slice(0, 6000);
  }
  return compiled.phases[phase].instruction;
}

export function perspectiveLabel(p: NarrationPerspective | undefined): string {
  return PERSPECTIVE_LABELS[p ?? "external"];
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
      "落ち着いた三人称で、簡潔に戦況を語る。技名と場面の空気を適度に織り交ぜ、地の文3〜5行。両名の短いセリフまたは反応を speeches に必ず含める。過度な実況や解説はしない。",
    perspective: "external",
    tags: ["標準", "物語", "三人称"],
  },
  {
    id: "nst_friendly",
    ownerUserId: null,
    isSystem: true,
    displayName: "フレンドリー",
    description: "親しみやすい語り口。軽くて読みやすい。",
    instruction:
      "親しみやすくフレンドリーな口調で語る。少しだけ軽口やツッコミを交えてよいが下品にはしない。読者が応援したくなる温度感。地の文は短め、セリフは生き生きと speeches へ。",
    perspective: "external",
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
    perspective: "external",
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
    perspective: "external",
    tags: ["実況", "テンポ"],
  },
  {
    id: "nst_novel",
    ownerUserId: null,
    isSystem: true,
    displayName: "小説調",
    description: "文学的な描写で雰囲気を重視する。",
    instruction:
      "ライトノベル〜文芸寄りの三人称。風景・呼吸・視線など感覚描写を重視。美文すぎず読みやすく。セリフは情感を込めて短く speeches に。",
    perspective: "external",
    tags: ["小説", "雰囲気"],
  },
  {
    id: "nst_laconic",
    ownerUserId: null,
    isSystem: true,
    displayName: "簡潔",
    description: "事実だけを短く。テンポ最優先。",
    instruction:
      "極端に簡潔。各イベントを1行程度で述べ、余計な修飾は削る。地の文は合計2〜4行まで。両名の反応は speeches に短く。",
    perspective: "external",
    tags: ["短い", "テンポ"],
  },
  {
    id: "nst_subjective",
    ownerUserId: null,
    isSystem: true,
    displayName: "主観ドラマ",
    description: "自分側の内心を織り交ぜる一人称寄り。相手の秘密は見えない。",
    instruction:
      "プレイヤー側キャラの息遣い・独白を地の文に織る。相手は外面と行動だけで描く。数値は出さない。",
    perspective: "self",
    tags: ["一人称", "主観"],
  },
  {
    id: "nst_foe_mind",
    ownerUserId: null,
    isSystem: true,
    displayName: "相手の内心",
    description: "対戦相手の思考に寄り添う視点。自分側の秘密は出さない。",
    instruction:
      "相手キャラの内面・狙いを中心に語る。プレイヤー側は見える行動のみ。不必要に残酷にしない。",
    perspective: "foe",
    tags: ["相手視点"],
  },
  {
    id: "nst_omniscient",
    ownerUserId: null,
    isSystem: true,
    displayName: "全知",
    description: "両名の思惑を織れる全知の三人称。",
    instruction:
      "両名の意図や感情を対比しつつ語る。ネタバレしすぎず、緊張感を保つ。",
    perspective: "omniscient",
    tags: ["全知", "群像"],
  },
  {
    id: "nst_fluid",
    ownerUserId: null,
    isSystem: true,
    displayName: "可変視点",
    description: "ターンごとにカメラが寄る側を変えられる群像調。",
    instruction:
      "映画のカメラのように、そのターン焦点の人物へ寄せてよい。視点移動は地の文で自然に。焦点外の内心は書かない。",
    perspective: "fluid",
    tags: ["可変", "群像"],
  },
];

export const DEFAULT_NARRATION_STYLE_ID = "nst_default";

export function defaultNarrationSnapshot(): NarrationStyleSnapshot {
  const d = SYSTEM_NARRATION_STYLE_SEEDS[0]!;
  return {
    id: d.id,
    displayName: d.displayName,
    instruction: d.instruction,
    perspective: d.perspective ?? "external",
  };
}
