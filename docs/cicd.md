# CI/CD operations

## Workflows

[`ci.yml`](../.github/workflows/ci.yml) runs on every pull request and push to
`main`. Its stable job names are the release policy's four required checks:

- `validate`: clean install, build, typecheck, jscpd/lizard static analysis,
  tests, and generated-file diff
- `security`: npm advisory policy and repository secret scan
- `backend-image`: container build and fixed high/critical vulnerability scan
- `worker`: Worker tests, typecheck, frontend build, and Wrangler dry-run

For the same checks locally, install the pinned Python analyzer in an isolated
environment before running lint:

```bash
python3 -m venv .venv-static
. .venv-static/bin/activate
python3 -m pip install --requirement requirements-static.txt
npm run lint
```

`jscpd` rejects a repository-wide duplicated-line percentage above `2.11%`
for production TypeScript/JavaScript. Lizard applies conventional warning
thresholds of cyclomatic complexity `15`, function length `100`, and parameter
count `6`; [`lizard-baseline.json`](../config/lizard-baseline.json) also prevents
the count, maximum, or total excess of each metric from increasing. Tests are
excluded from both measurements. Any intentional baseline replacement must be
reviewed as static-analysis policy and is generated with
`npm run static:lizard -- --write-baseline`.

Npm advisory exceptions live in
[`config/npm-audit-exceptions.json`](../config/npm-audit-exceptions.json). Each
exception is exact, justified, and expiry-dated. An expired, resolved, or new
advisory fails `security` instead of silently widening the exception.

Release deployment is deliberately split into two owner actions:

1. `Stage release` validates an annotated SemVer tag and the four checks on its
   exact commit. It builds one backend image, records its digest, creates a
   tagged no-traffic Cloud Run revision, applies migrations, uploads one
   undeployed Worker version, and tests the public preview URL. A temporary
   confirmed email user verifies Supabase JWT mapping and SSE, then is deleted.
   A read-only R2 smoke verifies credentials, bucket listing, and one public
   object when the bucket is non-empty. Its typed causal-narration input defaults
   to `narration_guarded`; an explicit staging comparison may select `off`, and
   the selected mode is recorded in the workflow evidence.
2. After reviewing that run, `Promote release` takes the recorded Cloud Run
   revision and Worker version. The owner must dispatch from the same tag and
   type `DEPLOY <tag>`. It records the current rollback targets, promotes the
   exact staged artifacts, requires the staged Cloud Run revision to have
   `BATTLE_CAUSAL_NARRATION_MODE=narration_guarded`, repeats production
   HTTP/auth/SSE smoke checks, and publishes the GitHub Release. A failed
   production smoke automatically restores the previous Cloud Run and Worker
   versions. This full-cohort default applies while the product has one user;
   introduce an explicit cohort policy before relaxing it for multiple users.
3. `Observe persistent E2E battle` runs only after promotion, from the active
   release tag and against an explicitly confirmed 100% Cloud Run revision. It
   reuses two non-human accounts and fixed test-realm assets, creates and
   completes a new cross-account battle through the production API and SSE,
   and retains a sanitized observation artifact for 90 days. The accounts,
   characters, battlefield, narration style, battle, and accumulated test
   ratings are not deleted. See
   [`persistent-e2e-observation.md`](persistent-e2e-observation.md).

`Roll back production` is the explicit recovery path. Dispatch it from a
release tag with known-good revision/version IDs and type
`ROLLBACK <cloud-run-revision>`. The production concurrency group prevents it
from overlapping another promotion or rollback.

## GitHub protection

This is a public repository with branch protection enabled on `main`. Every
change must arrive through a pull request with an up-to-date branch and pass
the stable `validate`, `security`, `backend-image`, and `worker` checks. The
rule applies to administrators, requires linear history and resolved review
conversations, and disallows force pushes and branch deletion. A second-person
approval is not required while the repository has one maintainer.
Only squash merges are enabled, merged branches are deleted automatically, and
GitHub secret scanning, push protection, Dependabot alerts, and automated
security updates are enabled for the public repository.

The workflows retain defense-in-depth gates in addition to branch protection:

- only `mako10k`, the repository owner, may dispatch release workflows;
- staging and production promotion are separate manual workflow runs;
- both must run from the annotated release tag itself;
- the exact commit must have successful `validate`, `security`,
  `backend-image`, and `worker` check runs;
- Google Workload Identity Federation accepts only this repository's `v*`
  tag refs;
