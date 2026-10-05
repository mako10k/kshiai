// R: Resolve battle existence and actor access before reads, progress and replay.
import * as battleRepo from "../repositories/battles.js";

type BattleMeta = NonNullable<Awaited<ReturnType<typeof battleRepo.getBattleMeta>>>;
export type BattleAccess =
  | { kind: "available"; meta: BattleMeta }
  | { kind: "not_found" }
  | { kind: "forbidden" };

export async function readBattleAccess(battleId: string, actorId: string): Promise<BattleAccess> {
  const meta = await battleRepo.getBattleMeta(battleId);
  if (!meta) return { kind: "not_found" };
  if (meta.side_a_user_id !== actorId) return { kind: "forbidden" };
  return { kind: "available", meta };
}
