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
- [x] Release PR #57 versions every workspace and lockfile as `0.12.2`, adds
  dated changelog notes, passes the four required checks, and merges to `main`
  at `b4155d7b49c417efce2ed989bc4933d13b48e64c`.
- [x] Annotated `v0.12.2` resolves to that exact merged release commit, and
  `node scripts/verify-release.mjs v0.12.2` passes against the tag.
- [x] `Stage release` run 31177347444 creates and verifies backend revision
  `kshiai-api-00048-fiw`, image digest
  `sha256:56929b8afe14d6a987bdbe8a801c1625aa9edc11a09fd45a3626ebd7664c92d6`,
  and Worker version `7b272d2a-032f-4112-bc19-ae0b3599de82`.
- [x] `Promote release` run 31177770404 moves those exact successful Stage
  artifacts to 100 percent, passes production HTTP, authentication, and SSE
  smokes, and publishes the [GitHub Release](https://github.com/mako10k/kshiai/releases/tag/v0.12.2).

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

## Production readback

- Cloud Run reports `kshiai-api-00048-fiw` as the sole 100-percent production
  revision and its image digest matches the Stage and GitHub Release evidence.
- The public `/api/health` endpoint returns `ok: true` with the ordered
  `xai>openai>venice` provider topology and PostgreSQL/Supabase runtime.
- No severity `ERROR` entry was present for the new revision in the immediate
  15-minute post-promote Cloud Logging readback.
- The release deployment itself dispatched no production observation. The
  separately approved persistent E2E run 31178518891 subsequently bound tag
  `b4155d7` to active revision `kshiai-api-00048-fiw`, completed successfully,
  and retained battle `btl_0c19c361b6d8127610c1c5b3` plus execution receipt
  `kshiai-persistent-e2e-hpp4n`.

## Production observation result

- The battle finished on turn 16 with 17 turn records, 16 canonical
  transitions, and 17 pipeline traces. Fixture reuse, cross-account access,
  internal detail access, and general-realm isolation passed.
- Five environment proposals produced one accepted receipt, two
  `no_canonical_change` receipts, and two `decision_rejected` receipts. All four
  rejected proposals remained private, had no resolved event/effect key, and
  produced no proposal-derived canonical operation or direct HP effect.
- The accepted receipt carried its source event, resolved event, semantic/world
  revision change, and `/entities/stair_plate` effect key. Its semantic meaning
  was not sound: a plate described as landing on the wagon roof became an
  object held by Side B and was later accepted as a defend instrument. This is
  recorded as `OBS-20260807-09` and is the highest-value next pipeline boundary.
- Exact-window logs contain 78 successful xAI calls, no same-provider retry and
  no provider switch. Three invalid character-state results were terminal
  `reason=other` failures with provider fallback disabled. Timeout, 429, and 503
  handling therefore remain covered by regression tests but were not exercised
  by this observation.
