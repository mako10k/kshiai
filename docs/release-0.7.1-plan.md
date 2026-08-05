# Release 0.7.1 plan — skill cooldowns and narrator softening

Date: 2026-08-06
Feature PR: #31, squash SHA `3eab5ea66d4c4e004f511fa74b0cbf84fcfe6c0d`
Target: `v0.7.1`

## Scope

Release the completed skill-cooldown and narrator-obligation slice:

1. power-based skill cooldowns of 1–9 turns after successful use only
   (no pre-battle cooldowns; empty `skillLastUsedTurn` at open);
2. feasibility and available-action filtering for skills on cooldown;
3. simultaneous-resolution merge of cooldown maps so clone paths keep state; and
4. softer narrator prompts that drop mandatory form evaluation on ordinary
   turns and apply progression hints only when the fight is stuck or late.

## Release gates

- [x] Feature PR #31 passed `validate`, `security`, `backend-image`, and `worker`.
- [x] Feature changes passed repository tests and typecheck locally before merge.
- [x] Feature squash-merged into `main`.
- [ ] Release PR versions every workspace and lockfile as `0.7.1`, adds dated
  changelog notes, and passes the four required checks.
- [ ] Annotated `v0.7.1` resolves to the exact merged release commit.
- [ ] `Stage release` succeeds and records immutable backend revision and Worker
  version evidence.
- [ ] The protected `production` environment is approved separately.
- [ ] `Promote release` promotes the exact staged artifacts, passes smoke, and
  publishes the GitHub Release.

## Operational boundary

- No SQL migration, backfill, authentication, callback, secret, provider-order,
  or infrastructure change.
- Optional combatant JSON (`skillLastUsedTurn`) remains readable by the prior
  revision; empty maps are the legacy default.
- Staging may build and deploy no-traffic artifacts. Production traffic changes
  only in the separately approved promotion workflow.
