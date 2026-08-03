import { createLlmProvider } from "../llm/index.js";
import {
  listSheetsMissingIdentity,
  saveSheet,
} from "../repositories/characters.js";

const apply = process.argv.includes("--apply");
const sheets = await listSheetsMissingIdentity();
console.info(`[identity-backfill] ${sheets.length} character(s) need an identity profile`);

if (!apply) {
  console.info("[identity-backfill] dry run; pass --apply to persist changes");
  process.exit(0);
}

const llm = createLlmProvider();
let updated = 0;
for (const sheet of sheets) {
  const identity = await llm.inferCharacterIdentity(sheet);
  await saveSheet({
    ...sheet,
    identity,
    updatedAt: new Date().toISOString(),
  });
  updated += 1;
  console.info(`[identity-backfill] updated ${sheet.id} (${updated}/${sheets.length})`);
}

console.info(`[identity-backfill] complete: ${updated} updated`);
