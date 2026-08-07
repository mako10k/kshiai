# Release 0.12.2 plan — LLM retry and provider-fallback normalization

Date: 2026-08-07
Feature PR: #56, squash SHA `29879a9063e431c4c40706d5ccac49349984755e`
Target: `v0.12.2`

## Scope

Release the operational correction selected by production run 31172362244:

1. replace the former 12-second abort with 20- or 30-second fast deadlines and
   60- or 90-second engine deadlines;
2. retry HTTP 429 at most twice and HTTP 503 once within the selected provider;
3. stop retrying a stream after any output has begun;
4. make timeout, exhausted 429 or 503 retry, parse, and other operation failures
   terminal instead of selecting another provider; and
5. retain the ordered one-hour cooldown and next-provider fallback only for DNS
   and billing or exhausted-credit failures.

## Release gates

- [x] Feature PR #56 passed `validate`, `security`, `backend-image`, and
  `worker` and squash-merged into `main` at `29879a9`.
- [x] Local changes passed all 338 tests, root/deployment typecheck, production
  build, focused routing tests, diff checks, and PERT analysis.
- [ ] Release PR versions every workspace and lockfile as `0.12.2`, adds dated
  changelog notes, passes the four required checks, and merges to `main`.
- [ ] Annotated `v0.12.2` resolves to the exact merged release commit, and
  `node scripts/verify-release.mjs v0.12.2` passes against the tag.
- [ ] `Stage release` creates and verifies one backend revision and Worker
  version from that tag.
- [ ] `Promote release` moves those exact successful Stage artifacts to 100
  percent, passes production smokes, and publishes the GitHub Release.

## Operational boundary

- This patch changes provider error handling and deadlines, not provider order,
  models, prompts, battle authority, or call count in the successful path.
- `LLM_PROVIDER_COOLDOWN_MS` is the preferred cooldown setting; the existing
  `LLM_QUOTA_COOLDOWN_MS` remains a compatible alias and the default stays one
  hour. No deployment environment change is required.
- The release adds no database schema, migration, secret, cohort switch, direct
  environment mechanic, narrator output guard, or adaptive adjudication path.
- Production `v0.12.0` backend revision `kshiai-api-00045-dez` and Worker
  `dbc162ce-3b30-47dc-9370-f12a787f5f98` remain rollback targets. The staged but
  unpromoted `v0.12.1` artifacts are not production rollback targets.
- Persistent cross-account E2E observation remains a separate authorized
  production operation after promotion; this deployment does not run it.
