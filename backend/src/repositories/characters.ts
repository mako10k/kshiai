import type { CharacterSheet } from "@kshiai/shared";
import {
  CharacterSheetSchema,
  defaultRecord,
  ensureRecord,
  ensureRecordOverall,
  ensureCharacterCombatProperties,
  ensureCharacterIdentityProperties,
  summarizeRatingPopulation,
  toPublicCharacter,
  toAssetAuthoringProgress,
  type RatingDisplayContext,
  OpponentBattleMemorySchema,
  type OpponentBattleMemory,
  CharacterGenerationEnvelopeV2Schema,
  CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
  REQUIRED_CHARACTER_COMPILERS_V2,
  defaultCharacterDisclosurePolicyV2,
  legacyCharacterSheetToDefinitionV2,
  projectCharacterProfileSourceV2,
} from "@kshiai/shared";
import type { CharacterReference } from "../llm/types.js";
import { normalizeCharacterName } from "../character-name-uniqueness.js";
import { query, withTransaction } from "../db.js";
import { newId } from "../id.js";
import {
  accountRealm,
  canAccessAccountKind,
  canUserAccessOwner,
  getUserAccessProfile,
  normalizeAccountKind,
  type AccountRealm,
} from "../account-access.js";
import {
  activateAssetGeneration,
  appendAssetGeneration,
  assetContentDigest,
} from "./asset-generations.js";
import {
  getCharacterCompatibility,
  getInFlightCharacterAuthoringAttempt,
  getReadyCharacterGenerationHistory,
  listReadyCharacterIds,
} from "./character-assets-v2.js";

function parseSheet(json: unknown): CharacterSheet {
  const value = typeof json === "string" ? JSON.parse(json) : json;
  const raw = ensureCharacterIdentityProperties(
    ensureCharacterCombatProperties(CharacterSheetSchema.parse(value)),
  );
  if (!raw.record) {
    return { ...raw, record: defaultRecord() };
  }
  return raw;
}

function toReference(sheet: CharacterSheet): CharacterReference {
  const hydrated = ensureCharacterIdentityProperties(sheet);
  return {
    id: hydrated.id,
    displayName: hydrated.displayName,
    identity: hydrated.identity!,
    appearanceSummary: hydrated.appearance.summary,
    traits: hydrated.traits,
    narrativeBlurb: hydrated.narrativeBlurb,
    skillNames: hydrated.skills.map((skill) => skill.name),
    weaponName: hydrated.weapon?.name ?? null,
    armorName: hydrated.armor?.name ?? null,
  };
}

/** Search only characters owned by userId; safe to expose to generation tools. */
export function searchOwnedCharacterReferences(
  userId: string,
  query: string,
  limit = 8,
): Promise<CharacterReference[]> {
  const needle = query.trim().toLowerCase();
  return listOwnedSheets(userId).then((sheets) => sheets
    .filter(isActive)
    .filter((sheet) => {
      if (!needle) return true;
      const identity = ensureCharacterIdentityProperties(sheet).identity!;
      return [
        sheet.displayName,
        sheet.narrativeBlurb,
        ...sheet.tags,
        ...sheet.traits,
        identity.realName ?? "",
        ...identity.nicknames,
        ...identity.selfNames,
        ...identity.epithets,
      ].some((value) => value.toLowerCase().includes(needle));
    })
    .slice(0, Math.max(1, Math.min(20, limit)))
    .map(toReference));
}

/** Fetch a generation reference only when it belongs to userId. */
export async function getOwnedCharacterReference(
  userId: string,
  characterId: string,
): Promise<CharacterReference | null> {
  const sheet = await getSheet(characterId);
  return sheet?.ownerUserId === userId ? toReference(sheet) : null;
}

