import {
  NarrationStyleSchema,
  compileNarrationPolicyV2,
  legacyNarrationStyleToDefinitionV2,
  type NarrationStyle,
} from "@kshiai/shared";
import { createFamilyConformanceAdapter } from "./family-conformance.js";

const now = "2026-09-12T00:00:00.000Z";
const scaffold: NarrationStyle = NarrationStyleSchema.parse({
  id: "narration-scaffold",
  ownerUserId: "owner",
  isSystem: false,
  displayName: "未設定",
  description: "",
  instruction: "視点を守って語る。",
  perspective: "external",
  tags: [],
  createdAt: now,
  updatedAt: now,
});

export function createNarrationConformanceAdapter() {
  return createFamilyConformanceAdapter({
    identity: "narration-semantic-authoring-conformance-v1",
    scaffold,
    parse: (value) => {
      const parsed = NarrationStyleSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    },
    displayName: (candidate) => candidate.displayName,
    withDisplayName: (candidate, value) => ({ ...candidate, displayName: value }),
    compile: (candidate) => {
      try {
        compileNarrationPolicyV2(legacyNarrationStyleToDefinitionV2(candidate));
        return {
          compilerIdentity: "narration-prompt-compiler-v2",
          disclosureIdentity: "narration-disclosure-v2",
        };
      } catch {
        return null;
      }
    },
  });
}
