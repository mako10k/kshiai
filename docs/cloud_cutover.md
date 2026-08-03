# Cloud production cutover

## Active production state

Production traffic moved to the cloud runtime on 2026-08-03 at
`2026-08-03T11:34:05Z`.

| Resource | Active value |
|---|---|
| Public hostname | `https://kshiai.mk10.org` |
| Worker | `kshiai-web` |
| Worker version | `118c66e5-1328-48f5-8235-029b0f429465` |
| Worker route | `kshiai.mk10.org/*` |
| Worker route ID | `da1f20df6f174e93be0fa945b41e9c38` |
| Cloud Run service | `kshiai-api` |
| Cloud Run revision | `kshiai-api-00001-b6d` |
| Cloud Run scaling | minimum 0, maximum 3, concurrency 8 |
| Previous Tunnel | `4603d799-ed6d-4ed5-86b6-2171137344cc` |

The existing proxied DNS and `cloudflared-kshiai.service` were not deleted.
The Worker Route takes precedence over that Tunnel route. Workers.dev was
disabled by Wrangler during cutover, and its temporary Supabase redirect URL
was removed.

## Acceptance evidence

- `/`, `/characters`, `/api/health`, and `/api/me` were served through the
  Worker and carried `X-Kshiai-Runtime: cloudflare-worker`.
- Cloud Run logged the production `/api/health`, authenticated `/api/me`, and
  authenticated SSE requests after the route activation time.
- A temporary Supabase user passed JWT mapping and SSE proxy validation through
  `https://kshiai.mk10.org`; cleanup completed afterward.
- R2 credential listing and a public object HEAD request succeeded.
- The old Tunnel recorded no requests after route activation.
- `kshiai-backend` and `kshiai-frontend` were stopped in PM2 and the PM2 dump
  was saved. Local ports 3088 and 5188 no longer listen.
- After PM2 stopped, a unique `/api/health` request returned 200 with the Worker
  marker and appeared in Cloud Run logs.
- Other PM2 applications were left unchanged. `cloudflared-kshiai.service`
  remains active so the local configuration is available for rollback.

## Rollback

Rollback reactivates the local applications before removing the Worker Route:

```bash
pm2 start ecosystem.config.cjs --only kshiai-backend,kshiai-frontend
pm2 save
curl -fsS http://127.0.0.1:3088/api/health
curl -fsSI http://127.0.0.1:5188/
```

After both local checks pass, delete Worker route
`da1f20df6f174e93be0fa945b41e9c38` using the Cloudflare dashboard or API. The
unchanged Tunnel route then resumes production traffic. Remove the `routes`
entry from `infra/cloudflare-worker/wrangler.jsonc` before the next Worker
deployment so the production route is not recreated.

Do not roll back PostgreSQL, Supabase Auth, or R2 during an edge/runtime
rollback. If only the backend revision is faulty, keep the Worker Route and
route Cloud Run traffic to a known-good revision instead.

