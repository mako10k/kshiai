# Cloud staging record

## Deployment

The first cloud staging deployment was created on 2026-08-03.

| Resource | Value |
|---|---|
| Google Cloud project | `kshiai` |
| Region | `asia-northeast1` |
| Billing budget | `kshiai monthly`, JPY 1,000/month, alerts at 50/90/100% |
| Artifact Registry repository | `asia-northeast1-docker.pkg.dev/kshiai/kshiai` |
| Cloud Build | `66810592-24b8-427a-8c2b-237b23672889` |
| Backend image | `backend:d996af51b865` |
| Backend image digest | `sha256:f37de1a85c57ce315912f914ad3c0b6031d10af555d11e82a5fbf0b1fef521d2` |
| Cloud Run service | `kshiai-api` |
| Initial Cloud Run revision | `kshiai-api-00001-b6d` |
| Cloud Run origin | `https://kshiai-api-crpgn6evfa-an.a.run.app` |
| Cloudflare Worker | `kshiai-web` |
| Workers.dev staging URL | `https://kshiai-web.mako10k.workers.dev` (disabled at cutover) |
| Worker code version | `460b4d94-5741-4b95-8566-a669912cb6e9` |
| Worker version after secret binding | `f3a8ef15-82f2-465a-9eb6-88cbc31feb6a` |

Cloud Run uses one CPU, 512 MiB memory, concurrency 8, a 300-second request
timeout, and zero to three instances. The two-instance staging check was
temporary; the minimum instance count was restored to zero immediately after
the check.

## Secret boundaries

The Cloud Run runtime service account is
`kshiai-cloud-run@kshiai.iam.gserviceaccount.com`. It has per-secret accessor
bindings for these Secret Manager resources:

- `kshiai-database-url`
- `kshiai-r2-access-key-id`
- `kshiai-r2-secret-access-key`
- `kshiai-openai-api-key`
- `kshiai-xai-api-key`
- `kshiai-venice-api-key`
- `kshiai-origin-shared-secret`

The Worker stores `ORIGIN_SHARED_SECRET` as a Worker secret. Public deployment
configuration such as the Supabase URL, R2 account/bucket names, public media
URL, and Cloud Run origin remains in ordinary environment variables. Never put
secret values in this record or in a Wrangler configuration file.

## Validation evidence

The following checks passed against the deployed staging stack:

- A direct Cloud Run `/api/health` call without the origin header returned 404.
- The same call with the Worker origin secret returned PostgreSQL, Supabase
  Auth, and the `xai > openai > venice` provider order.
- The Workers.dev SPA and `/api/health` returned 200.
- A temporary Supabase email user obtained a JWT, mapped to an application
  user, called `/api/me` through the Worker, and was deleted afterward.
- The same temporary authenticated user received an end-to-end
  `text/event-stream` response through Worker and Cloud Run. The stream
  contained the initial comment and a structured `BATTLE_NOT_FOUND` terminal
  event; it did not invoke an LLM or create a battle.
- The PostgreSQL runtime smoke passed in a temporary schema and covered
  repositories, a contended distributed battle lease, idempotency, seeds,
  quota storage, and balance observations. The schema was dropped afterward.
- R2 credential-based object listing succeeded, and a public object returned
  200 to a HEAD request.
- Cloud Monitoring recorded two idle Cloud Run instances during the temporary
  minimum-two check. The service was then restored to minimum zero.
- Cloud Run emitted no unexpected error-severity logs during the deployment
  checks. The synthetic SSE check intentionally produced one
  `BATTLE_NOT_FOUND` stream error for its reserved nonexistent battle ID.

## Narration task queue

Provisioned on 2026-08-12 after the v0.17.0 observation RCA:

| Resource | Value |
|---|---|
| API | `cloudtasks.googleapis.com` enabled |
| Queue | `projects/kshiai/locations/asia-northeast1/queues/kshiai-narration` |
| Rate limit | 2 dispatches/second, 2 concurrent |
| Retry limit | 5 attempts, 10–300 second backoff |
| Enqueuer | `kshiai-cloud-run@kshiai.iam.gserviceaccount.com` |
| Task identity | same runtime service account, exact OIDC audience bound by release configuration |

The queue does not run narration until a revision containing the authenticated
worker endpoint and `NARRATION_TASK_*` settings is staged and promoted.

Supabase Auth temporarily allowed the Workers.dev callback for browser
acceptance. The callback was removed when Workers.dev was disabled at cutover.
The production Auth site URL remains `https://kshiai.mk10.org`.

Google OIDC login through the Workers.dev URL was accepted in a browser on
2026-08-03. A read-only ownership audit confirmed that the linked
`mako10k@mk10.org` application user retained 22 characters, four custom
battlefields, two narration styles, and 46 battles. Production cutover evidence
is recorded in `docs/cloud_cutover.md`.

The dependency audit still reports a Windows-only path traversal advisory in
`@hono/node-server` 1.x and an RSC-mode advisory in React Router. The deployed
backend runs Linux and does not use the affected static-file helper; the
frontend does not use React Server Components or route actions. No compatible
React Router release containing the advisory fix was available at validation
time. Recheck both advisories during the next dependency update.

## Rebuild and redeploy

Build the backend through Cloud Build using the repository-owned build file:

```bash
IMAGE="asia-northeast1-docker.pkg.dev/kshiai/kshiai/backend:$(git rev-parse --short=12 HEAD)"
gcloud builds submit . \
  --project=kshiai \
  --region=asia-northeast1 \
  --config=infra/cloudbuild.backend.yaml \
  --substitutions="_IMAGE=${IMAGE}"
```

Deploy the Worker only after building the frontend and loading the dedicated
Cloudflare token into `CLOUDFLARE_API_TOKEN`. Set `ORIGIN_SHARED_SECRET` with
`wrangler secret put`; do not pass it as `--var`.

## Rollback

The production Worker Route supersedes this staging state. Use
`docs/cloud_cutover.md` for the active rollback procedure. For a backend-only
rollback, route Cloud Run traffic to the recorded known-good revision or
redeploy the recorded image digest.
