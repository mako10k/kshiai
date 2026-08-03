# CI/CD operations

## Workflows

[`ci.yml`](../.github/workflows/ci.yml) runs on every pull request and push to
`main`. Its stable job names are the release policy's four required checks:

- `validate`: clean install, build, typecheck, tests, and generated-file diff
- `security`: npm advisory policy and repository secret scan
- `backend-image`: container build and fixed high/critical vulnerability scan
- `worker`: Worker tests, typecheck, frontend build, and Wrangler dry-run

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
   object when the bucket is non-empty.
2. After reviewing that run, `Promote release` takes the recorded Cloud Run
   revision and Worker version. The owner must dispatch from the same tag and
   type `DEPLOY <tag>`. It records the current rollback targets, promotes the
   exact staged artifacts, repeats production HTTP/auth/SSE smoke checks, and
   publishes the GitHub Release. A failed production smoke automatically
   restores the previous Cloud Run and Worker versions.

`Roll back production` is the explicit recovery path. Dispatch it from a
release tag with known-good revision/version IDs and type
`ROLLBACK <cloud-run-revision>`. The production concurrency group prevents it
from overlapping another promotion or rollback.

## GitHub Free limitation

This is a private repository on GitHub Free. GitHub's API rejects branch
protection, and private-repository environments, environment secrets, and
required reviewers are unavailable on this plan. The workflows therefore
protect the deployment path with all of these gates:

- only `mako10k`, the repository owner, may dispatch release workflows;
- staging and production promotion are separate manual workflow runs;
- both must run from the annotated release tag itself;
- the exact commit must have successful `validate`, `security`,
  `backend-image`, and `worker` check runs;
- Google Workload Identity Federation accepts only this repository's `v*`
  tag refs;
- production workflows are serialized and require a typed confirmation.

This cannot prevent the owner from directly pushing to `main`. If the account
is upgraded to GitHub Pro or the repository becomes public, immediately enable
branch protection with the four check names, disallow force pushes/deletion,
and put promotion in a protected `production` environment. Do not remove the
workflow's commit and artifact checks when doing so.

## Cloud identities and secrets

GitHub stores no Google service-account key. The release jobs request a
short-lived GitHub OIDC token, exchange it through the
`kshiai-github-actions` workload identity pool, and impersonate
`kshiai-github-deploy@kshiai.iam.gserviceaccount.com`. The provider condition
restricts tokens to `mako10k/kshiai` release tags. The deploy account can start
Cloud Build, read Artifact Registry metadata, administer Cloud Run, and act as
the existing Cloud Run runtime account; it cannot read application secrets.

The runtime account reads only the Secret Manager resources attached to the
service or smoke jobs. CI/CD adds these resources:

- `kshiai-direct-url` for forward-only migrations;
- `kshiai-supabase-secret-key` for disposable auth-smoke users;
- `kshiai-supabase-publishable-key` for auth-smoke sign-in.

GitHub has one repository secret, `CLOUDFLARE_API_TOKEN`, copied from the
dedicated limited Worker token in `secdat`. GitHub Free cannot scope it to a
private production environment, so only the tag-guarded release workflows
reference it. Never print or pass secret values as command-line variables.

The Worker keeps `workers.dev` disabled but explicitly enables version preview
URLs. Preview URLs are public and exist only to validate an undeployed version;
they do not add a Supabase browser redirect and must not be used as a permanent
application URL. `ORIGIN_SHARED_SECRET` remains a required encrypted Worker
binding and is inherited by uploaded versions.

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
