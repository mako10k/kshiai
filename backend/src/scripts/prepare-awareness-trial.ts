// R: Produce validated fixed trial inputs and inspect configuration without dispatching models or opening a database.
import { createHash } from "node:crypto";
import {
  CharacterDefinitionV3Schema,
  defaultBasicAttack,
  defaultParameters,
  legacyCharacterSheetToDefinitionV2,
  requireCombatReadyCharacterSheet,
} from "@kshiai/shared";
import { config } from "../config.js";

const createdAt = "2026-10-05T00:00:00.000Z";
const characters = [
  { id: "awareness-trial-a", displayName: "アオ", description: "成人の人間。素手。勝ちたいが、痛みや接近には自然に身構える。特殊能力や特別な反射訓練はない。" },
  { id: "awareness-trial-b", displayName: "クロ", description: "成人の人間。素手。相手の出方を見ながら近づく。痛みや危険には自然に反応する。特殊能力や特別な反射訓練はない。" },
].map(({ id, displayName, description }) => {
  const sheet = requireCombatReadyCharacterSheet({
    id, ownerUserId: "awareness-trial-owner", displayName, tags: [],
    createdAt, updatedAt: createdAt,
    appearance: { summary: "成人の人間。素手で軽装。", visualPrompt: "adult human, unarmed" },
    traits: [], parameters: defaultParameters(), skills: [],
    basicAttack: defaultBasicAttack(), weapon: null, armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: description,
  });
  const { schemaVersion: _schemaVersion, actionNorms: _actionNorms, ...stable } =
    legacyCharacterSheetToDefinitionV2(sheet);
  const definition = CharacterDefinitionV3Schema.parse({
    ...stable, schemaVersion: 3, actionNorms: [], consciousGuidance: [],
    mechanicalConflictFallbacks: [],
  });
  return { sheet, definition };
});

const candidate = {
  candidateId: "awareness-real-trial-2026-10-05", preparationOnly: true,
  versions: { characterDefinition: 3, battleBindingFormat: 5, consciousnessPipeline: "awareness-v5" },
  policyRevision: "awareness-v5-usage-v1",
  scenario: {
    combatTicks: 3,
    setting: "明るい平坦な訓練場。障害物や武器はない。互いに見えている。",
    stop: "3 tick後は新規進行を止め、既存要求と実況の読戻しを行う。勝敗は捏造しない。",
  },
  characters,
};
// This digest identifies these exact candidate bytes, not a persisted asset-generation digest.
const candidateJson = JSON.stringify(candidate);
const endpoints = [config.openai.baseUrl, config.xai.baseUrl].map((value) => {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("TRIAL_ENDPOINT_MUST_NOT_CONTAIN_CREDENTIALS_OR_QUERY");
  }
  return `${url.origin}${url.pathname}`;
});
console.log(JSON.stringify({
  candidate,
  candidateSha256: createHash("sha256").update(candidateJson).digest("hex"),
  configuration: {
    openaiKeyPresent: Boolean(config.openai.apiKey.trim()),
    xaiKeyPresent: Boolean(config.xai.apiKey.trim()),
    subconscious: { provider: "openai", model: "gpt-6-luna", reasoning: "none" },
    conscious: { provider: "xai", model: config.xai.modelEngine },
    adjudication: { provider: "xai", model: config.xai.modelEngine },
    narration: { provider: "xai", model: config.xai.modelFast },
    endpoints,
    remoteModelAvailability: "unverified",
  },
}, null, 2));
