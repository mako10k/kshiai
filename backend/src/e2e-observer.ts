import {
  defaultParameters,
  defaultRecord,
  type BattlefieldPreset,
  type CharacterSheet,
  type NarrationStyle,
} from "@kshiai/shared";
import * as battlefieldRepo from "./repositories/battlefields.js";
import * as characterRepo from "./repositories/characters.js";
import * as narrationStyleRepo from "./repositories/narration-styles.js";

export const E2E_FIXTURE_IDS = {
  observerCharacter: "chr_e2e_codex_observer",
  opponentCharacter: "chr_e2e_codex_opponent",
  battlefield: "bfp_e2e_codex_rainy_alley",
  narrationStyle: "nst_e2e_codex_causal",
} as const;

export const E2E_ACCOUNT_EMAILS = {
  observer: "codex-e2e-observer@example.test",
  opponent: "codex-e2e-opponent@example.test",
} as const;

function characterFixture(input: {
  id: string;
  ownerUserId: string;
  displayName: string;
  role: "observer" | "opponent";
  now: string;
}): CharacterSheet {
  const observer = input.role === "observer";
  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    displayName: input.displayName,
    identity: {
      realName: null,
      nicknames: [input.displayName],
      selfNames: [observer ? "私" : "俺"],
      epithets: [observer ? "因果の観測者" : "対照の剣士"],
      gender: "不明",
      age: "不明",
    },
    tags: ["e2e", "codex-observer", input.role],
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
    appearance: {
      summary: observer
        ? "藍色の外套と記録端末を携えた静かな観測者"
        : "赤い上着と幅広の大剣を携えた実戦的な剣士",
      visualPrompt: observer
        ? "anime battle observer, indigo coat, handheld recorder, rainy neon alley"
        : "anime greatsword fighter, red jacket, rainy neon alley",
      imageUrl: null,
    },
    traits: observer
      ? ["因果関係を見落とさない", "相手の変化を次の行動に結びつける"]
      : ["正面から圧力をかける", "足場と間合いの変化を利用する"],
    parameters: defaultParameters({
      hp: 90,
      maxHp: 90,
      mp: 35,
      maxMp: 35,
      stamina: 50,
      maxStamina: 50,
      atk: observer ? 18 : 20,
      def: observer ? 10 : 9,
      spd: observer ? 14 : 10,
      mag: observer ? 17 : 9,
      res: observer ? 11 : 10,
      focus: observer ? 17 : 12,
    }),
    basicAttack: {
      name: observer ? "軌跡打ち" : "大剣一閃",
      description: observer
        ? "直前の動きで生じた隙を見定め、短い一撃で体勢を崩す。"
        : "大剣の重さを乗せて相手の構えごと押し込む。",
      targetParameter: "hp",
      scalingParameter: "atk",
      resistanceParameter: "def",
      power: 1.05,
      constraints: {
        reach: "near",
        requiresSight: true,
        mobility: "limited",
        requiresSpeech: false,
        requiresUsableHeldObject: observer ? false : true,
      },
    },
    skills: observer
      ? [
          {
            id: "sk_e2e_observer_feint",
            name: "残光の誘導",
            description: "ネオンの反射へ視線を誘い、踏み込みの方向を誤らせる。",
            costMp: 7,
            costStamina: 4,
            power: 1.35,
            kind: "magic",
            element: "light",
            constraints: {
              reach: "medium",
              requiresSight: true,
              mobility: "limited",
              requiresSpeech: false,
              requiresUsableHeldObject: false,
            },
          },
          {
            id: "sk_e2e_observer_reset",
            name: "観測姿勢",
            description: "足場と呼吸を整え、次の変化を捉えやすくする。",
            costMp: 4,
            costStamina: 0,
            power: 0.8,
            kind: "defend",
            effects: [{ target: "self", parameter: "focus", delta: 4 }],
            constraints: {
              reach: "same_area",
              requiresSight: false,
              mobility: "none",
              requiresSpeech: false,
              requiresUsableHeldObject: false,
            },
          },
        ]
      : [
          {
            id: "sk_e2e_opponent_cleave",
            name: "濡路断ち",
            description: "滑る路面を踏みしめ、大剣を低い軌道から斬り上げる。",
            costMp: 0,
            costStamina: 9,
            power: 1.45,
            kind: "attack",
            element: "steel",
            constraints: {
              reach: "near",
              requiresSight: true,
              mobility: "full",
              requiresSpeech: false,
              requiresUsableHeldObject: true,
            },
          },
          {
            id: "sk_e2e_opponent_guard",
            name: "鉄壁の構え",
            description: "大剣を盾のように立て、衝撃に耐えながら間合いを保つ。",
            costMp: 0,
            costStamina: 5,
            power: 0.8,
            kind: "defend",
            effects: [{ target: "self", parameter: "def", delta: 4 }],
            constraints: {
              reach: "same_area",
              requiresSight: false,
              mobility: "none",
              requiresSpeech: false,
              requiresUsableHeldObject: true,
            },
          },
        ],
    weapon: observer
      ? null
      : {
          name: "観測用大剣",
          description: "再現性のある重い斬撃を生む、刃引きされた大剣。",
          atkBonus: 2,
          defBonus: 0,
          magBonus: 0,
          effects: [{ parameter: "spd", delta: -1 }],
        },
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: observer
      ? "戦闘中の動作、成立理由、後続への影響を確かめるためのCodex専用観測者。"
      : "観測者と別アカウントで戦い、クロスアカウント裁定を継続検証する対照役。",
    record: defaultRecord(),
    recordOverall: defaultRecord(),
  };
}

