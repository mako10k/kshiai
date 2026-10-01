// R: Finalize cutover HTTP operations after buffered or streamed responses are observed.
import { createHash } from "node:crypto";
import type { Context } from "hono";
import { beginCutoverOperation } from "./cutover-admission.js";

type CutoverOperation = Awaited<ReturnType<typeof beginCutoverOperation>>;

export async function requestBodyFor(c: Context): Promise<unknown> {
  try { return await c.req.raw.clone().json(); } catch { return null; }
}

export async function finishHttpOperation(c: Context, operation: CutoverOperation): Promise<void> {
  const response = c.res;
  if (!isEventStream(response)) return finishBuffered(response, operation);
  c.res = streamResponse(response, operation);
}

function isEventStream(response: Response): boolean {
  return Boolean(response.body && response.headers.get("content-type")?.includes("text/event-stream"));
}

async function finishBuffered(response: Response, operation: CutoverOperation): Promise<void> {
  const body = new Uint8Array(await response.clone().arrayBuffer());
  await operation.finish(response.status >= 500 ? "indeterminate" : "settled", responseDigest(response.status, body));
}

function streamResponse(response: Response, operation: CutoverOperation): Response {
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          await operation.finish("settled", responseDigest(response.status, concatChunks(chunks)));
          controller.close(); return;
        }
        chunks.push(chunk.value);
        controller.enqueue(chunk.value);
      } catch (error) {
        await operation.finish("indeterminate", responseDigest(response.status, concatChunks(chunks)));
        controller.error(error);
      }
    },
    async cancel() {
      await operation.finish("indeterminate", responseDigest(response.status, concatChunks(chunks)));
      await reader.cancel();
    },
  });
  return new Response(stream, response);
}

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function responseDigest(status: number, body: Uint8Array): string {
  return createHash("sha256").update(String(status)).update(":").update(body).digest("hex");
}
