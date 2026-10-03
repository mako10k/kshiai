# Speech continuity and fade removal, 2026-10-03

Scope: [owner-aligned plan](../speech-continuity-and-fade-recovery.pert), existing ADR0027/ADR0047 semantic ownership and immutable asset bindings. The owner explicitly requested complete removal of speech fade after initially requesting its correction.

## Findings and repair

Latest inspected finished match `btl_d5ac2372aceca61f7a8f53b8949ebddc`, created 2026-10-03T10:26:31.502Z, ends at turn10 under dynamic-v4. One ambient line repeats nine times for side A and another eight times for side B. Recorded provider outputs contain the repeated lines: this is not duplicate DOM rendering. History is already supplied correctly, with no character speech examples. Turn8 observations include new bodily consequences, while speech keeps reopening the same wave/slippery-ground conversation. These observations support a prompt-continuity weakness; they do not prove a deterministic cause for every repeated choice.

Server preparation now supplies the exact array indices of the latest self and counterpart utterances alongside the unmodified recent history. Indices come solely from recorded speaker roles, with null for absent roles. The phase-scoped prompt distinguishes actual preceding words from examples, directs the character to develop the exchange in light of current observations, and scopes aftermath to a closing reaction. Intentional repetition and silence remain legal. No text-pattern classification, duplicate rejection, fabricated speech, extra output fields, mandatory rationale, historical state changes or asset rebindings were added.

Frontend speech reveal state, stagger timers, visibility filtering, the fade class and both duplicate keyframe definitions are removed. Every arrived speech row renders in recorded narrative order immediately. Existing advance scheduling and manual-scroll behavior remain independently managed. Story rendering is split into small components; the static complexity baseline is unchanged.

## Verification and limits

`npm run build`, `npm run typecheck`, `npm run static` and `git diff --check` pass. Governed `npm test`: 215 passing tests (167 + 19 + 29), active40/provisional2/disabled154. Disabled tests are not counted as passing. The directly executed dynamic-provider suite has 12 passing tests, including exact latest-role anchors with repeated words retained, empty history, phase-scoped closing instructions and independent acceptance of speech/null. Direct Chromium battle-screen tests: 3 passing, including initial and SSE-delivered paired speech at opacity1 with animationName none and zero active animations, plus existing layout and scrolling checks. API responses are fixtures, not a production match.

Two bounded real-model decisions reused the latest match's frozen turn8 inputs without mutation. Both completed with one logical generation call and zero structural errors. Side A chose null; side B replied to the counterpart's slippery-ground observation with a concrete suggestion. Neither returned the previously repeated exact line. This is a two-decision continuity probe, not a full-match quality acceptance or full action-feasibility proof. No additional live match was created.

Private inputs and probe artifacts: `/tmp/kshiai-repeat-fade-inspect`. They are not committed. Deployment completion will be recorded after exact-source CI, origin/Worker preview checks and public readback.
