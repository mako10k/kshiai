/** R: Prepare fixed V3 trial candidates in the ordinary owner-review lifecycle. */
import { CharacterGenerationEnvelopeV3Schema, type CharacterGenerationEnvelopeV3 } from "@kshiai/shared";
import { prepareCharacterCreateCandidate } from "./character-assets-v2.js";

export async function prepareV3TrialCharacter(input: {
  characterId: string; ownerUserId: string; envelope: CharacterGenerationEnvelopeV3;
  source: Record<string, unknown>;
  requestKey?: string;
}) {
  return prepareCharacterCreateCandidate({ ...input,
    envelope: CharacterGenerationEnvelopeV3Schema.parse(input.envelope),
    idempotencyKey: `v3-trial:${input.characterId}:${input.requestKey ?? "initial"}`,
  });
}