/** Internal migration support; never returned by an API route. */
export async function listAllSheetsIncludingDeleted(): Promise<CharacterSheet[]> {
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters ORDER BY updated_at ASC`,
  );
  return rows.map((row) => parseSheet(row.sheet_json));
}

/** Population totals used only to center visible ratings on 1500. */
export async function getRatingDisplayContext(
  realm: AccountRealm = "general",
): Promise<RatingDisplayContext> {
  const { rows } = await query<{
    sheet_json: unknown;
    account_kind: string | null;
  }>(
    `SELECT c.sheet_json, u.account_kind
     FROM characters c
     JOIN users u ON u.id = c.owner_user_id`,
  );
  const active = rows
    .filter((row) => accountRealm(normalizeAccountKind(row.account_kind)) === realm)
    .map((row) => parseSheet(row.sheet_json))
    .filter(isActive);
  return {
    public: summarizeRatingPopulation(
      active.map((sheet) => ensureRecord(sheet).rating),
    ),
    overall: summarizeRatingPopulation(
      active.map((sheet) => ensureRecordOverall(sheet).rating),
    ),
  };
}

export async function toPublicCharacterForViewer(
  sheet: CharacterSheet,
  viewerUserId?: string | null,
  ratingDisplay?: RatingDisplayContext,
) {
  const display = ratingDisplay ?? (await getRatingDisplayContext(
    (await getUserAccessProfile(sheet.ownerUserId)).realm,
  ));
  const { getUserPublicById } = await import("./users.js");
  const owner = await getUserPublicById(sheet.ownerUserId);
  const dto = toPublicCharacter(
    sheet,
    viewerUserId,
    display,
    owner
      ? {
          id: owner.id,
          username: owner.username,
          displayName: owner.displayName,
        }
      : null,
  );
  const compatibility = await getCharacterCompatibility(sheet.id);
  const isOwner = viewerUserId === sheet.ownerUserId;
  const inFlight = isOwner
    ? await getInFlightCharacterAuthoringAttempt(sheet.id, sheet.ownerUserId)
    : null;
  const history = isOwner && compatibility.status === "ready"
    ? await getReadyCharacterGenerationHistory(sheet.id)
    : null;
  const currentPortrait = history?.current.content.definition.appearance.portrait;
  const previousPortrait = history?.previousPortrait;
  return {
    ...dto,
    ...(isOwner && history
      ? {
          appearance: {
            ...dto.appearance,
            previousImageUrl: previousPortrait?.mediaId ?? null,
          },
          canToggleImage: Boolean(currentPortrait && previousPortrait),
          canRestoreRevision: history.previous != null,
          revisionSavedAt: history.previous ? history.current.createdAt : null,
          revisionLabel: history.previous ? "直前の確定世代" : null,
        }
      : {}),
    compatibility,
    selectable: compatibility.status === "ready",
    upgradeAction: isOwner && compatibility.status !== "ready"
      ? { label: "このキャラを最新版に更新", targetSchemaVersion: 2 }
      : null,
    authoringProgress: inFlight
      ? toAssetAuthoringProgress(inFlight.kind, inFlight.status)
      : null,
  };
}

export async function listSheetsMissingIdentity(): Promise<CharacterSheet[]> {
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters ORDER BY updated_at ASC`,
  );
  return rows
    .filter((row) => {
      const value = (typeof row.sheet_json === "string"
        ? JSON.parse(row.sheet_json)
        : row.sheet_json) as Record<string, unknown>;
      return value.identity === undefined || value.identity === null;
    })
    .map((row) => parseSheet(row.sheet_json));
}

async function listOwnedSheets(userId: string): Promise<CharacterSheet[]> {
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters WHERE owner_user_id = $1 ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map((row) => parseSheet(row.sheet_json));
}

function isActive(sheet: CharacterSheet): boolean {
  return !sheet.deletedAt;
}

/** All owner-scoped identifying names, used to prevent accidental reuse. */
export async function listOwnedCharacterReservedNames(
  userId: string,
  excludeCharacterId?: string,
): Promise<string[]> {
  const unique = new Map<string, string>();
  for (const sheet of (await listOwnedSheets(userId))
    .filter(isActive)
    .filter((candidate) => candidate.id !== excludeCharacterId)) {
    const identity = ensureCharacterIdentityProperties(sheet).identity!;
    const names = [
      sheet.displayName,
      identity.realName,
      ...identity.nicknames,
      ...identity.epithets,
    ];
    for (const name of names) {
      if (!name) continue;
      const normalized = normalizeCharacterName(name);
      if (normalized && !unique.has(normalized)) unique.set(normalized, name);
    }
  }
  return [...unique.values()];
}

export type CharacterListPage = {
  characters: ReturnType<typeof toPublicCharacter>[];
  total: number;
  limit: number;
  offset: number;
};

function clampPage(limit?: number, offset?: number) {
  const safeLimit = Math.max(1, Math.min(50, limit ?? 20));
  const safeOffset = Math.max(0, offset ?? 0);
  return { limit: safeLimit, offset: safeOffset };
}

