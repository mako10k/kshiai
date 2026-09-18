# vt102 WIP handoff — 2026-09-18

Goal: enable an actual Stage V3-versus-V3 battle with Neva and Rio. This file records local work only; it is not Stage readiness or owner play evidence.

## Current state

- Branch: `codex/v3-stage-trial-candidate` in this worktree. `vt102` started 2026-09-18 21:04:09 JST and was suspended at 21:53:00 JST in `docs/character-v3-stage-trial.pert`. It is **not complete**.
- ADR-0032 revision 1 was explicitly accepted by the owner. Its `.think`, Markdown projection, full Japanese review translation, and acceptance Seal are in this worktree.
- V4 battle creation now reads current V3 generations, binds immutable IDs/digests/snapshots and compiler inputs, rejects mixed V2/V3 creation, and uses V3 action-norm and conscious-agency paths. Shared V4 schemas and compiler are implemented. The independent review's V4 reflect-memory branch finding was corrected in `battle-service.ts`.
- The V3 integration test creates a battle, advances one turn, reloads, changes current generation pointers, and verifies the bound snapshots remain fixed. It also checks mixed-version rejection. This is partial coverage, not a complete-battle proof.
- Implementation Seal `implementation/vt102-v3-battle-binding` and test Seal `verification/vt102-v3-battle-binding` are clean, non-draft provenance records, with the latter transitively linked to the accepted ADR. A Seal identifies origin and exact file digests; it does not certify semantic completeness.

## Verification and remaining work

- `npm run typecheck`: passed after the reflect fix.
- Node 22 targeted `backend/src/services/v3-battle-creation.test.ts`: passed after the reflect fix.
- Full `npm test` (823 tests) and `npm run build` passed under Node 22 after the reflect fix. This verifies the current regression suite, but does not close the untested full-battle V4 paths.
- A later accidental Node 25 backend suite attempt failed on the prebuilt `better-sqlite3` Node 22 ABI and was interrupted. It is not evidence of a source regression.
- `git diff --check`: passed after the reflect fix.
- `npm run adr:check` still reports pre-existing historical ADR-0015–0017/0019 failures; ADR-0032 itself passes. Do not convert that historical global result into an ADR-0032 failure or acceptance.
- Independent review remaining concern: exercise V4 regular turn, reflect-memory handling, retry/reload, aftermath, and presentation/narration over a complete battle. Add proportionate regression evidence, then rerun Node 22 full tests/typecheck/build, refresh the affected Seals, and review the diff. Only then close `vt102` and move to `vt103` with `vt101` registration/selectability integrated.

No push, merge, release, Stage deployment, Stage character write, or owner play was performed. Realized Stage-player value remains zero; local binding reduces a prerequisite, subject to the remaining V4 consumer coverage and subsequent gates.
