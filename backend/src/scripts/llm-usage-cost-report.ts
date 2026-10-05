// R: Read persisted token totals and optionally reprice them from an explicit versioned rate file.
import { readFile } from "node:fs/promises";
import { closeDatabase } from "../db.js";
import { listLlmUsageAttempts } from "../repositories/llm-usage.js";
import { calculateLlmUsageCostReport, LlmUsagePriceTableSchema } from "../services/llm-usage-cost-report.js";
async function main() {
  const args = process.argv.slice(2);
  let pricePath: string | undefined;
  let battleId: string | undefined;
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (!value || (flag !== "--prices" && flag !== "--battle")) throw new Error("Usage: node --import tsx backend/src/scripts/llm-usage-cost-report.ts [--prices price-table.json] [--battle battle-id]");
    if (flag === "--prices") pricePath = value; else battleId = value;
  }
  const price = pricePath ? LlmUsagePriceTableSchema.parse(JSON.parse(await readFile(pricePath, "utf8"))) : undefined;
  const attempts = await listLlmUsageAttempts(battleId ? { battleId } : {});
  process.stdout.write(`${JSON.stringify(calculateLlmUsageCostReport(attempts, price), null, 2)}\n`);
}
try { await main(); } catch (error) { console.error(error instanceof Error ? error.message : "Usage report failed"); process.exitCode = 1; }
finally { await closeDatabase(); }
