# Portrait and speech recovery, 2026-10-03

The owner reported missing portrait generation and no speech in the latest match, then requested continuation. Canonical scope: [recovery plan](../portrait-and-speech-recovery.pert); [ADR0049](../adr/0049-v3-character-portrait-revisions.md), ADR0043, ADR0047 and immutable asset requirements.

## Findings

Commit `458af76` retired the portrait button, quota fetch, generate/switch endpoints and repository writers because they wrote V2. Converting all character data to V3 did not supply a V3 image operation. Portrait history also admitted only V2. The repair implements a typed V3 derived revision rather than re-exposing that writer.

Latest match `btl_205c3393f8a8b97d2259349e4e0d0d20`, created 2026-10-03T07:28:22.925Z, is a finished 17-turn dynamic-v4 match with dialogue enabled. All 36 expression outputs contain explicit null, and there are zero speech events. This is upstream model silence, not UI event filtering, missing output keys, or invalid speech rejection. Previous matches have 27 and 21 speech events respectively. This latest match binds existing valid V3 generations of Makoto and Stage Neva, both excluded from the 48-character manual migration; those immutable bindings were not rewritten.

The dynamic prompt reduced the character expression instructions to a short permission for Japanese speech or null. That removed the explicit character speech-action direction while keeping the speech-style projection in the input. This is a plausible contributing prompt regression; the logs do not prove a deterministic root cause for every silent choice. The repair restores phase-scoped direction to use speech style, known relationship, observations and prior exchange, choose speech with action, and use silence when it fits the character/moment. It does not require a speech quota, classify text by patterns, fabricate lines, reject legal null, add mandatory explanation fields or alter historical matches. Exact grounding-ref guidance is also restored.

## Verification

Build, typecheck, static duplication/complexity and ADR0049 audit pass. Governed `npm test`: 215 passing tests (167 + 19 + 29), active40/provisional2/disabled154. The disabled historical tests are not counted as passing. Direct scoped behavioral suite: 39 passing tests across V3 portrait lifecycle, dynamic provider boundary, V2 write rejection/historical display, and focused authoring.

The portrait HTTP test uses a stub image provider, verifies exact appearance-only input and revisioned URL, appends V3, preserves old content and all unrelated definition/profile/disclosure fields, carries live record updates occurring during provider work, rejects request-key conflicts and stale/non-owner/busy writes, and proves replay calls the provider once. Failure preserves the current generation; portrait switching changes only the media reference. A reused key after its request receipt expires cannot overwrite a prior revision URL because the media revision identity also includes the source generation.

Four bounded real-model decisions reused the frozen latest-match inputs without modifying the match: two prologue inputs and two turn-one inputs. Makoto produced speech in both; Neva explicitly chose null in both. Final turn-one outputs have no structural errors. The first Neva prologue probe had an unknown intent ref, which motivated restoring exact grounding-ref instructions. These probes establish that actual speech can be generated through the changed adapter; they do not establish balanced speech frequency or completed full-match quality. No real portrait provider call was performed.

A local Chromium run with fixture API responses verified owner V3 generation button and its POST handler, and absence of the control for non-owners, historical battle views and V2. Screenshot: `/tmp/kshiai-regression-inspect/portrait-owner-ui.png`. This is local UI verification, not production authentication/provider acceptance.

Initial CI run 37109626154 rejected the final deletion guard on the existing complexity count threshold. The owned/live portrait predicate was extracted without changing admission behavior; the static check and scoped portrait tests then passed again. No baseline threshold was relaxed and that rejected artifact was not promoted.

## Deployment

Completed from source commit `5726fc47dda1205215ae23b24f8e601f8d83aa03`. [CI 37109912296](https://github.com/mako10k/kshiai/actions/runs/37109912296) passed all four jobs. Cloud Build `6907768b-9b3f-418a-a445-4d64cd6acf87` succeeded; digest `sha256:56ed78d770ecd508a73e1d005f3183ddcef769d0afd9958fa09609ff3015c585` is deployed as `kshiai-api-recovery-5726fc4` at 100% traffic. Container runtime configuration excluding image was compared equal before promotion. Tagged origin and Worker-version preview health both passed.

Worker version `8bfd14fe-4bc1-4c81-a139-9387d123ea12`, deployment `fb269345-7091-4d2d-8787-e85a6879ed13`, is at 100%. Its backend origin is the new tagged revision and the required secret binding is present. Public deployment smoke passed after convergence, including the expected backend revision and untrusted direct-origin rejection. All nine public frontend files match local SHA-256 artifacts. A bounded 15-minute ERROR log read returned zero entries. The previously inspected battle's saved state digest is unchanged. These deployment checks do not imply a completed new match or paid portrait-provider acceptance.

See the [sanitized deployment and probe receipt](portrait-and-speech-recovery-2026-10-03.json). Private diagnostic artifacts are under `/tmp/kshiai-regression-inspect`; character inputs and raw provider details are not committed. The temporary frontend verification server was stopped. Previous compatible runtime/Worker remain `kshiai-api-profile-c341bfd` / `40f39b55-0661-4114-88bc-97faa4baeb13`; no rollback was performed.
