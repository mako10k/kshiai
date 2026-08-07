# Production evidence — 0.7.2 causal narration (2026-08-07)

## Owner decision

The product currently has one user. The owner approved the accepted causal
narration mechanism enabled for the full cohort, so no cohort-splitting layer
was added before activation. Multiple-user cohort control remains a future
rollout concern, not a prerequisite for current user value.

## Deploy

| Item | Value |
| --- | --- |
| Tag | `v0.7.2` |
| Commit | `11d5beff1d358d931b34ac32ed220d1c2074fc2b` |
| Backend image | `asia-northeast1-docker.pkg.dev/kshiai/kshiai/backend@sha256:4ea40238183dbb0b7078abfd85f8ed0eb2c80f1258ff21911ec599dadf951fca` |
| Cloud Run | `kshiai-api-00029-gub` (100% traffic, tag `release-v0-7-2`) |
| Causal mode | `BATTLE_CAUSAL_NARRATION_MODE=narration_guarded` |
| Worker | `ea366035-e7b5-44f6-8ce4-109900f70f5a` (100% traffic) |
| Stage | https://github.com/mako10k/kshiai/actions/runs/31143398998 |
| Promote | https://github.com/mako10k/kshiai/actions/runs/31147799943 |
| Release | https://github.com/mako10k/kshiai/releases/tag/v0.7.2 |

## Readback

- The protected `production` environment was approved once for the unique
  promote run. Owner validation, tag and required-check revalidation, immutable
  backend and Worker verification, rollback-target capture, both promotions,
  production smoke, authenticated smoke, and release publication succeeded.
- Cloud Run readback showed `kshiai-api-00029-gub` Ready at 100% and the exact
  staged image digest with `narration_guarded`.
- The workflow verified Worker version `ea366035-e7b5-44f6-8ce4-109900f70f5a`
  and Wrangler reported it deployed at 100%.
- `GET https://kshiai.mk10.org/api/health` returned 200 with `ok:true`,
  PostgreSQL, and Supabase. Direct Cloud Run `/api/health` returned the expected
  fail-closed 404.
- No ERROR log entry was returned for the promoted Cloud Run revision from
  dispatch through the post-promote readback.
- The automatic rollback step was skipped because every promotion and smoke
  gate passed. The previous targets remain Cloud Run `kshiai-api-00027-bix` and
  Worker `2bd4e22c-3682-481a-b682-31a83f3a8bb2` (`v0.7.1`).

## Acceptance boundary

This proves the exact accepted artifact is live with the narration projection
enabled and that deployment-level health gates pass. It does not add mechanical
authority, claim that every causal narration is correct, or replace subsequent
user-play observation. Staging residuals remain observations rather than an
automatic patch queue.
