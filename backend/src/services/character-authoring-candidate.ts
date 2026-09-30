/** R: Validate and project persisted character candidates for owner review and activation. */
import {
  CharacterGenerationEnvelopeV2Schema, CharacterGenerationEnvelopeV3Schema,
  projectCharacterProfileSourceV2, validateCharacterProfileClaimAssessmentV2,
  assertCharacterGenerationReadyV2, characterDefinitionV2ToLegacySheet,
  characterDefinitionV3ToLegacySheet, CHARACTER_BATTLE_MECHANICS_CAPABILITY_SET_V3,
  CharacterCompilerCapabilityV1Schema, projectCharacterCompilerCompatibilityV1,
  type CharacterGenerationEnvelopeV2, type CharacterGenerationEnvelopeV3,
} from "@kshiai/shared";

import { v3ToProfileDefinitionV2 } from "./character-v3-profile-adapter.js";
import { assetContentDigest } from "../repositories/asset-generations.js";

export type CharacterAuthoringCandidate = CharacterGenerationEnvelopeV2 | CharacterGenerationEnvelopeV3;
export function parseCharacterCandidate(value: unknown): CharacterAuthoringCandidate {
  const v3 = CharacterGenerationEnvelopeV3Schema.safeParse(value);
  return v3.success ? v3.data : CharacterGenerationEnvelopeV2Schema.parse(value);
}
export function candidateCompatibility(envelope: CharacterGenerationEnvelopeV3) {
  return projectCharacterCompilerCompatibilityV1({
    required: CHARACTER_BATTLE_MECHANICS_CAPABILITY_SET_V3,
    available: envelope.compilerCompatibility.map((item) => CharacterCompilerCapabilityV1Schema.parse(item)),
    deferredValues: envelope.deferredValues.values, blocked: [],
  });
}
export function assertCharacterCandidateReady(value: unknown): CharacterAuthoringCandidate {
  const v3 = CharacterGenerationEnvelopeV3Schema.safeParse(value);
  if (!v3.success) return assertCharacterGenerationReadyV2(CharacterGenerationEnvelopeV2Schema.parse(value));
  if (candidateCompatibility(v3.data).status !== "ready") throw new Error("CHARACTER_REQUIRED_COMPILER_MISSING:battle-mechanics@3");
  const envelope = v3.data;
  const projection = projectCharacterProfileSourceV2(v3ToProfileDefinitionV2(envelope.definition), envelope.disclosurePolicy);
  if (!envelope.publicPresentation.claimValidation) throw new Error("CHARACTER_PROFILE_CLAIM_RECEIPT_MISSING");
  if (assetContentDigest(projection) !== envelope.publicPresentation.projectionDigest) throw new Error("PROFILE_PROJECTION_DIGEST_MISMATCH");
  validateCharacterProfileClaimAssessmentV2(projection, envelope.publicPresentation, envelope.publicPresentation.claimValidation);
  return envelope;
}
export function candidateToSheet(candidate: CharacterAuthoringCandidate,
  input: Omit<Parameters<typeof characterDefinitionV2ToLegacySheet>[0], "definition" | "publicPresentation">) {
  const v3 = CharacterGenerationEnvelopeV3Schema.safeParse(candidate);
  if (v3.success) return characterDefinitionV3ToLegacySheet({ ...input,
    definition: v3.data.definition, publicPresentation: v3.data.publicPresentation });
  const v2 = CharacterGenerationEnvelopeV2Schema.parse(candidate);
  return characterDefinitionV2ToLegacySheet({ ...input,
    definition: v2.definition, publicPresentation: v2.publicPresentation });
}
export function fixedCandidateOwnerReview(candidate: CharacterAuthoringCandidate, sourceText: string | null,
  options: { kind: "create" | "revision" | "upgrade"; currentCandidate: unknown } = { kind: "create", currentCandidate: null }) {
  const v3 = CharacterGenerationEnvelopeV3Schema.safeParse(candidate);
  if (!v3.success) return {};
  const envelope = v3.data;
  let source: unknown = sourceText;
  if (sourceText !== null) {
    try { source = JSON.parse(sourceText); } catch { /* Revision instructions remain their original text. */ }
  }
  const current = CharacterGenerationEnvelopeV3Schema.safeParse(options.currentCandidate);
  const previousDefinition = current.success ? current.data.definition : null;
  const revising = options.kind === "revision";
  const labels: Record<string, string> = { definition: "人物・能力・行動規範の全設定",
    disclosurePolicy: "公開範囲", publicPresentation: "公開説明と検証記録",
    provenance: "入力と生成の記録", compilerCompatibility: "利用できる処理",
    deferredValues: "保留値", definitionSchema: "定義形式", envelopeVersion: "保存形式" };
  return { canEditCandidate: false, semanticCandidateReview: {
    schemaVersion: 3 as const,
    fields: [
      { key: revising ? "revisionSource" : "createSource", label: revising ? "今回の編集指示" : "元の作成指定（名前・タグ・性格・紹介文）",
        source: sourceText, candidate: revising ? sourceText ?? "" : JSON.stringify(source, null, 2) },
      ...Object.entries(envelope.definition).map(([key, value]) => ({
        key: `definition.${key}`, label: `採用する人物設定: ${key}`,
        source: revising
          ? previousDefinition && key in previousDefinition
            ? JSON.stringify(Reflect.get(previousDefinition, key), null, 2) : null
          : ["identity", "psycheDisposition", "profileBackground"].includes(key)
            ? sourceText : "元の指定に個別指定なし。今回の候補で追加した詳細です。",
        candidate: JSON.stringify(value, null, 2),
      })),
      ...Object.entries(envelope).filter(([key]) => key !== "definition").map(([key, value]) => ({
        key, label: labels[key] ?? key,
        source: revising && current.success && key in current.data
          ? JSON.stringify(Reflect.get(current.data, key), null, 2) : null,
        candidate: JSON.stringify(value, null, 2),
      })),
    ],
    compatibility: (() => {
      const value = candidateCompatibility(envelope);
      return { status: value.status,
        deferred: value.deferred.map((item) => ({ capability: `${item.capability.consumer}@${item.capability.version}`, targetPaths: item.targetPaths })),
        blocked: value.blocked.map((item) => ({ capability: `${item.capability.consumer}@${item.capability.version}`, reasonCode: item.reasonCode })),
      };
    })(),
    limitation: revising
      ? "今回の編集指示と、編集開始時の不変世代から候補への変更を比較してください。変更のない設定も含む全候補、公開範囲・保留値・検証記録を確認して確定します。"
      : "元の作成指定と採用する全設定を比較してください。名前・タグ・性格・紹介文を起点に、背景・能力・行動規範・装備などの詳細を加えた固定候補です。登録処理による自動調整はありません。公開範囲・保留値・検証記録も確認して確定します。調整する場合は破棄後に更新候補を準備します。",
  } };
}
