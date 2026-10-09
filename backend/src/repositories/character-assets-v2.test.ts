import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CharacterGenerationEnvelopeV2Schema,
  CharacterGenerationEnvelopeV3Schema,
  CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
  REQUIRED_CHARACTER_COMPILERS_V2,
  defaultCharacterDisclosurePolicyV2,
  defaultParameters,
  defaultBasicAttack,
  legacyCharacterSheetToDefinitionV2,
  projectCharacterProfileSourceV2,
  type CharacterSheet,
} from "@kshiai/shared";

const directory = mkdtempSync(join(tmpdir(), "kshiai-character-v2-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "test.db");

const { saveHistoricalCharacterFixture } = await import("../testing/historical-character-fixtures.js");
const { closeDatabase, query } = await import("../db.js");
const repo = await import("./character-assets-v2.js");
const characters = await import("./characters.js");
const {
  assetContentDigest,
  createAssetGeneration,
  getAssetGeneration,
} = await import("../testing/historical-asset-generations.js");

const { buildV3CharacterEnvelopeFixture } = await import("../testing/v3-character-envelope-fixture.js");
after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

function sheet(id: string): CharacterSheet {
  const now = "2026-08-13T00:00:00.000Z";
  return {
    id,
    ownerUserId: "owner-v2",
    displayName: "構造子",
    tags: [],
    createdAt: now,
    updatedAt: now,
    appearance: {
      summary: "青い外套",
      visualPrompt: "blue cloak",
      imageUrl: `/api/media/characters/${id}.old.jpg`,
    },
    traits: ["慎重"],
    parameters: defaultParameters(),
    basicAttack: defaultBasicAttack(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "慎重に状況を読む旅人。",
  };
}

function envelope(input: {
  attemptId: string;
  sourceText: string;
  sheet: CharacterSheet;
}) {
  const definition = legacyCharacterSheetToDefinitionV2(input.sheet);
  const disclosurePolicy = defaultCharacterDisclosurePolicyV2(definition);
  const projection = projectCharacterProfileSourceV2(definition, disclosurePolicy);
  const projectionDigest = assetContentDigest(projection);
  return CharacterGenerationEnvelopeV2Schema.parse({
    envelopeVersion: 2,
    definitionSchema: { family: "character", version: 2 },
    definition,
    disclosurePolicy,
    publicPresentation: {
      description: input.sheet.narrativeBlurb,
      projectionContractVersion: 2,
      projectionDigest,
      descriptionInputDigest: assetContentDigest({ input: input.sourceText, projectionDigest }),
      segments: [{
        id: "profile",
        text: input.sheet.narrativeBlurb,
        kind: "fact",
        supportRefs: ["identity.displayName"],
      }],
      claimValidation: {
        contractVersion: 1,
        validatorContract: CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
        projectionDigest,
        segments: [{
          segmentId: "profile",
          verdict: "supported",
          supportRefs: ["identity.displayName"],
          riskCodes: [],
        }],
      },
    },
    provenance: {
      sourceKind: "create_instruction",
      sourceDigest: assetContentDigest(input.sourceText),
      attemptId: input.attemptId,
      structureGeneratorContract: "test-structure-v2",
      descriptionGeneratorContract: "test-profile-v2",
    },
    compilerCompatibility: [...REQUIRED_CHARACTER_COMPILERS_V2],
  });
}

function currentEnvelope(input: Parameters<typeof envelope>[0]) {
  const candidate = buildV3CharacterEnvelopeFixture(input.sheet);
  return CharacterGenerationEnvelopeV3Schema.parse({ ...candidate,
    provenance: { ...candidate.provenance, attemptId: input.attemptId,
      sourceDigest: assetContentDigest(input.sourceText) },
  });
}

async function activateReviewedCandidate(input: Parameters<typeof repo.activateCharacterAuthoringAttempt>[0]) {
  const attempt = await repo.getCharacterAuthoringAttempt(input.attemptId, input.ownerUserId);
  assert.ok(attempt?.candidateDigest);
  return repo.activateCharacterAuthoringAttempt({ ...input, candidateDigest: attempt.candidateDigest });
}

describe("current V3 authoring and historical V2 reads", () => {
  it("requires owner acceptance and atomically activates one V3 generation", async () => {
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, 'x', $3)`,
      ["owner-v2", "owner-v2", "2026-08-13T00:00:00.000Z"],
    );
    const sourceText = "青い外套の慎重な旅人";
    const started = await repo.beginCharacterAuthoringAttempt({
      targetSchemaVersion: 3,
      ownerUserId: "owner-v2",
      kind: "create",
      idempotencyKey: "create:test-character-v2",
      requestDigest: assetContentDigest({ sourceText }),
      sourceText,
      sourceDigest: assetContentDigest(sourceText),
    });
    assert.equal(started.attempt.status, "pending_structure");
    assert.equal(await characters.getSheet(started.attempt.characterId), null);

    const candidate = currentEnvelope({
      attemptId: started.attempt.attemptId,
      sourceText,
      sheet: sheet(started.attempt.characterId),
    });
    const awaiting = await repo.saveCharacterAuthoringCandidate({
      attemptId: started.attempt.attemptId,
      ownerUserId: "owner-v2",
      envelope: candidate,
      assistantMessage: "確認してください",
    });
    assert.equal(awaiting.status, "awaiting_owner_acceptance");
    assert.equal(await characters.getSheet(started.attempt.characterId), null);

    await assert.rejects(repo.activateCharacterAuthoringAttempt({
      attemptId: started.attempt.attemptId, ownerUserId: "owner-v2",
    }), /AUTHORING_REVIEW_DIGEST_MISMATCH/);
    assert.equal(await characters.getSheet(started.attempt.characterId), null);
    const activated = await activateReviewedCandidate({
      attemptId: started.attempt.attemptId,
      ownerUserId: "owner-v2",
    });
    assert.equal(activated.generation.schemaVersion, 3);
    assert.equal(activated.sheet.id, started.attempt.characterId);
    assert.equal((await repo.getCharacterCompatibility(
      started.attempt.characterId,
    )).status, "ready");
    assert.equal((await repo.getReadyCharacterGeneration(
      started.attempt.characterId,
    ))?.generationId, activated.generation.generationId);

    const replay = await activateReviewedCandidate({
      attemptId: started.attempt.attemptId,
      ownerUserId: "owner-v2",
    });
    assert.equal(replay.generation.generationId, activated.generation.generationId);

    await assert.rejects(
      repo.restorePreviousCharacterGeneration({
        characterId: activated.sheet.id,
        ownerUserId: "owner-v2",
        expectedGenerationId: activated.generation.generationId,
        operationId: "restore-without-history",
      }),
      /CHARACTER_UPDATE_UNAVAILABLE/,
    );
    await assert.rejects(
      repo.activateCharacterPortraitRevision({
        characterId: activated.sheet.id,
        ownerUserId: "another-owner",
        expectedGenerationId: activated.generation.generationId,
        operationId: "portrait-wrong-owner",
        mediaId: "/api/media/characters/forbidden.jpg",
        mediaRevisionId: "img-forbidden",
        sourceDigest: assetContentDigest("portrait-wrong-owner"),
      }),
      /CHARACTER_OWNER_MISMATCH/,
    );

    const portrait = await repo.activateCharacterPortraitRevision({
      characterId: activated.sheet.id,
      ownerUserId: "owner-v2",
      expectedGenerationId: activated.generation.generationId,
      operationId: "portrait-operation-1",
      mediaId: `/api/media/characters/${activated.sheet.id}.new.jpg`,
      mediaRevisionId: "img-new",
      sourceDigest: assetContentDigest("portrait-operation-1"),
    });
    assert.equal(portrait.generation.generation, activated.generation.generation + 1);
    assert.equal(
      portrait.sheet.appearance.imageUrl,
      `/api/media/characters/${activated.sheet.id}.new.jpg`,
    );
    assert.equal(
      portrait.sheet.appearance.previousImageUrl,
      `/api/media/characters/${activated.sheet.id}.old.jpg`,
    );
    assert.deepEqual(
      (await getAssetGeneration(activated.generation.generationId))?.content,
      activated.generation.content,
    );

    const history = await repo.getReadyCharacterGenerationHistory(activated.sheet.id);
    assert.equal(history?.previous?.generationId, activated.generation.generationId);
    assert.equal(
      history?.previousPortrait?.mediaId,
      `/api/media/characters/${activated.sheet.id}.old.jpg`,
    );
    const ownerView = await characters.toPublicCharacterForViewer(
      portrait.sheet,
      "owner-v2",
    );
    assert.equal(ownerView.canRestoreRevision, false);
    assert.equal(ownerView.canToggleImage, true);
    assert.equal(
      ownerView.appearance.previousImageUrl,
      `/api/media/characters/${activated.sheet.id}.old.jpg`,
    );

    await assert.rejects(
      repo.activateCharacterPortraitRevision({
        characterId: activated.sheet.id,
        ownerUserId: "owner-v2",
        expectedGenerationId: activated.generation.generationId,
        operationId: "portrait-stale",
        mediaId: "/api/media/characters/stale.jpg",
        mediaRevisionId: "img-stale",
        sourceDigest: assetContentDigest("portrait-stale"),
      }),
      /ASSET_CURRENT_GENERATION_DRIFT/,
    );
    assert.equal(
      (await repo.getReadyCharacterGeneration(activated.sheet.id))?.generationId,
      portrait.generation.generationId,
    );

    const toggled = await repo.toggleCharacterPortraitGeneration({
      characterId: activated.sheet.id,
      ownerUserId: "owner-v2",
      expectedGenerationId: portrait.generation.generationId,
      operationId: "portrait-toggle-1",
    });
    assert.equal(
      toggled.sheet.appearance.imageUrl,
      `/api/media/characters/${activated.sheet.id}.old.jpg`,
    );
    assert.equal(
      toggled.sheet.appearance.previousImageUrl,
      `/api/media/characters/${activated.sheet.id}.new.jpg`,
    );

    const beforeRestore = await getAssetGeneration(toggled.generation.generationId);
    await assert.rejects(repo.restorePreviousCharacterGeneration({
      characterId: activated.sheet.id, ownerUserId: "owner-v2",
      expectedGenerationId: toggled.generation.generationId, operationId: "generation-restore-1",
    }), /CHARACTER_UPDATE_UNAVAILABLE/);
    assert.equal((await repo.getReadyCharacterGeneration(activated.sheet.id))?.generationId,
      toggled.generation.generationId);
    assert.deepEqual((await getAssetGeneration(toggled.generation.generationId))?.content, beforeRestore?.content);

  });

  it("leaves an existing legacy row unsupported without an explicit upgrade", async () => {
    const legacy = sheet("legacy-existing");
    await query(
      `INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [legacy.id, legacy.ownerUserId, JSON.stringify(legacy), legacy.createdAt, legacy.updatedAt],
    );
    assert.deepEqual(await repo.getCharacterCompatibility(legacy.id), {
      status: "unsupported",
      schemaVersion: null,
      currentGenerationId: null,
      reasonCode: "legacy_schema",
    });
    assert.equal(await repo.getReadyCharacterGeneration(legacy.id), null);

    const sourceText = legacy.narrativeBlurb;
    const started = await repo.beginCharacterAuthoringAttempt({
      targetSchemaVersion: 3,
      ownerUserId: legacy.ownerUserId,
      characterId: legacy.id,
      kind: "upgrade",
      idempotencyKey: "upgrade:legacy-without-generation",
      requestDigest: assetContentDigest({ sourceText }),
      sourceText,
      sourceDigest: assetContentDigest(sourceText),
    });
    assert.equal(started.attempt.expectedGenerationId, null);
    assert.equal((await repo.getCharacterCompatibility(legacy.id)).status, "upgrading");

    assert.equal(await repo.discardCharacterAuthoringAttempt(
      started.attempt.attemptId,
      legacy.ownerUserId,
    ), true);
    assert.equal((await repo.getCharacterCompatibility(legacy.id)).status, "unsupported");
  });

  it("persists expiry without activating a candidate or retaining an upgrade hold", async () => {
    const sourceText = "期限切れになる新規キャラクター";
    const create = await repo.beginCharacterAuthoringAttempt({
      targetSchemaVersion: 3,
      ownerUserId: "owner-v2",
      kind: "create",
      idempotencyKey: "create:expired-character-v2",
      requestDigest: assetContentDigest({ sourceText }),
      sourceText,
      sourceDigest: assetContentDigest(sourceText),
      ttlMs: -1,
    });
    await repo.saveCharacterAuthoringCandidate({
      attemptId: create.attempt.attemptId,
      ownerUserId: "owner-v2",
      envelope: currentEnvelope({
        attemptId: create.attempt.attemptId,
        sourceText,
        sheet: sheet(create.attempt.characterId),
      }),
      assistantMessage: "期限切れ候補",
    });

    await assert.rejects(
      activateReviewedCandidate({
        attemptId: create.attempt.attemptId,
        ownerUserId: "owner-v2",
      }),
      /AUTHORING_ATTEMPT_EXPIRED/,
    );
    const expiredCreate = await repo.getCharacterAuthoringAttempt(
      create.attempt.attemptId,
      "owner-v2",
    );
    assert.equal(expiredCreate?.status, "expired");
    assert.equal(expiredCreate?.sourceText, null);
    assert.equal(await characters.getSheet(create.attempt.characterId), null);
    const createGenerationCount = await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM asset_generations
        WHERE asset_type = 'character' AND asset_id = $1`,
      [create.attempt.characterId],
    );
    assert.equal(Number(createGenerationCount.rows[0]?.count), 0);

    const legacy = sheet("expired-upgrade-v2");
    await query(
      `INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [legacy.id, legacy.ownerUserId, JSON.stringify(legacy), legacy.createdAt, legacy.updatedAt],
    );
    const upgrade = await repo.beginCharacterAuthoringAttempt({
      targetSchemaVersion: 3,
      ownerUserId: legacy.ownerUserId,
      characterId: legacy.id,
      kind: "upgrade",
      idempotencyKey: "upgrade:expired-character-v2",
      requestDigest: assetContentDigest({ sourceText: legacy.narrativeBlurb }),
      sourceText: legacy.narrativeBlurb,
      sourceDigest: assetContentDigest(legacy.narrativeBlurb),
      ttlMs: -1,
    });
    await repo.saveCharacterAuthoringCandidate({
      attemptId: upgrade.attempt.attemptId,
      ownerUserId: legacy.ownerUserId,
      envelope: currentEnvelope({
        attemptId: upgrade.attempt.attemptId,
        sourceText: legacy.narrativeBlurb,
        sheet: legacy,
      }),
      assistantMessage: "期限切れアップグレード候補",
    });
    await assert.rejects(
      activateReviewedCandidate({
        attemptId: upgrade.attempt.attemptId,
        ownerUserId: legacy.ownerUserId,
      }),
      /AUTHORING_ATTEMPT_EXPIRED/,
    );
    assert.deepEqual(await repo.getCharacterCompatibility(legacy.id), {
      status: "upgrade_failed",
      schemaVersion: null,
      currentGenerationId: null,
      reasonCode: "authoring_attempt_expired",
    });
  });

  it("rolls back a stale revision candidate after concurrent pointer drift", async () => {
    const currentSheet = sheet("concurrent-pointer-v2");
    await saveHistoricalCharacterFixture(currentSheet);
    const currentGeneration = await createAssetGeneration({ assetType: "character", assetId: currentSheet.id,
      schemaVersion: 3, content: currentEnvelope({ attemptId: "current-revision-fixture",
        sourceText: currentSheet.narrativeBlurb, sheet: currentSheet }) });
    await query("UPDATE character_asset_states SET current_generation_id = $2 WHERE character_id = $1",
      [currentSheet.id, currentGeneration.generationId]);
    const original = await repo.getReadyCharacterGeneration(currentSheet.id);
    assert.ok(original);
    const sourceText = "表示名を構造子改へ更新する";
    const revision = await repo.beginCharacterAuthoringAttempt({
      targetSchemaVersion: 3,
      ownerUserId: currentSheet.ownerUserId,
      characterId: currentSheet.id,
      kind: "revision",
      idempotencyKey: "revision:concurrent-pointer-v2",
      requestDigest: assetContentDigest({ sourceText }),
      sourceText,
      sourceDigest: assetContentDigest(sourceText),
    });
    await repo.saveCharacterAuthoringCandidate({
      attemptId: revision.attempt.attemptId,
      ownerUserId: currentSheet.ownerUserId,
      envelope: currentEnvelope({
        attemptId: revision.attempt.attemptId,
        sourceText,
        sheet: { ...currentSheet, displayName: "構造子改" },
      }),
      assistantMessage: "更新候補",
    });

    await assert.rejects(repo.activateCharacterPortraitRevision({
      characterId: currentSheet.id, ownerUserId: currentSheet.ownerUserId,
      expectedGenerationId: original.generationId, operationId: "blocked-during-revision",
      mediaId: "/api/media/characters/concurrent.jpg", mediaRevisionId: "concurrent-image-v3",
      sourceDigest: assetContentDigest("concurrent-portrait-v3"),
    }), /CHARACTER_V3_NOT_READY/);
    // Separate fixture transition represents pointer drift; the held portrait
    // route above cannot create it. Activation must still reject stale CAS input.
    const driftedSheet = { ...currentSheet, appearance: { ...currentSheet.appearance,
      imageUrl: "/api/media/characters/concurrent.jpg" } };
    const concurrent = await createAssetGeneration({ assetType: "character", assetId: currentSheet.id,
      schemaVersion: 3, content: currentEnvelope({ attemptId: "independent-pointer-drift",
        sourceText: currentSheet.narrativeBlurb, sheet: driftedSheet }) });
    await query("UPDATE character_asset_states SET current_generation_id = $2 WHERE character_id = $1",
      [currentSheet.id, concurrent.generationId]);
    await query("UPDATE characters SET sheet_json = $2 WHERE id = $1",
      [currentSheet.id, JSON.stringify(driftedSheet)]);
    const generationCountBefore = await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM asset_generations
        WHERE asset_type = 'character' AND asset_id = $1`,
      [currentSheet.id],
    );

    await assert.rejects(
      activateReviewedCandidate({
        attemptId: revision.attempt.attemptId,
        ownerUserId: currentSheet.ownerUserId,
      }),
      /ASSET_CURRENT_GENERATION_DRIFT/,
    );
    const generationCountAfter = await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM asset_generations
        WHERE asset_type = 'character' AND asset_id = $1`,
      [currentSheet.id],
    );
    assert.equal(
      Number(generationCountAfter.rows[0]?.count),
      Number(generationCountBefore.rows[0]?.count),
    );
    assert.equal(
      (await repo.getReadyCharacterGeneration(currentSheet.id))?.generationId,
      concurrent.generationId,
    );
    assert.equal(
      (await characters.getSheet(currentSheet.id))?.appearance.imageUrl,
      "/api/media/characters/concurrent.jpg",
    );
    assert.equal(
      (await repo.getCharacterAuthoringAttempt(
        revision.attempt.attemptId,
        currentSheet.ownerUserId,
      ))?.status,
      "awaiting_owner_acceptance",
    );
  });

  it("excludes a pre-validator V2 generation until explicit update", async () => {
    const currentSheet = sheet("pre-validator-v2");
    await saveHistoricalCharacterFixture(currentSheet);
    const current = await repo.getReadyCharacterGeneration(currentSheet.id);
    assert.ok(current);
    const valid = CharacterGenerationEnvelopeV2Schema.parse(current.content);
    const {
      claimValidation: _claimValidation,
      ...presentationWithoutReceipt
    } = valid.publicPresentation;
    const invalid = CharacterGenerationEnvelopeV2Schema.parse({
      ...valid,
      publicPresentation: presentationWithoutReceipt,
    });
    const invalidGeneration = await createAssetGeneration({
      assetType: "character",
      assetId: currentSheet.id,
      schemaVersion: 2,
      content: invalid,
    });
    await query(
      `UPDATE character_asset_states
          SET current_generation_id = $2
        WHERE character_id = $1`,
      [currentSheet.id, invalidGeneration.generationId],
    );

    assert.deepEqual(await repo.getCharacterCompatibility(currentSheet.id), {
      status: "unsupported",
      schemaVersion: 2,
      currentGenerationId: invalidGeneration.generationId,
      reasonCode: "missing_claim_validation",
    });
    assert.equal(await repo.getReadyCharacterGeneration(currentSheet.id), null);
    assert.equal(
      (await repo.listReadyCharacterIds([currentSheet.id])).has(currentSheet.id),
      false,
    );
    const management = await characters.toPublicCharacterForViewer(
      currentSheet,
      currentSheet.ownerUserId,
    );
    assert.equal(management.selectable, false);
    assert.equal(management.upgradeAction?.targetSchemaVersion, 3);
  });

  it("reads but does not select a V2 generation with selectorless action norms", async () => {
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, 'x', $3)
       ON CONFLICT(id) DO NOTHING`,
      ["owner-v2", "owner-v2", "2026-08-13T00:00:00.000Z"],
    );
    const currentSheet = sheet("selectorless-v2");
    await saveHistoricalCharacterFixture(currentSheet);
    const current = await repo.getReadyCharacterGeneration(currentSheet.id);
    assert.ok(current);
    const historical = CharacterGenerationEnvelopeV2Schema.parse(current.content);
    historical.definition.actionNorms = [{
      id: "historical-selectorless",
      when: {
        match: "all",
        clauses: [{ kind: "always", operator: "is", value: "true" }],
      },
      response: {
        disposition: "prefer",
        actionRefs: [],
        actionKinds: [],
        tacticTags: [],
        statement: "過去の説明文だけの規範",
        fallbackActionRef: null,
      },
      priority: 50,
      force: "preference",
      selfAwareness: "aware",
      exceptions: [],
      description: null,
    }];
    const historicalGeneration = await createAssetGeneration({
      assetType: "character",
      assetId: currentSheet.id,
      schemaVersion: 2,
      content: historical,
    });
    await query(
      `UPDATE character_asset_states
          SET current_generation_id = $2
        WHERE character_id = $1`,
      [currentSheet.id, historicalGeneration.generationId],
    );

    assert.deepEqual(await repo.getCharacterCompatibility(currentSheet.id), {
      status: "unsupported",
      schemaVersion: 2,
      currentGenerationId: historicalGeneration.generationId,
      reasonCode: "invalid_action_norm_selector",
    });
    assert.equal(await repo.getReadyCharacterGeneration(currentSheet.id), null);
  });
});
