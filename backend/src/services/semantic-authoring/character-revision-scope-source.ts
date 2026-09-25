import { CharacterDefinitionV3Schema, type CharacterDefinitionV3 } from "@kshiai/shared";

/** The owner request is frozen before its scope is inferred in the same attempt. */
export type UnresolvedCharacterRevisionSourceV1 = Readonly<{
  kind: "revise_pending_scope";
  definition: CharacterDefinitionV3;
  naturalText: string;
}>;

export function decodeUnresolvedCharacterRevisionSourceV1(
  value: unknown,
): UnresolvedCharacterRevisionSourceV1 | null {
  if (typeof value !== "object" || value === null
    || !Object.hasOwn(value, "kind") || Reflect.get(value, "kind") !== "revise_pending_scope") {
    return null;
  }
  const definition = CharacterDefinitionV3Schema.safeParse(Reflect.get(value, "definition"));
  const naturalText = Reflect.get(value, "naturalText");
  return definition.success && typeof naturalText === "string" && naturalText.trim()
    ? { kind: "revise_pending_scope", definition: definition.data, naturalText }
    : null;
}