function battlefieldFixture(ownerUserId: string, now: string): BattlefieldPreset {
  return {
    id: E2E_FIXTURE_IDS.battlefield,
    ownerUserId,
    isSystem: false,
    displayName: "霧雨と赤いワゴンの路地",
    category: "urban",
    tags: ["e2e", "codex-observer", "causal-coherence"],
    createdAt: now,
    updatedAt: now,
    appearance: {
      summary: "ネオンが濡れた路面に反射し、赤い軽ワゴンと鉄製非常階段がある狭い路地。",
      visualPrompt: "rainy narrow neon alley, red kei wagon, metal fire escape, wet asphalt",
      imageUrl: null,
    },
    terrainHints: ["霧雨で滑りやすい濡れたアスファルトの狭い路地"],
    obstacleHints: ["錆びた赤い軽ワゴン", "三階建て雑居ビルの鉄製非常階段"],
    conditionHints: ["霧雨", "ネオンの反射", "ときおり点滅する街灯"],
    baseCoefficients: {},
    narrativeBlurb: "環境描写と戦闘効果の論理的なつながりを反復観測する固定場面。",
  };
}

function narrationStyleFixture(ownerUserId: string, now: string): NarrationStyle {
  return {
    id: E2E_FIXTURE_IDS.narrationStyle,
    ownerUserId,
    isSystem: false,
    displayName: "Codex因果観測ナレーター",
    description: "動作、成立理由、具体的な後続影響を追跡するE2E用スタイル。",
    instruction: [
      "各描写では、観測可能な動作と結果だけで終えず、与えられた因果情報の範囲で成立理由を明示する。",
      "結果は、体勢、距離、利用可能な行動、次の攻防の有利不利など、後続ターンへの具体的影響に結びつける。",
      "環境変化は、それ自体から妥当な作用だけを描き、根拠のないHP低下や能力変化を作らない。",
      "機械的数値や内部識別子は語らず、裏付けのない因果は断定しない。",
    ].join(""),
    perspective: "external",
    tags: ["e2e", "codex-observer", "causal"],
    createdAt: now,
    updatedAt: now,
  };
}

async function ensureCharacter(
  fixture: CharacterSheet,
): Promise<"created" | "reused"> {
  const existing = await characterRepo.getSheetIncludingDeleted(fixture.id);
  if (existing) {
    if (existing.ownerUserId !== fixture.ownerUserId) {
      throw new Error(`E2E fixture ownership mismatch: ${fixture.id}`);
    }
    if (existing.deletedAt) {
      throw new Error(`E2E fixture was soft-deleted: ${fixture.id}`);
    }
    return "reused";
  }
  await characterRepo.saveSheet(fixture);
  return "created";
}

async function ensureBattlefield(
  fixture: BattlefieldPreset,
): Promise<"created" | "reused"> {
  const existing = await battlefieldRepo.getPreset(fixture.id);
  if (existing) {
    if (existing.ownerUserId !== fixture.ownerUserId || existing.isSystem) {
      throw new Error(`E2E fixture ownership mismatch: ${fixture.id}`);
    }
    return "reused";
  }
  await battlefieldRepo.savePreset(fixture);
  return "created";
}

async function ensureNarrationStyle(
  fixture: NarrationStyle,
): Promise<"created" | "reused"> {
  const existing = await narrationStyleRepo.getNarrationStyle(fixture.id);
  if (existing) {
    if (existing.ownerUserId !== fixture.ownerUserId || existing.isSystem) {
      throw new Error(`E2E fixture ownership mismatch: ${fixture.id}`);
    }
    return "reused";
  }
  await narrationStyleRepo.saveNarrationStyle(fixture);
  return "created";
}

export async function ensurePersistentE2eFixtures(input: {
  observerUserId: string;
  opponentUserId: string;
}): Promise<Record<keyof typeof E2E_FIXTURE_IDS, "created" | "reused">> {
  const now = new Date().toISOString();
  const observerCharacter = characterFixture({
    id: E2E_FIXTURE_IDS.observerCharacter,
    ownerUserId: input.observerUserId,
    displayName: "因果観測者コーデックス",
    role: "observer",
    now,
  });
  const opponentCharacter = characterFixture({
    id: E2E_FIXTURE_IDS.opponentCharacter,
    ownerUserId: input.opponentUserId,
    displayName: "対照剣士アイアン",
    role: "opponent",
    now,
  });
  const battlefield = battlefieldFixture(input.observerUserId, now);
  const narrationStyle = narrationStyleFixture(input.observerUserId, now);
  const [observerResult, opponentResult, battlefieldResult, narrationResult] =
    await Promise.all([
      ensureCharacter(observerCharacter),
      ensureCharacter(opponentCharacter),
      ensureBattlefield(battlefield),
      ensureNarrationStyle(narrationStyle),
    ]);
  return {
    observerCharacter: observerResult,
    opponentCharacter: opponentResult,
    battlefield: battlefieldResult,
    narrationStyle: narrationResult,
  };
}