- production workflows are serialized and require a typed confirmation;
- `staging` and `production` accept deployments only from `v*` tags;
- `production` requires approval by the repository owner before a job starts.

The persistent observation workflow uses the same `production` concurrency,
tag, owner, exact-check, protected-environment, and OIDC gates as promotion. It
also refuses to run unless the revision is the single 100% target, causal
narration is guarded, its image is digest-bound, and `mako10k@mk10.org` is in
the server administrator allowlist.

The environment approval is an additional explicit action; the typed workflow
confirmation and exact-commit/artifact checks remain mandatory.

## Cloud identities and secrets

GitHub stores no Google service-account key. The release jobs request a
short-lived GitHub OIDC token, exchange it through the
`kshiai-github-actions` workload identity pool, and impersonate
`kshiai-github-deploy@kshiai.iam.gserviceaccount.com`. The provider condition
restricts tokens to `mako10k/kshiai` release tags. The deploy account can start
Cloud Build, read Artifact Registry metadata, administer Cloud Run, and act as
the existing Cloud Run runtime account; it cannot read application secrets.
Its access to Cloud Build source is limited to the dedicated
`gs://kshiai_cloudbuild` bucket through `roles/storage.legacyBucketWriter`; it
has no project-wide storage writer role. The staging workflow passes
`--gcs-source-staging-dir=gs://kshiai_cloudbuild/source` explicitly so the CLI
does not require project-wide bucket listing for implicit bucket discovery.
The deploy identity has `roles/iam.serviceAccountUser` only on the default
Cloud Build execution account and the existing Cloud Run runtime account; it
does not have project-wide service-account impersonation.
The workflow submits Cloud Build asynchronously and polls `gcloud builds
describe` for terminal status. It does not stream logs or require project-wide
Viewer access to the default Cloud Build logs bucket.

The runtime account reads only the Secret Manager resources attached to the
service or smoke jobs. CI/CD adds these resources:

- `kshiai-direct-url` for forward-only migrations;
- `kshiai-supabase-secret-key` for disposable auth-smoke users;
- `kshiai-supabase-publishable-key` for auth-smoke sign-in.

The `staging` and `production` environments each hold `CLOUDFLARE_API_TOKEN`,
copied from the dedicated limited Worker token in `secdat`. Staging also holds
`SUPABASE_PUBLISHABLE_KEY` so Vite can embed the public browser credential in
the immutable frontend build. There are no repository-wide copies. Only jobs
attached to the matching tag-restricted environment can read them. Never print
or pass secret values as command-line variables.

The Worker keeps `workers.dev` disabled but explicitly enables version preview
URLs. Preview URLs are public and exist only to validate an undeployed version;
they do not add a Supabase browser redirect and must not be used as a permanent
application URL. `ORIGIN_SHARED_SECRET` remains a required encrypted Worker
binding and is inherited by uploaded versions.
Before uploading a version, staging resolves the single Cloudflare account
authorized by its dedicated token and idempotently applies the Worker subdomain
setting `{ enabled: false, previews_enabled: true }`. It verifies the returned
state before proceeding, so preview smoke tests cannot silently target a
disabled URL and the production `workers.dev` endpoint remains disabled.
Smoke tests use the immutable version preview URL recorded by Wrangler, not the
optional human-readable preview alias.
The staging workflow builds `@kshiai/shared` before the frontend so workspace
type exports exist when the immutable Worker version is compiled. It passes the
production Supabase URL and publishable key into Vite, then scans the built
JavaScript for both exact values and fails before upload if either is absent.

CI has been exercised on GitHub-hosted Linux runners, including the container
and Worker scans. The tag-restricted OIDC exchange and cloud promotion are not
invoked until the first versioned release; the first `Stage release` run is the
live acceptance of that identity and deployment path and must not be promoted
if any configured identity, IAM, secret, or smoke check fails.

## Preparing a release

Update all four package versions and the matching `package-lock.json` entries,
move `CHANGELOG.md` entries into `## [X.Y.Z] - YYYY-MM-DD`, and merge the
release PR after CI succeeds. Then create and push an annotated tag:

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

In GitHub Actions, choose the tag itself in **Use workflow from**, run
**Stage release**, and retain the IDs printed in its summary. If all staging
evidence is acceptable, choose the same tag for **Promote release**, enter the
two IDs, and type the requested confirmation. Google login remains a browser
acceptance check for releases that change authentication or callback settings;
the automated smoke covers verified email, JWT mapping, `/api/me`, and SSE.
