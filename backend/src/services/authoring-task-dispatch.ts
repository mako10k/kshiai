import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../config.js";
import {
  dispatchAuthoringOutbox,
  recoverStaleAuthoringOutbox,
  type AuthoringOutboxDelivery,
} from "../repositories/family-authoring-jobs.js";

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
    throw new Error(`AUTHORING_TASK_METADATA_${response.status}`);
  }
  const body = await response.json() as { access_token?: unknown };
  if (typeof body.access_token !== "string" || body.access_token.length === 0) {
    throw new Error("AUTHORING_TASK_METADATA_TOKEN_MISSING");
  }
  return body.access_token;
}

export async function enqueueAuthoringTask(
  delivery: AuthoringOutboxDelivery,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  const task = config.authoringTaskQueue;
  if (!task.configured) throw new Error("AUTHORING_TASK_QUEUE_NOT_CONFIGURED");
  const accessToken = await metadataAccessToken(fetchImpl);
  const parent = `projects/${task.project}/locations/${task.location}/queues/${task.queue}`;
  const taskId = createHash("sha256")
    .update(`${delivery.outboxId}:${delivery.deliveryGeneration}`)
    .digest("hex");
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
          name: `${parent}/tasks/authoring-${taskId}`,
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
  if (!response.ok && response.status !== 409) {
    throw new Error(`AUTHORING_TASK_ENQUEUE_${response.status}`);
  }
}

export async function dispatchPendingAuthoringTasks(limit = 20): Promise<{
  delivered: number;
  failed: number;
}> {
  if (!config.authoringTaskQueue.configured) return { delivered: 0, failed: 0 };
  await recoverStaleAuthoringOutbox();
  return dispatchAuthoringOutbox((delivery) => enqueueAuthoringTask(delivery), limit);
}

export async function verifyAuthoringTaskAuthorization(
  authorization: string | undefined,
): Promise<boolean> {
  const task = config.authoringTaskQueue;
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
