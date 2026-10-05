# Dynamic conscious output deployment

Owner authorized deployment on 2026-10-03 after implementation of Accepted ADR0047.

## Deployed source and artifacts

- Source: `702f9acc7d9624725eca0df4dc628ecc190fe1bd`, pushed and read back from `codex/cc304-focused-revise`.
- [CI run 37102539710](https://github.com/mako10k/kshiai/actions/runs/37102539710): validate, backend-image, worker and security all passed.
- Cloud Build `1627fcb5-91df-44e2-8337-e58c4e891aa9`: SUCCESS, built from an exact Git archive; no local environment, database or dependency files uploaded.
- Image digest: `sha256:4d6d96cbeadac624d11605547bfa6c30c61b1982324b1feda47ba91c2f32951c`.
- Cloud Run: `kshiai-api-dynamic-702f9ac`, 100% traffic.
- Worker: `846622a8-af95-4d33-909f-5e238e9a36dd`, 100%; deployment `396161c9-7e9b-4648-9a68-9ee875ac1365`.

## Acceptance

Tagged backend health passed before promotion. Container runtime settings were compared with the previous service snapshot and preserved. Worker bindings apart from the intended backend origin change, and Worker runtime configuration, were compared and preserved.

After promotion, the deployment smoke passed against https://kshiai.mk10.org: public page and API health succeeded, the response identified the Cloudflare Worker, health reported the expected new backend revision, and an untrusted direct-origin health request returned 404. All nine deployed frontend files matched the source-build SHA256 hashes. The bounded revision error-log query returned zero entries (severity ERROR or above, freshness 15 minutes, limit 20).

Detailed sanitized results: [deployment receipt](conscious-dynamic-output-deployment-2026-10-03.json). Prior local test and architecture evidence: [implementation](conscious-dynamic-output-implementation-2026-10-03.md).

## Scope and rollback

New battles bind the dynamic contract; existing battles retain their recorded contract. No database schema or data migration was required. No main merge or formal release tag was performed. No paid LLM call or authenticated production match advancement was performed, so these checks establish deployment and transport health, not match quality or live provider output acceptance.

Rollback targets remain `kshiai-api-contract-98f4c4f` and Worker version `46c49e30-a740-40b9-ac4e-c46ab15d8ede`. Rollback would restore both Cloud Run traffic and the Worker version, since the Worker binds a tagged backend URL.

The evidence commit follows deployment; runtime artifacts above were built from the implementation source SHA, not the later documentation-only commit.
