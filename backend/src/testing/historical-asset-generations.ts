import { CharacterGenerationEnvelopeV3Schema } from "@kshiai/shared";
/** R: Construct immutable historical asset fixtures without admitting product legacy writes. */
import { databaseKind, withTransaction, type DatabaseConnection } from "../db.js";
import * as actual from "../repositories/asset-generations.js";
export * from "../repositories/asset-generations.js";
type Input = Parameters<typeof actual.writeAssetGeneration>[1];
async function appendHistorical(connection: DatabaseConnection, input: Input): Promise<actual.AssetGeneration> {
  if (databaseKind() === "postgres") await connection.query(
    "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [input.assetType, input.assetId]);
  const {rows} = await connection.query<{generation:number}>(
    "SELECT MAX(generation) AS generation FROM asset_generations WHERE asset_type=$1 AND asset_id=$2",[input.assetType,input.assetId]);
  const generation = Number(rows[0]?.generation ?? 0) + 1;
  const contentDigest = actual.assetContentDigest(input.content);
  const generationId = `${input.assetType}:${input.assetId}:g${generation}:${contentDigest.slice(0,16)}`;
  const createdAt = input.createdAt ?? new Date().toISOString();
  await connection.query(`INSERT INTO asset_generations
    (asset_type,asset_id,generation,generation_id,schema_version,content_json,content_digest,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [input.assetType,input.assetId,generation,generationId,
    input.schemaVersion,actual.canonicalAssetJson(input.content),contentDigest,createdAt]);
  return { ...input, generation,generationId,contentDigest,createdAt };
}
export async function activateAssetGeneration(connection:DatabaseConnection,generation:actual.AssetGeneration,
  expectedGenerationId:string|null,updatedAt=new Date().toISOString()):Promise<void> {
  if (generation.assetType !== "character" || (generation.schemaVersion === 3 && CharacterGenerationEnvelopeV3Schema.safeParse(generation.content).success)) {
    return actual.activateAssetGeneration(connection,generation,expectedGenerationId,updatedAt);
  }
  const {rows}=await connection.query<{generation_id:string}>(
    "SELECT generation_id FROM asset_current_generations WHERE asset_type=$1 AND asset_id=$2",[generation.assetType,generation.assetId]);
  if ((rows[0]?.generation_id ?? null) !== expectedGenerationId) throw new Error("ASSET_CURRENT_GENERATION_DRIFT");
  await connection.query(`INSERT INTO asset_current_generations (asset_type,asset_id,generation,generation_id,updated_at)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (asset_type,asset_id) DO UPDATE SET
    generation=EXCLUDED.generation,generation_id=EXCLUDED.generation_id,updated_at=EXCLUDED.updated_at`,
    [generation.assetType,generation.assetId,generation.generation,generation.generationId,updatedAt]);
}
export async function appendAssetGeneration(connection:DatabaseConnection,input:Input):Promise<actual.AssetGeneration> {
  return input.assetType === "character" && (input.schemaVersion !== 3 || !CharacterGenerationEnvelopeV3Schema.safeParse(input.content).success)
    ? appendHistorical(connection,input) : actual.appendAssetGeneration(connection,input);
}
export async function writeAssetGeneration(connection:DatabaseConnection,input:Input):Promise<actual.AssetGeneration> {
  if (input.assetType !== "character" || (input.schemaVersion === 3 && CharacterGenerationEnvelopeV3Schema.safeParse(input.content).success)) return actual.writeAssetGeneration(connection,input);
  const current=await actual.getCurrentAssetGeneration(input.assetType,input.assetId);
  if (current?.contentDigest === actual.assetContentDigest(input.content)) return current;
  const result=await appendHistorical(connection,input);
  await activateAssetGeneration(connection,result,current?.generationId ?? null,result.createdAt);
  return result;
}
export function createAssetGeneration(input:Input):Promise<actual.AssetGeneration> {
  return withTransaction(connection => writeAssetGeneration(connection,input));
}
