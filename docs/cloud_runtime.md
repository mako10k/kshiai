# Cloud runtime migration

## Decision

Run the API as one stateless container on Google Cloud Run in Tokyo
(`asia-northeast1`). Deploy the Vite build as Cloudflare Workers Static Assets.
The Worker serves the SPA and proxies same-origin `/api/*` requests to the Cloud
Run service without buffering the response body.

```text
Browser
  -> Cloudflare Worker at kshiai.mk10.org
       |-- static frontend assets
       `-- /api/* streaming proxy
             -> Cloud Run backend (Tokyo, 0..3 instances)
                  |-- Supabase Auth and PostgreSQL (Tokyo)
                  `-- Cloudflare R2
```

Cloud Run is selected over an always-on VM or Render Starter because it supplies
a managed request load balancer, revision rollback, concurrency-based horizontal
autoscaling, and scale-to-zero billing. Tokyo is a Tier 1 Cloud Run region and
the request-based free allowance is currently 180,000 vCPU-seconds, 360,000
GiB-seconds, and two million requests per billing account each month. Actual
charges remain usage-dependent, especially outbound network transfer.

Render remains a fallback if Cloud Run account provisioning is unavailable. Its
free web service is explicitly not intended for production and sleeps when idle;
paid compute introduces a fixed baseline, while autoscaling requires a paid
workspace. Oracle Always Free is not used because VM capacity allocation is an
operational dependency and the application no longer needs a persistent VM.

## Why the Cloudflare Tunnel is not moved

`cloudflared` is designed as a persistent connector next to a private origin.
Running it inside Cloud Run would require a warm instance and CPU outside normal
requests, defeating scale-to-zero. The Worker replaces the public ingress path,
keeps the existing hostname, and can stream an HTTP response for as long as the
client remains connected. The current local Tunnel stays online only as the
rollback origin until the cloud cutover is accepted.

## Runtime settings

Use request-based billing with these initial limits:

| Setting | Initial value | Reason |
|---|---:|---|
| Region | `asia-northeast1` | Near Supabase and users in Japan |
| CPU | 1 vCPU | Node is primarily waiting on PostgreSQL and LLM APIs |
| Memory | 512 MiB | Raise only from observed peak memory |
| Minimum instances | 0 | Lowest idle cost; accept initial cold start |
| Maximum instances | 3 | Cost and Supabase connection safety bound |
| Concurrency | 8 | Long SSE/LLM requests should not crowd one process |
| Request timeout | 300 seconds | Matches the current upper bound for a turn |
| `DATABASE_POOL_MAX` | 5 | At most 15 pooled connections across three instances |
| Container port | `$PORT` / 8080 | Cloud Run contract |

The service remains publicly invokable at the Cloud Run layer, but production
API requests must carry a Worker-injected origin verification secret. Direct
requests to the generated `run.app` URL are rejected when that protection is
enabled. Supabase JWT validation and application authorization remain unchanged.

Cloud Run revisions receive secrets from Google Secret Manager. Do not put
secret values in Docker images, Worker variables, deployment manifests, GitHub
configuration, or command history. The Worker stores only its origin verification
value as a Worker secret. The Cloud Run generated origin URL is non-secret.

## Deployment stages

1. Build the backend container and test it with PostgreSQL/R2 configuration.
2. Deploy a Cloud Run revision with no production traffic dependency.
3. Build the frontend and deploy a Worker preview that proxies to that revision.
4. Validate health, Supabase email and Google login, migrated ownership, R2
   images, ordinary API requests, and incremental SSE delivery.
5. Exercise at least two backend instances and confirm battle leases,
   idempotency, and PostgreSQL connection bounds.
6. Attach a staging hostname and repeat browser acceptance checks.
7. Move `kshiai.mk10.org` from the Tunnel route to the Worker only after all
   checks pass.

## Cutover and rollback

Before cutover, record the active Cloud Run revision, Worker version, current
Tunnel ID/configuration, and Cloudflare DNS route. Keep local PM2 and
`cloudflared-kshiai.service` running but do not direct production traffic to two
origins simultaneously.

Cutover changes only Cloudflare routing. PostgreSQL, Supabase Auth, and R2 are
already shared, so no data copy occurs during the switch. Validate `/api/health`,
login, character/media reads, one reversible API write, and a streamed battle
turn immediately after the change.

Rollback restores the prior Tunnel DNS route and disables the Worker production
route. It does not roll back PostgreSQL. If a cloud revision is faulty while the
Worker path is otherwise healthy, route the Cloud Run service to the last known
good revision instead. Retain the local runtime for at least 72 hours after
acceptance, then stop PM2 and the local tunnel without deleting their configs.

## Provisioning prerequisite

Cloudflare API access is already available through `secdat` as `T2_API_TOKEN`.
Cloud Run provisioning still requires a Google Cloud project with billing
enabled and an authenticated deployment identity. Required APIs include Cloud
Run, Artifact Registry, Cloud Build, and Secret Manager. Set a billing budget
alert before the first deployment; a budget alert is notification, not a hard
spending cap.

## Primary references

- Cloud Run pricing: <https://cloud.google.com/run/pricing>
- Cloud Run autoscaling: <https://cloud.google.com/run/docs/about-instance-autoscaling>
- Cloud Run request timeout: <https://cloud.google.com/run/docs/configuring/request-timeout>
- Cloudflare Workers limits: <https://developers.cloudflare.com/workers/platform/limits/>
- Cloudflare Workers pricing: <https://developers.cloudflare.com/workers/platform/pricing/>
- Render free-service limitations: <https://render.com/docs/free>