export async function listCharactersForUser(
  userId: string,
  q?: string,
  page?: { limit?: number; offset?: number },
): Promise<CharacterListPage> {
  let sheets = (await listOwnedSheets(userId)).filter(isActive);
  if (q?.trim()) {
    const needle = q.trim().toLowerCase();
    sheets = sheets.filter(
      (s) =>
        s.displayName.toLowerCase().includes(needle) ||
        s.narrativeBlurb.toLowerCase().includes(needle) ||
        s.tags.some((t) => t.toLowerCase().includes(needle)),
    );
  }
  // Sort by public ranked rating, then overall for owner list
  sheets.sort((a, b) => {
    const ra = a.record?.rating ?? a.recordOverall?.rating ?? 1500;
    const rb = b.record?.rating ?? b.recordOverall?.rating ?? 1500;
    if (rb !== ra) return rb - ra;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  const { limit, offset } = clampPage(page?.limit, page?.offset);
  const total = sheets.length;
  const pageSheets = sheets.slice(offset, offset + limit);
  const ratingDisplay = await getRatingDisplayContext(
    (await getUserAccessProfile(userId)).realm,
  );
  // Owner always sees private overall stats
  return {
    characters: await Promise.all(pageSheets.map(async (sheet) => {
      const compatibility = await getCharacterCompatibility(sheet.id);
      return {
        ...toPublicCharacter(sheet, userId, ratingDisplay),
        compatibility,
        selectable: compatibility.status === "ready",
        upgradeAction: compatibility.status === "ready"
          ? null
          : { label: "このキャラを最新版に更新", targetSchemaVersion: 2 },
      };
    })),
    total,
    limit,
    offset,
  };
}

/** Hide early mock-test junk (e.g. 「はアキ」) from matchmaking. */
function isPlayableOpponent(sheet: CharacterSheet): boolean {
  if (!isActive(sheet)) return false;
  // Old mock provider tagged these.
  if (sheet.tags?.includes("mock")) return false;
  return true;
}

export async function listPublicOpponents(
  excludeUserId: string,
  q?: string,
  page?: { limit?: number; offset?: number },
): Promise<CharacterListPage> {
  let sheets = await listPlayableOpponentSheets(excludeUserId);
  if (q?.trim()) {
    const needle = q.trim().toLowerCase();
    sheets = sheets.filter((s) => s.displayName.toLowerCase().includes(needle));
  }
  sheets.sort((a, b) => {
    const ra = a.record?.rating ?? 1500;
    const rb = b.record?.rating ?? 1500;
    if (rb !== ra) return rb - ra;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  const { limit, offset } = clampPage(page?.limit ?? 10, page?.offset);
  const total = sheets.length;
  const pageSheets = sheets.slice(offset, offset + limit);
  const ratingDisplays = new Map<AccountRealm, RatingDisplayContext>();
  for (const realm of ["general", "test"] as const) {
    ratingDisplays.set(realm, await getRatingDisplayContext(realm));
  }
  const viewer = await getUserAccessProfile(excludeUserId);
  // Viewer is excludeUserId: own chars get overall; others public-only
  const characters = await Promise.all(pageSheets.map(async (sheet) => {
    const realm = viewer.isAdmin
      ? (await getUserAccessProfile(sheet.ownerUserId)).realm
      : viewer.realm;
    return toPublicCharacter(
      sheet,
      excludeUserId,
      ratingDisplays.get(realm),
    );
  }));
  return { characters, total, limit, offset };
}

/** Engine-only sheets available as opponents; never expose directly from routes. */
export async function listPlayableOpponentSheets(
  excludeUserId: string,
): Promise<CharacterSheet[]> {
  const viewer = await getUserAccessProfile(excludeUserId);
  const { rows } = await query<{
    sheet_json: unknown;
    account_kind: string | null;
  }>(
    `SELECT c.sheet_json, u.account_kind
     FROM characters c
     JOIN users u ON u.id = c.owner_user_id
     WHERE c.owner_user_id != $1
     ORDER BY c.updated_at DESC
     LIMIT 200`,
    [excludeUserId],
  );
  const { isViewerFriendedByOwner } = await import("./friends.js");
  const friendCache = new Map<string, boolean>();
  const canViewVisibility = async (sheet: CharacterSheet): Promise<boolean> => {
    if (!isPlayableOpponent(sheet)) return false;
    const visibility = sheet.visibility ?? "public";
    if (visibility === "public") return true;
    if (visibility === "private") return false;
    let ok = friendCache.get(sheet.ownerUserId);
    if (ok === undefined) {
      ok = await isViewerFriendedByOwner(sheet.ownerUserId, excludeUserId);
      friendCache.set(sheet.ownerUserId, ok);
    }
    return ok;
  };
  const sheets: CharacterSheet[] = [];
  for (const row of rows) {
    if (!canAccessAccountKind(viewer, normalizeAccountKind(row.account_kind))) {
      continue;
    }
    const sheet = parseSheet(row.sheet_json);
    if (await canViewVisibility(sheet)) sheets.push(sheet);
  }
  // Include own characters as sparring partners
  const { rows: own } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters WHERE owner_user_id = $1`,
    [excludeUserId],
  );
  for (const row of own) {
    const sheet = parseSheet(row.sheet_json);
    if (isActive(sheet)) sheets.push(sheet);
  }
  const map = new Map(sheets.map((s) => [s.id, s]));
  const unique = [...map.values()];
  const readyIds = await listReadyCharacterIds(unique.map((sheet) => sheet.id));
  return unique.filter((sheet) => readyIds.has(sheet.id));
}

export async function updateCharacterVisibility(
  characterId: string,
  ownerUserId: string,
  visibility: "public" | "friends" | "private",
): Promise<CharacterSheet | null> {
  const sheet = await getSheet(characterId);
  if (!sheet || sheet.ownerUserId !== ownerUserId) return null;
  const next = {
    ...sheet,
    visibility,
    updatedAt: new Date().toISOString(),
  };
  await saveSheet(next);
  return next;
}

export async function canViewCharacter(
  viewerUserId: string,
  sheet: Pick<CharacterSheet, "ownerUserId">,
): Promise<boolean> {
  return canUserAccessOwner(viewerUserId, sheet.ownerUserId);
}

export async function getSheet(id: string): Promise<CharacterSheet | null> {
  const sheet = await getSheetIncludingDeleted(id);
  if (!sheet || sheet.deletedAt) return null;
  return sheet;
}

export async function getSheetIncludingDeleted(id: string): Promise<CharacterSheet | null> {
  const { rows } = await query<{ sheet_json: unknown }>(
    `SELECT sheet_json FROM characters WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return parseSheet(row.sheet_json);
}

export async function saveSheet(sheet: CharacterSheet): Promise<void> {
  const withRecord: CharacterSheet = {
    ...ensureCharacterIdentityProperties(
      ensureCharacterCombatProperties(sheet),
    ),
    record: sheet.record ?? defaultRecord(),
  };
  const json = JSON.stringify(withRecord);
  await withTransaction(async (connection) => {
    const stored = await connection.query<{ id: string }>(
      `SELECT id FROM characters WHERE id = $1`,
      [withRecord.id],
    );
    // V2 authority is immutable. Existing operational rows may refresh only
    // the transitional read model; they never append a legacy generation.
    let importedGeneration: Awaited<ReturnType<typeof appendAssetGeneration>> | null = null;
    if (!stored.rows[0]) {
      // Programmatic seed/import of a brand-new character is explicitly marked
      // as an import. Existing rows are never auto-upgraded by this path.
      const definition = legacyCharacterSheetToDefinitionV2(withRecord);
      const disclosurePolicy = defaultCharacterDisclosurePolicyV2(definition);
      const projection = projectCharacterProfileSourceV2(
        definition,
        disclosurePolicy,
      );
      const projectionDigest = assetContentDigest(projection);
      const sourceDigest = assetContentDigest(withRecord.narrativeBlurb);
      const description = withRecord.narrativeBlurb.trim() || withRecord.displayName;
      const envelope = CharacterGenerationEnvelopeV2Schema.parse({
        envelopeVersion: 2,
        definitionSchema: { family: "character", version: 2 },
        definition,
        disclosurePolicy,
        publicPresentation: {
          description,
          projectionContractVersion: 2,
          projectionDigest,
          descriptionInputDigest: assetContentDigest({ sourceDigest, projectionDigest }),
          segments: [{
            id: "imported-profile",
            text: description.slice(0, 1200),
            kind: "fact",
            supportRefs: projection.facts.map((fact) => fact.supportRef).slice(0, 12),
          }],
          claimValidation: {
            contractVersion: 1,
            validatorContract: CHARACTER_PROFILE_CLAIM_VALIDATOR_CONTRACT,
            projectionDigest,
            segments: [{
              segmentId: "imported-profile",
              verdict: "supported",
              supportRefs: projection.facts
                .map((fact) => fact.supportRef)
                .slice(0, 12),
              riskCodes: [],
            }],
          },
        },
        provenance: {
          sourceKind: "import",
          sourceDigest,
          attemptId: `internal-import:${withRecord.id}`.slice(0, 160),
          structureGeneratorContract: "legacy-deterministic-import-v2",
          descriptionGeneratorContract: "trusted-import-profile-v2",
        },
        compilerCompatibility: [...REQUIRED_CHARACTER_COMPILERS_V2],
      });
      importedGeneration = await appendAssetGeneration(connection, {
        assetType: "character",
        assetId: withRecord.id,
        schemaVersion: 2,
        content: envelope,
        createdAt: withRecord.updatedAt,
      });
    }
    await connection.query(
      `INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET owner_user_id = EXCLUDED.owner_user_id,
             sheet_json = EXCLUDED.sheet_json,
             updated_at = EXCLUDED.updated_at`,
      [
        withRecord.id,
        withRecord.ownerUserId,
        json,
        withRecord.createdAt,
        withRecord.updatedAt,
      ],
    );
    if (importedGeneration) {
      await activateAssetGeneration(
        connection,
        importedGeneration,
        null,
        withRecord.updatedAt,
      );
      await connection.query(
        `INSERT INTO character_asset_states
          (character_id, compatibility_status, current_generation_id,
           active_attempt_id, reason_code, updated_at)
         VALUES ($1, 'ready', $2, NULL, NULL, $3)`,
        [withRecord.id, importedGeneration.generationId, withRecord.updatedAt],
      );
    }
  });
}

/** Persist bounded owner-private notes for a specific opponent. */
export async function saveOpponentBattleMemory(input: {
  characterId: string;
  opponentId: string;
  preBattlePlan?: string;
  postBattleReflection?: string;
  battledAt?: string;
}): Promise<OpponentBattleMemory | null> {
  const sheet = await getSheetIncludingDeleted(input.characterId);
  if (!sheet) return null;
  const previous = sheet.opponentMemories?.[input.opponentId];
  const next = OpponentBattleMemorySchema.parse({
    ...(previous ?? {}),
    ...(input.preBattlePlan !== undefined
      ? { preBattlePlan: input.preBattlePlan.slice(0, 1200) }
      : {}),
    ...(input.postBattleReflection !== undefined
      ? { postBattleReflection: input.postBattleReflection.slice(0, 1200) }
      : {}),
    battleCount: (previous?.battleCount ?? 0) + 1,
    lastBattleAt: input.battledAt ?? new Date().toISOString(),
  });
  await saveSheet({
    ...sheet,
    opponentMemories: {
      ...(sheet.opponentMemories ?? {}),
      [input.opponentId]: next,
    },
    updatedAt: new Date().toISOString(),
  });
  return next;
}

/** Soft-delete: hide from lists without modifying any battle ratings. */
export async function softDeleteCharacter(
  id: string,
  ownerUserId: string,
): Promise<CharacterSheet | null> {
  const sheet = await getSheet(id);
  if (!sheet || sheet.ownerUserId !== ownerUserId) return null;
  const next: CharacterSheet = {
    ...sheet,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveSheet(next);
  return next;
}

/** @deprecated use softDeleteCharacter */
export async function deleteCharacter(id: string, ownerUserId: string): Promise<boolean> {
  return (await softDeleteCharacter(id, ownerUserId)) != null;
}

export async function copyCharacter(
  id: string,
  ownerUserId: string,
): Promise<CharacterSheet | null> {
  const src = await getSheet(id);
  if (!src || src.ownerUserId !== ownerUserId) return null;
  const t = new Date().toISOString();
  const copy: CharacterSheet = {
    ...src,
    id: newId("chr"),
    displayName: `${src.displayName} の写し`,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
    parameters: { ...src.parameters },
    skills: src.skills.map((s) => ({ ...s, id: newId("sk") })),
    tags: [...src.tags, "copy"],
    // Fresh rating — no carry-over from original (anti-clone farming)
    record: defaultRecord(),
    recordOverall: defaultRecord(),
    // Coaching memo is battle-history bound; start empty on copy.
    improvementMemo: undefined,
    // Undo buffer is character-instance specific.
    revisionSnapshot: null,
  };
  await saveSheet(copy);
  return copy;
}
