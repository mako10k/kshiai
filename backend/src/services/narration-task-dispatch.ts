import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../config.js";
import {
  dispatchNarrationOutbox,
  type NarrationOutboxDelivery,
} from "./narration-worker.js";

const googleJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

type Fetch = typeof fetch;

async function metadataAccessToken(fetchImpl: Fetch): Promise<string> {
  const response = await fetchImpl(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } },
  );
  if (!response.ok) {
    throw new Error(`NARRATION_TASK_METADATA_${response.status}`);
  }
  const body = await response.json() as { access_token?: unknown };
  if (typeof body.access_token !== "string" || body.access_token.length === 0) {
    throw new Error("NARRATION_TASK_METADATA_TOKEN_MISSING");
  }
  return body.access_token;
}

export async function enqueueNarrationTask(
  delivery: NarrationOutboxDelivery,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  const task = config.narrationTaskQueue;
  if (!task.configured) throw new Error("NARRATION_TASK_QUEUE_NOT_CONFIGURED");
  const accessToken = await metadataAccessToken(fetchImpl);
  const parent = `projects/${task.project}/locations/${task.location}/queues/${task.queue}`;
  const taskId = createHash("sha256").update(delivery.outboxId).digest("hex");
  const response = await fetchImpl(
    `https://cloudtasks.googleapis.com/v2/${parent}/tasks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task: {
          name: `${parent}/tasks/narration-${taskId}`,
          httpRequest: {
            httpMethod: "POST",
            url: task.targetUrl,
            headers: { "Content-Type": "application/json" },
            body: Buffer.from(JSON.stringify(delivery)).toString("base64"),
            oidcToken: {
              serviceAccountEmail: task.serviceAccountEmail,
              audience: task.audience,
            },
          },
        },
      }),
    },
  );
  // A deterministic task name makes an ambiguous successful enqueue safe to retry.
  if (!response.ok && response.status !== 409) {
    throw new Error(`NARRATION_TASK_ENQUEUE_${response.status}`);
  }
}

export async function dispatchPendingNarrationTasks(limit = 20): Promise<{
  delivered: number;
  failed: number;
}> {
  if (!config.narrationTaskQueue.configured) return { delivered: 0, failed: 0 };
  return dispatchNarrationOutbox((delivery) => enqueueNarrationTask(delivery), limit);
}

export async function verifyNarrationTaskAuthorization(
  authorization: string | undefined,
): Promise<boolean> {
  const task = config.narrationTaskQueue;
  if (!task.configured || !authorization?.startsWith("Bearer ")) return false;
  try {
    const verified = await jwtVerify(authorization.slice(7), googleJwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: task.audience,
    });
    return verified.payload.email === task.serviceAccountEmail &&
      verified.payload.email_verified === true;
  } catch {
    return false;
  }
}
