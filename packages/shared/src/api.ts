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

export const CreateBattleRequestSchema = z.object({
  myCharacterId: z.string(),
  opponentCharacterId: z.string(),
});
export type CreateBattleRequest = z.infer<typeof CreateBattleRequestSchema>;

export const BattleActionRequestSchema = z.object({
  kind: z.enum(["skill", "defend", "wait"]),
  skillId: z.string().optional(),
});
export type BattleActionRequest = z.infer<typeof BattleActionRequestSchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});
