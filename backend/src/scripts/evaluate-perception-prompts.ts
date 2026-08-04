import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { config } from "../config.js";
import {
  evaluatePerceptionPromptTopologies,
  type PerceptionPromptEvaluationClient,
} from "../llm/perception-prompt-runner.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

type RealProviderName = "xai" | "openai" | "venice";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.execute) usage("--execute is required because this command makes billed LLM calls");
  const provider = providerConfig(args.provider);
  const model = args.model || provider.modelFast;
  if (!provider.apiKey) usage(`${args.provider} API key is not configured`);
  const callCount = args.repetitions * 3 * 3;
  console.error(
    `[perception-eval] provider=${args.provider} model=${model} calls=${callCount}`,
  );

  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl,
    timeout: 30_000,
    maxRetries: 0,
  });
  const evaluationClient: PerceptionPromptEvaluationClient = {
    async completeJson(input) {
      const started = Date.now();
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        temperature: 0.35,
        response_format: input.responseFormat,
      });
      const content = response.choices[0]?.message?.content ?? "{}";
      return {
        data: JSON.parse(content) as unknown,
        measurement: {
          latencyMs: Date.now() - started,
          inputTokens: response.usage?.prompt_tokens ?? null,
          outputTokens: response.usage?.completion_tokens ?? null,
          totalTokens: response.usage?.total_tokens ?? null,
        },
      };
    },
  };
  const report = await evaluatePerceptionPromptTopologies({
    provider: args.provider,
    model,
    repetitions: args.repetitions,
    client: evaluationClient,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) {
    const outputPath = path.resolve(repositoryRoot, args.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, serialized, { encoding: "utf8", flag: "wx" });
    console.error(`[perception-eval] wrote ${outputPath}`);
  } else {
    process.stdout.write(serialized);
  }
}

function parseArgs(args: string[]): {
  provider: RealProviderName;
  model: string;
  repetitions: number;
  output: string | null;
  execute: boolean;
} {
  let provider: RealProviderName | null = null;
  let model = "";
  let repetitions = 3;
  let output: string | null = null;
  let execute = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--execute") {
      execute = true;
      continue;
    }
    const value = args[index + 1];
    if (!value) usage(`missing value for ${arg}`);
    if (arg === "--provider") {
      if (!isRealProvider(value)) usage("provider must be xai, openai, or venice");
      provider = value;
    } else if (arg === "--model") {
      model = value;
    } else if (arg === "--repetitions") {
      repetitions = Number(value);
    } else if (arg === "--output") {
      output = value;
    } else {
      usage(`unknown argument ${arg}`);
    }
    index += 1;
  }
  if (!provider) usage("--provider is required");
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) {
    usage("--repetitions must be an integer from 1 through 10; selection requires at least 3");
  }
  return { provider, model, repetitions, output, execute };
}

function providerConfig(provider: RealProviderName): {
  apiKey: string;
  baseUrl: string;
  modelFast: string;
} {
  if (provider === "xai") return config.xai;
  if (provider === "openai") return config.openai;
  return config.venice;
}

function isRealProvider(value: string): value is RealProviderName {
  return value === "xai" || value === "openai" || value === "venice";
}

function usage(error?: string): never {
  if (error) console.error(`Error: ${error}`);
  console.error(
    "Usage: npm run eval:perception-prompts --workspace=backend -- --provider <xai|openai|venice> [--model id] [--repetitions 3] [--output report.json] --execute",
  );
  process.exit(2);
}

await main();
