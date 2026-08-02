import { z } from "zod";

export const RegisterRequestSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(128),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = RegisterRequestSchema;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UserPublicSchema = z.object({
  id: z.string(),
  username: z.string(),
});
export type UserPublic = z.infer<typeof UserPublicSchema>;

export const GenerateCharacterRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
});
export type GenerateCharacterRequest = z.infer<typeof GenerateCharacterRequestSchema>;

export const CharacterChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
});
export type CharacterChatRequest = z.infer<typeof CharacterChatRequestSchema>;

export const GeneratePoliciesRequestSchema = z.object({
  myCharacterId: z.string(),
  opponentCharacterId: z.string().optional(),
  battlefieldPresetId: z.string().optional(),
  battlefieldMode: z.enum(["random", "preset"]).optional(),
});
export type GeneratePoliciesRequest = z.infer<
  typeof GeneratePoliciesRequestSchema
>;

export const CreateBattleRequestSchema = z.object({
  myCharacterId: z.string(),
  opponentCharacterId: z.string(),
  /**
   * Battlefield selection:
   * - omit / "random" → random concretized field (default)
   * - preset id → concretize from that preset
   */
  battlefieldPresetId: z.string().optional(),
  battlefieldMode: z.enum(["random", "preset"]).optional(),
  /**
   * @deprecated Use policies + selectedPolicyIds (LLM case policies).
   */
  stance: z
    .enum(["aggressive", "balanced", "defensive", "opportunistic"])
    .optional(),
  /**
   * Case policies generated for this matchup (full engine objects).
   * selectedPolicyIds: multi-select; omit to use defaultSelected flags.
   */
  policies: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        when: z.string(),
        then: z.string(),
        bias: z
          .enum(["attack", "defend", "support", "wait", "mixed"])
          .optional(),
        priority: z.number().optional(),
        triggers: z
          .object({
            earlyTurn: z.boolean().optional(),
            lateTurn: z.boolean().optional(),
            myHpBelow: z.number().optional(),
            myHpAbove: z.number().optional(),
            foeHpBelow: z.number().optional(),
            foeHpAbove: z.number().optional(),
            always: z.boolean().optional(),
          })
          .optional(),
        defaultSelected: z.boolean().optional(),
      }),
    )
    .optional(),
  selectedPolicyIds: z.array(z.string()).optional(),
});
export type CreateBattleRequest = z.infer<typeof CreateBattleRequestSchema>;

export const GenerateBattlefieldRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  category: z
    .enum([
      "forest",
      "arena",
      "sea",
      "urban",
      "school",
      "mountain",
      "ruins",
      "custom",
    ])
    .optional(),
});
export type GenerateBattlefieldRequest = z.infer<
  typeof GenerateBattlefieldRequestSchema
>;

export const BattlefieldChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
});
export type BattlefieldChatRequest = z.infer<typeof BattlefieldChatRequestSchema>;

export const SaveBattlefieldFromBattleRequestSchema = z.object({
  battleId: z.string(),
  displayName: z.string().min(1).max(64).optional(),
});
export type SaveBattlefieldFromBattleRequest = z.infer<
  typeof SaveBattlefieldFromBattleRequestSchema
>;

/** @deprecated Prefer POST .../advance — per-turn actions are automatic. */
export const BattleActionRequestSchema = z.object({
  kind: z.enum(["skill", "defend", "wait"]).optional(),
  skillId: z.string().optional(),
});
export type BattleActionRequest = z.infer<typeof BattleActionRequestSchema>;

/** Advance one turn; engine picks actions from stances. */
export const BattleAdvanceRequestSchema = z.object({}).passthrough();
export type BattleAdvanceRequest = z.infer<typeof BattleAdvanceRequestSchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});
