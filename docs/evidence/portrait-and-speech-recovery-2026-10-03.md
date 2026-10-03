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

## Deployment

Pending exact-source image build, preview checks and promotion. Private diagnostic artifacts are under `/tmp/kshiai-regression-inspect`; character inputs and raw provider details are not committed.
