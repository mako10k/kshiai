// R: Observe trial HTTP input sizes and request options without retaining prompt text or credentials.
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { currentLlmUsageScope } from "../llm/llm-usage-context.js";

const RequestSchema = z.object({
  model: z.string(), messages: z.array(z.object({ role: z.string(), content: z.string() })),
  max_completion_tokens: z.number().optional(), reasoning_effort: z.string().optional(),
});

type TrialRequest = z.infer<typeof RequestSchema>;

function parseRequest(body: string | null): TrialRequest | null {
  if (body === null) return null;
  try {
    const candidate = RequestSchema.safeParse(JSON.parse(body));
    return candidate.success ? candidate.data : null;
  } catch {
    return null;
  }
}

function summarizeMessages(messages: TrialRequest["messages"] | undefined) {
  return messages?.map((message) => ({ role: message.role,
    characters: [...message.content].length, utf8Bytes: Buffer.byteLength(message.content) })) ?? null;
}

function writeObservation(directory: string, ordinal: number, startedAt: number, request: TrialRequest | null): void {
  const messages = summarizeMessages(request?.messages);
  appendFileSync(join(directory, "input-sizes.jsonl"), JSON.stringify({ ordinal, startedAt,
    scope: currentLlmUsageScope() ?? null, model: request?.model ?? null, messages,
    totalCharacters: messages?.reduce((sum, message) => sum + message.characters, 0) ?? null,
    totalUtf8Bytes: messages?.reduce((sum, message) => sum + message.utf8Bytes, 0) ?? null,
    maxCompletionTokens: request?.max_completion_tokens ?? null, reasoningEffort: request?.reasoning_effort ?? null,
  }) + "\n", { mode: 0o600 });
}

export function observeAwarenessTrialInputSizes(directory: string): () => void {
  const original = globalThis.fetch;
  let ordinal = 0;
  const observer: typeof fetch = async (request, init) => {
    const startedAt = Date.now();
    const parsed = parseRequest(typeof init?.body === "string" ? init.body : null);
    writeObservation(directory, ++ordinal, startedAt, parsed);
    return original(request, init);
  };
  globalThis.fetch = observer;
  return () => { if (globalThis.fetch === observer) globalThis.fetch = original; };
}
