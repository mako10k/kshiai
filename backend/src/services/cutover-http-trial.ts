// R: Validate trial HTTP request bindings and immutable character generation participants.
import { CharacterGenerationEnvelopeV3Schema } from "@kshiai/shared";
import { query } from "../db.js";
import {
  assertCutoverTrialBattle,
  CutoverUnavailableError,
  cutoverRequestDigest,
} from "./cutover-admission.js";
import type { CutoverControl } from "../repositories/cutover-control.js";

export async function assertTrialHttpRequest(input: {
  control: CutoverControl;
  userId: string;
  method: string;
  path: string;
  request: unknown;
  battleId?: string;
  bindingOperationId?: string;
}): Promise<void> {
  if (input.control.phase !== "trial") return;
  const digest = cutoverRequestDigest(input.request);
  const binding = input.control.policy.trialBindings?.requests.find((candidate) =>
    candidate.kind === "http" && candidate.requestDigest === digest &&
    candidate.method === input.method && candidate.path === input.path &&
    candidate.battleId === input.battleId &&
    (!input.bindingOperationId || candidate.bindingOperationId === input.bindingOperationId));
  if (!binding || input.userId !== input.control.policy.ownerUserId) throw new CutoverUnavailableError();
  if (isBattleCreate(input)) await assertTrialCreateParticipants(input.control, input.userId, input.request);
  if (input.battleId && input.path !== "/api/battles") await assertCutoverTrialBattle(input.control, input.battleId);
}

function isBattleCreate(input: { path: string; method: string }): boolean {
  return input.path === "/api/battles" && input.method === "POST";
}

async function assertTrialCreateParticipants(control: CutoverControl, userId: string, request: unknown): Promise<void> {
  const body = requestBody(request);
  const myCharacterId = stringField(body, "myCharacterId");
  const opponentCharacterId = stringField(body, "opponentCharacterId");
  const generations = control.policy.trialBindings?.generationIds;
  if (!myCharacterId || !opponentCharacterId || !generations) throw new CutoverUnavailableError();
  const rows = await participantRows(myCharacterId, opponentCharacterId);
  if (rows.length !== 2) throw new CutoverUnavailableError();
  const mine = rows.find((row) => row.id === myCharacterId);
  const opponent = rows.find((row) => row.id === opponentCharacterId);
  if (!validParticipant(mine, userId, generations[0]) || !validParticipant(opponent, undefined, generations[1])) {
    throw new CutoverUnavailableError();
  }
}

function requestBody(request: unknown): unknown {
  return request && typeof request === "object" && "body" in request ? request.body : null;
}

function stringField(value: unknown, field: string): string | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "string" ? candidate : null;
}

async function participantRows(myCharacterId: string, opponentCharacterId: string): Promise<ParticipantRow[]> {
  const result = await query<ParticipantRow>(
    `SELECT c.id, c.owner_user_id, g.generation_id, g.schema_version, g.content_json
     FROM characters c
     JOIN asset_current_generations current ON current.asset_type='character' AND current.asset_id=c.id
     JOIN asset_generations g ON g.asset_type='character' AND g.asset_id=c.id
       AND g.generation=current.generation
     WHERE c.id IN ($1,$2)`, [myCharacterId, opponentCharacterId],
  );
  return result.rows;
}

type ParticipantRow = {
  id: string; owner_user_id: string; generation_id: string; schema_version: number; content_json: unknown;
};

function validParticipant(row: ParticipantRow | undefined, userId: string | undefined, generationId: string): boolean {
  if (!row || (userId && row.owner_user_id !== userId) || row.generation_id !== generationId || row.schema_version !== 3) return false;
  let content = row.content_json;
  try { if (typeof content === "string") content = JSON.parse(content); } catch { return false; }
  return CharacterGenerationEnvelopeV3Schema.safeParse(content).success;
}
