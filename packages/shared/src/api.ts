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
  /** Public-facing display name; defaults to a generated handle when unset. */
  displayName: z.string(),
  /** A navigation hint only; the server still enforces administrator access. */
  isAdmin: z.boolean().optional(),
});
export type UserPublic = z.infer<typeof UserPublicSchema>;

export const FriendPublicSchema = UserPublicSchema.omit({ isAdmin: true }).extend({
  createdAt: z.string(),
});
export type FriendPublic = z.infer<typeof FriendPublicSchema>;

export const AddFriendRequestSchema = z.object({
  username: z.string().min(1).max(32).optional(),
  userId: z.string().min(1).optional(),
}).refine((value) => Boolean(value.username?.trim() || value.userId?.trim()), {
  message: "username_or_userId_required",
});
export type AddFriendRequest = z.infer<typeof AddFriendRequestSchema>;

export const UpdateDisplayNameRequestSchema = z.object({
  displayName: z.string().min(1).max(32),
});
export type UpdateDisplayNameRequest = z.infer<
  typeof UpdateDisplayNameRequestSchema
>;

export const UserProfilePublicSchema = UserPublicSchema.omit({
  isAdmin: true,
}).extend({
  createdAt: z.string().optional(),
  characterCount: z.number().int().nonnegative().optional(),
  relation: z
    .object({
      isSelf: z.boolean(),
      isFriend: z.boolean(),
      isFavorite: z.boolean(),
      outgoingFriendRequest: z.boolean(),
      incomingFriendRequest: z.boolean(),
    })
    .optional(),
});
export type UserProfilePublic = z.infer<typeof UserProfilePublicSchema>;

export const CharacterVisibilityUpdateSchema = z.object({
  visibility: z.enum(["public", "friends", "private"]),
});
export type CharacterVisibilityUpdate = z.infer<
  typeof CharacterVisibilityUpdateSchema
>;

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
   * - omit / "random" → compile one ready system preset (default)
   * - preset id → bind and deterministically compile that exact ready revision
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
  /** Narration style id (system or owned). Omit → default. */
  narrationStyleId: z.string().optional(),
});
export type CreateBattleRequest = z.infer<typeof CreateBattleRequestSchema>;

export const UpsertNarrationStyleRequestSchema = z.object({
  displayName: z.string().min(1).max(48),
  description: z.string().max(400).optional(),
  instruction: z.string().min(1).max(2000),
  perspective: z
    .enum(["self", "foe", "external", "omniscient", "fluid"])
    .optional(),
  tags: z.array(z.string().max(24)).max(12).optional(),
});
export type UpsertNarrationStyleRequest = z.infer<
  typeof UpsertNarrationStyleRequestSchema
>;

export const GenerateNarrationStyleRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
});
export type GenerateNarrationStyleRequest = z.infer<
  typeof GenerateNarrationStyleRequestSchema
>;

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
