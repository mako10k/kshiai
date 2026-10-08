// R: Construct nonempty immutable guidance sources for end-to-end delivery regression tests.
import { CharacterGenerationEnvelopeV3Schema, CharacterDefinitionV3Schema, compileCharacterBattleCompilerInputsV4 } from "@kshiai/shared";
import { validAwarenessBattleFixture } from "./awareness-test-fixture.js";
import { buildImportedCharacterEnvelopeV2 } from "./character-authoring-service.js";
import { assetContentDigest, type AssetGeneration } from "../repositories/asset-generations.js";

/** Nonempty guidance sources distinguish source loss from a legitimately empty projection. */
export function validAwarenessGuidanceFixture(id: string) {
  const { state, characters } = validAwarenessBattleFixture(id);
  const manifest = state.assetManifest;
  if (!manifest || manifest.schemaVersion !== 5) throw new Error("Expected awareness manifest");
  const source = buildImportedCharacterEnvelopeV2({ sheet: characters.a, attemptId: `${id}-guidance` });
  const { schemaVersion, actionNorms, ...stable } = source.definition;
  const always = { match: "all", clauses: [{ kind: "always", operator: "is", value: "true" }] };
  const known = "相手に戦いの理由を問い、返答を確かめたい";
  const hidden = "本人の知らない指針の原因";
  const inapplicable = "例外条件により適用されない指針";
  const partial = "言葉にしきれない方向を感じる".repeat(15);
  const entry = (entryId: string, statement: string, selfAwareness: "aware" | "partial" | "unaware") => ({
    id: entryId, statement, selfAwareness, applicability: always, priority: 50, force: "preference",
    exceptions: [], description: null,
  });
  const definition = CharacterDefinitionV3Schema.parse({ ...stable, schemaVersion: 3, actionNorms: [],
    consciousGuidance: [entry("known", known, "aware"), entry("hidden", hidden, "unaware"),
      { ...entry("inapplicable", inapplicable, "aware"), exceptions: [{ clauses: always.clauses, description: "この試験では常に適用除外" }] },
      entry("partial", partial, "partial")], mechanicalConflictFallbacks: [] });
  const content = CharacterGenerationEnvelopeV3Schema.parse({ ...source, definition, definitionSchema: { family: "character", version: 3 },
    compilerCompatibility: [{ consumer: "character-profile", version: 2 }, { consumer: "battle-mechanics", version: 3 },
      { consumer: "psyche-trait-profile", version: 1 }, { consumer: "character-conscious-self", version: 3 },
      { consumer: "character-action-norms", version: 3 }, { consumer: "character-mechanical-conflict-fallback", version: 1 },
      { consumer: "character-relationship", version: 2 }], deferredValues: { contractVersion: 1, values: [] } });
  const binding = manifest.characters.a;
  binding.compilerInputsV4 = compileCharacterBattleCompilerInputsV4({ definition });
  binding.contentDigest = assetContentDigest(content);
  const generation: AssetGeneration = { assetType: "character", assetId: binding.assetId, generation: 1,
    generationId: binding.generationId, contentDigest: binding.contentDigest, content, schemaVersion: 3, createdAt: manifest.boundAt };
  return { state, characters, generation, known, hidden, inapplicable, partial };
}
