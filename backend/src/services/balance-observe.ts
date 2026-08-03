/**
 * Persist balance observations (JSONL + SQLite) without affecting combat rules.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  battleBalanceFlags,
  emptyBattleBalanceTrace,
  sheetCombatProfile,
  type BattleBalanceTrace,
  type BattleState,
  type CharacterSheet,
  type SheetCombatProfile,
} from "@kshiai/shared";
import { databaseKind, query } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.resolve(__dirname, "../../data/logs");
const balanceLogPath = path.join(logDir, "balance.jsonl");

export type BalanceEventKind = "battle_finished" | "sheet_snapshot";

function appendJsonl(row: Record<string, unknown>): void {
  if (databaseKind() === "postgres") return;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      balanceLogPath,
      JSON.stringify({ ts: new Date().toISOString(), ...row }) + "\n",
      "utf8",
    );
  } catch (e) {
    console.error("[balance] jsonl write failed", e);
  }
}

async function insertEvent(input: {
  kind: BalanceEventKind;
  createdAt: string;
  battleId?: string | null;
  characterId?: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO balance_events
      (kind, created_at, battle_id, character_id, payload_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.kind,
      input.createdAt,
      input.battleId ?? null,
      input.characterId ?? null,
      JSON.stringify(input.payload),
    ],
  );
}

export async function recordSheetSnapshot(input: {
  sheet: CharacterSheet;
  phase: "generate" | "chat" | "rebalance" | "copy" | "restore";
}): Promise<SheetCombatProfile> {
  const profile = sheetCombatProfile({
    parameters: input.sheet.parameters,
    skills: input.sheet.skills,
  });
  const createdAt = new Date().toISOString();
  const payload = {
    phase: input.phase,
    characterId: input.sheet.id,
    displayName: input.sheet.displayName,
    ownerUserId: input.sheet.ownerUserId,
    profile,
    skillPowers: (input.sheet.skills ?? []).map((s) => ({
      name: s.name,
      kind: s.kind,
      power: s.power,
    })),
    traits: (input.sheet.traits ?? []).slice(0, 8),
  };
  try {
    await insertEvent({
      kind: "sheet_snapshot",
      createdAt,
      characterId: input.sheet.id,
      payload,
    });
    appendJsonl({ kind: "sheet_snapshot", ...payload });
    if (profile.sharpness >= 55 || profile.maxSkillPower > 2) {
      console.info(
        `[balance] sheet ${input.phase} ${input.sheet.displayName} sharp=${profile.sharpness} maxPow=${profile.maxSkillPower}`,
      );
    }
  } catch (e) {
    console.error("[balance] sheet snapshot failed", e);
  }
  return profile;
}

export async function recordBattleFinished(input: {
  state: BattleState;
  sameOwner?: boolean;
  ranked?: boolean;
  sideAProfile?: SheetCombatProfile | null;
  sideBProfile?: SheetCombatProfile | null;
}): Promise<void> {
  const state = input.state;
  if (state.status !== "finished") return;

  // Dedupe: one row per battle
  const existing = await query<{ id: number | string }>(
    `SELECT id FROM balance_events
     WHERE kind = 'battle_finished' AND battle_id = $1 LIMIT 1`,
    [state.id],
  );
  if (existing.rows[0]) return;

  const trace: BattleBalanceTrace =
    state.balanceTrace ?? emptyBattleBalanceTrace();
  const flags = battleBalanceFlags(trace);
  const createdAt = new Date().toISOString();
  const payload = {
    battleId: state.id,
    turn: state.turn,
    combatTurns: trace.combatTurns,
    winnerSide: state.winnerSide,
    finishReason: state.finishReason,
    sameOwner: input.sameOwner ?? state.ratingSettlement?.sameOwner ?? null,
    ranked: input.ranked ?? state.ratingSettlement?.ranked ?? null,
    battlefield: state.battlefield?.displayName ?? state.situation.scene,
    battlefieldCategory: state.battlefield?.category ?? null,
    sideA: {
      characterId: state.sideA.characterId,
      displayName: state.sideA.displayName,
      maxHp: state.sideA.parameters.maxHp ?? null,
      profile: input.sideAProfile ?? null,
    },
    sideB: {
      characterId: state.sideB.characterId,
      displayName: state.sideB.displayName,
      maxHp: state.sideB.parameters.maxHp ?? null,
      profile: input.sideBProfile ?? null,
    },
    trace: {
      totalDamageA: trace.totalDamageA,
      totalDamageB: trace.totalDamageB,
      maxTurnDamageA: trace.maxTurnDamageA,
      maxTurnDamageB: trace.maxTurnDamageB,
      maxTurnDamageRatioA: round4(trace.maxTurnDamageRatioA),
      maxTurnDamageRatioB: round4(trace.maxTurnDamageRatioB),
      hitTurns: trace.hitTurns,
      firstKoCombatTurn: trace.firstKoCombatTurn,
    },
    flags: {
      earlyKo: flags.earlyKo,
      oneShotSuspect: flags.oneShotSuspect,
      shortMatch: flags.shortMatch,
      maxHitRatio: round4(flags.maxHitRatio),
    },
  };

  try {
    await insertEvent({
      kind: "battle_finished",
      createdAt,
      battleId: state.id,
      payload,
    });
    appendJsonl({ kind: "battle_finished", ...payload });
    const mark =
      flags.oneShotSuspect || flags.earlyKo
        ? "⚠"
        : flags.shortMatch
          ? "·"
          : "ok";
    console.info(
      `[balance] battle ${mark} ${state.id} turns=${trace.combatTurns} maxHit=${(flags.maxHitRatio * 100).toFixed(0)}% earlyKo=${flags.earlyKo ? 1 : 0} oneShot=${flags.oneShotSuspect ? 1 : 0} winner=${state.winnerSide}`,
    );
  } catch (e) {
    console.error("[balance] battle record failed", e);
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export type BalanceSummary = {
  battles: {
    total: number;
    avgCombatTurns: number | null;
    earlyKoRate: number | null;
    oneShotSuspectRate: number | null;
    shortMatchRate: number | null;
    avgMaxHitRatio: number | null;
  };
  sheets: {
    total: number;
    avgSharpness: number | null;
    highSharpnessRate: number | null;
    inflatedPowerRate: number | null;
  };
  recentFlags: Array<{
    battleId: string;
    createdAt: string;
    earlyKo: boolean;
    oneShotSuspect: boolean;
    shortMatch: boolean;
    maxHitRatio: number;
    combatTurns: number;
    winnerSide: string | null;
  }>;
  logPath: string;
};

export async function getBalanceSummary(limitRecent = 20): Promise<BalanceSummary> {
  const battleResult = await query<{
    created_at: string | Date;
    battle_id: string;
    payload_json: unknown;
  }>(
    `SELECT created_at, battle_id, payload_json FROM balance_events
     WHERE kind = 'battle_finished'
     ORDER BY id DESC
     LIMIT 500`,
  );
  const battleRows = battleResult.rows;

  let sumTurns = 0;
  let early = 0;
  let oneShot = 0;
  let short = 0;
  let sumMaxHit = 0;
  let n = 0;
  const recentFlags: BalanceSummary["recentFlags"] = [];

  for (const row of battleRows) {
    let p: {
      combatTurns?: number;
      winnerSide?: string | null;
      flags?: {
        earlyKo?: boolean;
        oneShotSuspect?: boolean;
        shortMatch?: boolean;
        maxHitRatio?: number;
      };
    };
    try {
      p = (typeof row.payload_json === "string"
        ? JSON.parse(row.payload_json)
        : row.payload_json) as typeof p;
    } catch {
      continue;
    }
    n += 1;
    const turns = Number(p.combatTurns ?? 0);
    sumTurns += turns;
    const f = p.flags ?? {};
    if (f.earlyKo) early += 1;
    if (f.oneShotSuspect) oneShot += 1;
    if (f.shortMatch) short += 1;
    sumMaxHit += Number(f.maxHitRatio ?? 0);
    if (recentFlags.length < limitRecent) {
      recentFlags.push({
        battleId: row.battle_id,
        createdAt: row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
        earlyKo: Boolean(f.earlyKo),
        oneShotSuspect: Boolean(f.oneShotSuspect),
        shortMatch: Boolean(f.shortMatch),
        maxHitRatio: Number(f.maxHitRatio ?? 0),
        combatTurns: turns,
        winnerSide: p.winnerSide ?? null,
      });
    }
  }

  const sheetResult = await query<{ payload_json: unknown }>(
    `SELECT payload_json FROM balance_events
     WHERE kind = 'sheet_snapshot'
     ORDER BY id DESC
     LIMIT 300`,
  );
  const sheetRows = sheetResult.rows;

  let sn = 0;
  let sumSharp = 0;
  let highSharp = 0;
  let inflated = 0;
  for (const row of sheetRows) {
    try {
      const p = (typeof row.payload_json === "string"
        ? JSON.parse(row.payload_json)
        : row.payload_json) as {
        profile?: SheetCombatProfile;
      };
      const prof = p.profile;
      if (!prof) continue;
      sn += 1;
      sumSharp += prof.sharpness;
      if (prof.sharpness >= 55) highSharp += 1;
      if (prof.maxSkillPower > 2) inflated += 1;
    } catch {
      /* skip */
    }
  }

  const rate = (c: number, d: number) => (d > 0 ? c / d : null);

  return {
    battles: {
      total: n,
      avgCombatTurns: n > 0 ? Math.round((sumTurns / n) * 100) / 100 : null,
      earlyKoRate: rate(early, n),
      oneShotSuspectRate: rate(oneShot, n),
      shortMatchRate: rate(short, n),
      avgMaxHitRatio: n > 0 ? Math.round((sumMaxHit / n) * 1000) / 1000 : null,
    },
    sheets: {
      total: sn,
      avgSharpness: sn > 0 ? Math.round((sumSharp / sn) * 10) / 10 : null,
      highSharpnessRate: rate(highSharp, sn),
      inflatedPowerRate: rate(inflated, sn),
    },
    recentFlags,
    logPath: balanceLogPath,
  };
}
