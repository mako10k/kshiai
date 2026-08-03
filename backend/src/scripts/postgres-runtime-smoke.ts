import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import {
  defaultParameters,
  defaultRecord,
  type BattleState,
  type CharacterSheet,
} from "@kshiai/shared";
import { createPostgresConfig } from "../postgres-config.js";

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertProjectTarget(connectionString: string, projectRef: string): void {
  const url = new URL(connectionString);
  if (!url.hostname.includes(projectRef) && !url.username.includes(projectRef)) {
    throw new Error("PostgreSQL URL does not match SUPABASE_PROJECT_REF");
  }
}

function character(
  id: string,
  ownerUserId: string,
  displayName: string,
): CharacterSheet {
  const now = new Date().toISOString();
  return {
    id,
    ownerUserId,
    displayName,
    identity: {
      realName: `${displayName} 本名`,
      nicknames: [displayName],
      selfNames: ["私"],
      epithets: [],
      gender: "不明",
      age: "不明",
    },
    tags: ["runtime-smoke"],
    createdAt: now,
    updatedAt: now,
    appearance: { summary: `${displayName}の姿`, visualPrompt: displayName },
    traits: ["慎重"],
    parameters: defaultParameters(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: `${displayName}のランタイム検証用プロフィール`,
    record: defaultRecord(),
  };
}

function battle(sideA: CharacterSheet, sideB: CharacterSheet): BattleState {
  const now = new Date().toISOString();
  return {
    id: "btl_runtime_smoke",
    status: "finished",
    turn: 1,
    turnLimit: 20,
    sideA: {
      characterId: sideA.id,
      displayName: sideA.displayName,
      parameters: defaultParameters(),
      defending: false,
      canFight: true,
      irreversibleIncapacitated: false,
    },
    sideB: {
      characterId: sideB.id,
      displayName: sideB.displayName,
      parameters: defaultParameters(),
      defending: false,
      canFight: true,
      irreversibleIncapacitated: false,
    },
    policiesA: [],
    selectedPolicyIdsA: [],
    policiesB: [],
    selectedPolicyIdsB: [],
    situation: {
      scene: "PostgreSQL runtime smoke",
      notes: "",
      coefficients: {},
      tags: [],
    },
    prologuePending: false,
    aftermathPending: false,
    turnRecords: [],
    log: [{ turn: 1, narrator: ["接続検証完了。"], speeches: [] }],
    winnerSide: "draw",
    finishReason: "turn_limit",
    createdAt: now,
    updatedAt: now,
  };
}

async function main(): Promise<void> {
  const directUrl = requireEnvironment("DIRECT_URL");
  const runtimeUrl = requireEnvironment("DATABASE_URL");
  const projectRef = requireEnvironment("SUPABASE_PROJECT_REF");
  assertProjectTarget(directUrl, projectRef);
  assertProjectTarget(runtimeUrl, projectRef);

  const schema = `kshiai_smoke_${process.pid}_${Date.now()}`;
  if (!/^kshiai_smoke_[0-9_]+$/.test(schema)) {
    throw new Error("Unsafe smoke schema name");
  }
  const quotedSchema = `"${schema}"`;
  const administrator = new Client(createPostgresConfig(directUrl));
  await administrator.connect();

  let closeDatabase: (() => Promise<void>) | undefined;
  try {
    await administrator.query(`CREATE SCHEMA ${quotedSchema}`);
    await administrator.query(`
      CREATE TABLE ${quotedSchema}.kshiai_schema_migrations (
        name text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const migrationsDirectory = fileURLToPath(
      new URL("../../migrations/", import.meta.url),
    );
    const migrations = fs
      .readdirSync(migrationsDirectory)
      .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
      .sort();
    for (const name of migrations) {
      const sql = fs
        .readFileSync(fileURLToPath(new URL(`../../migrations/${name}`, import.meta.url)), "utf8")
        .replaceAll("public.", `${quotedSchema}.`);
      await administrator.query(sql);
    }

    process.env.DATABASE_URL = runtimeUrl;
    process.env.DATABASE_SCHEMA = schema;

    const db = await import("../db.js");
    closeDatabase = db.closeDatabase;
    const auth = await import("../auth.js");
    const characters = await import("../repositories/characters.js");
    const battles = await import("../repositories/battles.js");
    const battlefields = await import("../repositories/battlefields.js");
    const narrationStyles = await import("../repositories/narration-styles.js");
    const imageQuota = await import("../services/image-quota.js");
    const balance = await import("../services/balance-observe.js");
    const distributed = await import("../services/distributed-guard.js");

    await db.initializeDatabase();
    const user = await auth.registerUser("runtime_smoke", "runtime-smoke-password");
    const verified = await auth.verifyLogin("runtime_smoke", "runtime-smoke-password");
    if (verified?.id !== user.id) throw new Error("Authentication smoke failed");
    const token = await auth.createSession(user.id);
    if ((await auth.userFromToken(token))?.id !== user.id) {
      throw new Error("Session smoke failed");
    }

    const sideA = character("chr_runtime_a", user.id, "ランタイムA");
    const sideB = character("chr_runtime_b", user.id, "ランタイムB");
    await characters.saveSheet(sideA);
    await characters.saveSheet(sideB);
    if ((await characters.listCharactersForUser(user.id)).length !== 2) {
      throw new Error("Character repository smoke failed");
    }

    const state = battle(sideA, sideB);
    await battles.saveBattle(state, {
      sideAUserId: user.id,
      sideACharacterId: sideA.id,
      sideBCharacterId: sideB.id,
    });
    if ((await battles.getBattle(state.id))?.id !== state.id) {
      throw new Error("Battle repository smoke failed");
    }
    const leaseNow = new Date();
    const [leaseA, leaseB] = await Promise.all([
      distributed.acquireBattleLease(state.id, "runtime-a", leaseNow),
      distributed.acquireBattleLease(state.id, "runtime-b", leaseNow),
    ]);
    if (Number(leaseA) + Number(leaseB) !== 1) {
      throw new Error("Distributed battle lease smoke failed");
    }
    await distributed.releaseBattleLease(
      state.id,
      leaseA ? "runtime-a" : "runtime-b",
    );
    const idempotency = await distributed.beginIdempotentRequest({
      userId: user.id,
      scope: `battle-advance:${state.id}`,
      key: "runtime-smoke-key",
      requestHash: distributed.requestDigest({ battleId: state.id }),
    });
    if (idempotency.kind !== "started") {
      throw new Error("Distributed idempotency smoke failed");
    }
    await distributed.completeIdempotentRequest({
      userId: user.id,
      scope: `battle-advance:${state.id}`,
      key: "runtime-smoke-key",
      ownerId: idempotency.ownerId,
      response: { ok: true },
    });

    if ((await battlefields.listPresets({ userId: user.id })).length === 0) {
      throw new Error("Battlefield seed smoke failed");
    }
    if ((await narrationStyles.listNarrationStyles(user.id)).length === 0) {
      throw new Error("Narration-style seed smoke failed");
    }
    const quota = await imageQuota.recordImageGenEvent({
      userId: user.id,
      characterId: sideA.id,
      ok: true,
    });
    if (quota.usedDay !== 1) throw new Error("Image quota smoke failed");
    await balance.recordSheetSnapshot({ sheet: sideA, phase: "generate" });
    if ((await balance.getBalanceSummary()).sheets.total !== 1) {
      throw new Error("Balance observability smoke failed");
    }
    await auth.destroySession(token);
    console.log("PostgreSQL runtime smoke passed");
  } finally {
    if (closeDatabase) await closeDatabase().catch(() => undefined);
    await administrator.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
    await administrator.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
