# Release process

This document is the source of truth for versioning and releasing kshiai. The
rules apply to application code, database migrations, the Cloud Run backend,
and the Cloudflare Worker frontend/proxy as one product.

The repository currently has no historical release tags and all npm workspaces
are at `0.1.0`. This policy therefore starts with the first release created
after its adoption; it does not invent releases for older commits. The policy
is effective immediately. Automated enforcement and protected deployment
environments are delivered by `T_CICD`; until then, releases are manual and
must record the same evidence described here.

## Versioning and tags

- Use Semantic Versioning with tags named `vMAJOR.MINOR.PATCH`.
- The root `package.json` version is authoritative. The backend, frontend, and
  shared workspace versions must match it in a release commit.
- While the product is below `1.0.0`, a minor bump may contain an intentionally
  incompatible API or data-contract change, and its release notes must call
  that out. Patch releases remain backward compatible.
- Use a patch bump for compatible fixes, security fixes, and operational
  changes; a minor bump for features or intentionally incompatible pre-1.0
  changes; and a major bump for incompatible changes after `1.0.0`.
- Release candidates use `vMAJOR.MINOR.PATCH-rc.N`. A stable version must be
  promoted from a tested release commit, not rebuilt from a different commit.
- Create an annotated tag from the release commit. Published tags are
  immutable: correcting a release requires a new version, never moving or
  deleting the old tag.
- `CHANGELOG.md` and the GitHub Release describe user-visible behavior,
  security implications, database changes, and deployment or rollback notes.
  Move relevant entries from `Unreleased` into the versioned section as part
  of the release PR.

## Branches, pull requests, and ownership

`main` is the only releasable branch. Use short-lived branches named `feat/*`,
`fix/*`, `ops/*`, or `release/*`; use `hotfix/*` for an emergency production
fix. Every change after CI/CD enforcement is enabled goes through a pull
request and is squash-merged so that each merged PR is one auditable change.

The repository owner is the release owner. A second-person approval is not
required while this is a single-maintainer private repository, but all required
checks are mandatory. Production deployment requires an explicit owner
approval separate from merging the release PR. If another maintainer is added,
changes to authentication, billing, data migration, secrets, or deployment
must also receive approval from a code owner for that area.

Until branch protection is enabled by `T_CICD`, the release owner must verify
the checks locally and preserve their output in the release record. Once
enabled, direct pushes to `main`, force pushes, branch deletion, and bypassing
required checks are prohibited.

## Required checks

`T_CICD` must expose these stable required-check names so branch protection can
refer to them without depending on matrix job suffixes:

| Check | Required evidence |
| --- | --- |
| `validate` | Clean install, build, typecheck, tests, and a generated-file/working-tree check |
| `security` | Dependency audit and secret scan, with any accepted exception linked and expiry-dated |
| `backend-image` | Backend container build, vulnerability scan, and immutable image digest |
| `worker` | Frontend build, Worker tests, typecheck, and Wrangler dry-run |

No release may proceed on a failure, a cancelled run, or a timeout. A retry is
new evidence and does not convert the earlier run into a pass. Workflow files,
deployment configuration, migrations, and dependency lockfiles require the
same checks as application code.

## Build once and promote

The release commit is the sole source for both runtime artifacts:

- Build the backend container once. Record its source commit and registry
  digest, and deploy that digest to staging and production. Do not promote a
  mutable image tag or rebuild between environments.
- Build and upload a Cloudflare Worker version from the same commit. Record the
  Worker version ID. Promote that exact version and route configuration after
  staging acceptance.
- Record the GitHub Actions run, release commit, tag, backend digest, Cloud Run
  revision, Worker version ID, and migration identifiers in the GitHub Release.
- Never download or copy production secrets into an artifact. Cloud Run reads
  secrets from Secret Manager and the Worker uses a Worker secret binding.

Google Cloud deployment must use GitHub OIDC/Workload Identity Federation with
a narrowly scoped service account instead of a stored service-account key.
Cloudflare credentials must be restricted to the required account, Worker,
route, and R2 operations, stored in the protected production environment, and
rotated immediately after suspected exposure or operator removal. Routine
rotation is at least annual. The release record contains rotation evidence,
never a secret value.

## Database changes

PostgreSQL migrations are forward-only and committed with the code that uses
them. Each migration must be deterministic, transactional where PostgreSQL
allows it, and safe to run once by the deployment workflow. Never edit a
migration that has reached production.

Prefer expand/migrate/contract changes:

1. Add structures in a form compatible with the currently deployed backend.
2. Deploy compatible code and complete any bounded backfill.
3. Remove old structures only in a later release after rollback no longer
   depends on them.

An irreversible or long-running migration requires a reviewed backup/restore
procedure and an explicit production approval. Application rollback does not
roll the database back. The last known-good application revision must remain
compatible with the migrated schema, or the release is not eligible for
production.

## Release flow

1. Prepare a `release/*` PR that updates every package version and moves the
   relevant changelog entries into a dated version section.
2. Pass `validate`, `security`, `backend-image`, and `worker` on the exact
   release commit.
3. Create the annotated release-candidate or stable tag from that commit.
4. Publish immutable artifacts and deploy them to staging without production
   traffic.
5. Apply pending migrations, then verify health, PostgreSQL, Supabase email and
   Google authentication, migrated ownership, R2 media, and an SSE battle
   stream. Verify that direct Cloud Run requests remain protected.
6. Record the rollback targets and obtain explicit production approval.
7. Promote the same backend digest and Worker version to production. Do not
   allow concurrent production deployments.
8. Repeat the production smoke checks and inspect Cloud Run and Worker errors.
   Publish the GitHub Release only after acceptance. A failed deployment keeps
   the tag but is marked failed; the correction gets a new version.

## Rollback

Before production promotion, record the current known-good Cloud Run revision,
Worker version and route, and the migration state. Follow
[`cloud_cutover.md`](cloud_cutover.md) for the current runtime rollback details.

- For a backend-only fault, keep the Worker route and move Cloud Run traffic to
  the recorded known-good revision.
- For an edge fault, restore the recorded Worker version. Use the retained
  Tunnel/local-runtime procedure only when both cloud edge and backend paths
  cannot safely serve traffic.
- Do not roll back PostgreSQL, Supabase Auth, or R2 as part of an application
  rollback. Stop writes first and use the reviewed restore procedure only for
  confirmed data corruption.
- After rollback, repeat health and authenticated smoke checks and record the
  incident, operator, timestamps, failed version, restored versions, and user
  impact.

## Emergency releases

An emergency release is limited to an active security issue, data-loss risk, or
material production outage. Branch from the current production commit using
`hotfix/*`, make the smallest safe change, and issue a new patch version.

`validate`, `security`, artifact provenance, production approval, and post-
deployment smoke checks are never skipped. Staging time may be shortened only
when the owner records why delay is riskier than expedited promotion and the
rollback target is already verified. Add complete changelog and incident notes
and perform a follow-up review by the next business day.
