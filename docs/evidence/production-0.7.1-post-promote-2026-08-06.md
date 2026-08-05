# Production evidence — 0.7.1 post-promote (2026-08-06)

## Deploy

| Item | Value |
| --- | --- |
| Tag | `v0.7.1` |
| Commit | `8def778c38c7a02fb75a251e7584c3a8d3e029ab` |
| Cloud Run | `kshiai-api-00027-bix` (100% traffic, tag `release-v0-7-1`) |
| Worker | `2bd4e22c-3682-481a-b682-31a83f3a8bb2` |
| Promote | https://github.com/mako10k/kshiai/actions/runs/31019683431 |
| Health | `GET /api/health` → 200 `ok:true` |

## Cooldown write path (live battle)

Battle `btl_180f05351fb2e2fba3f38a8c` was mid-fight on `v0.7.0` (turn ~15 at
13:52 UTC) and continued advancing after promote. By turn 18:

- `sideA.skillLastUsedTurn`: two skill IDs recorded (turns 16 and 17)
- `sideB.skillLastUsedTurn`: one skill ID recorded (turn 17)

So the new combatant field is populated on real production traffic without a
migration.

## Pre-0.7.1 skill spam baseline (same window)

Finished / long battles **before** promote show long same-skill streaks in
`turnRecords` (executed skills only):

| Battle | A consecutive same-skill max | B consecutive same-skill max |
| --- | ---: | ---: |
| `btl_2709…` | 9 | 9 |
| `btl_b8dc…` | 3 | 10 |
| `btl_febd…` | 2 (but high total alternating) | 2 |

Example (`btl_2709…` side B): nearly every turn the same skill ID.

## Post-promote behavior on the continued battle

After promote, side A used **two different** skills on turns 16 → 17 → 18
(`sk_fabd…`, `sk_8b439…`, `sk_fabd…`). That matches power-based per-skill CD
(alternation still allowed; same-skill every-turn spam is not).

Same-skill consecutive max on that battle remains 3/6 only because early turns
ran under `v0.7.0` with no CD.

## Narrator soft form-evaluation

Regex proxy for form-ish phrases (`形勢|優勢|劣勢|優位|互角|押し気味|流れは|主導権`)
on public `log[].narrator`:

- Pre-promote finished 20-turn battles: often **10–16 / 22** turns form-ish.
- Continued battle turns 16–18 after soft-prompt deploy: ambient action /
  lighting / posture more than explicit scoreboard sentences (still some
  “主導権” earlier in the match).

Soft prompts do not hard-block form language; they only remove the obligation.

## Residual monotony (next candidates)

1. **Two-skill rotation** still yields a skill every turn when each skill’s CD
   is short or there are multiple skills.
2. **Public fluff**: lighting / posture / breathing loops with little leverage
   change (see turns 16–18 on `btl_180f…`).
3. **Free-action / wait** soft beats still fill turns when skills are gated.

No production error attributed to CD write/merge in this window.
