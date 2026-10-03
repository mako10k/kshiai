# 0049: V3 character portrait revisions

- Status: Accepted
- Date: 2026-10-03
- Authority: Owner reports missing portrait generation and asks to continue the repair.
- Scope: Restore existing owner portrait generation for ready current V3 characters.
- Related: ADR0043, ADR0010, ADR0048; `docs/portrait-and-speech-recovery.pert`.

## Context and drivers

ADR0043 removed V2 portrait writers and explicitly allowed later bounded V3 implementations. All characters now use V3, but the image route and UI remain unavailable. The previous implementation cannot be exposed unchanged because it writes V2. Portrait history also reads only V2.

## Considered options

Expose the retired writer: rejected; violates V3 admission. Change only the mutable sheet: rejected; violates revision binding. Implement the existing portrait operation as a V3 derived revision: selected.

## Decision

Require an owned, ready, current V3 envelope before image-provider work. Generate from the frozen V3 appearance image brief, with the existing explicit owner adjustment, quota and idempotency controls. Save media under an immutable revision URL. Under a transaction, lock the character, reject current-generation drift and concurrent authoring, and append and activate a V3 envelope changing only portrait and media provenance. Preserve profile claim projection/receipt and other definition fields, and reread live operational fields. Existing battles remain bound to old generations and URLs.

History reads valid V3 generations for owner portrait selection; historical V2 profiles remain readable. Switching a portrait creates a new V3 revision carrying the selected old immutable media reference, without restoring other old settings. Full character restore/copy remain outside this bounded repair.

## Consequences and compatibility

The image API/UI return to service for current V3 owners. V2 update rejection remains. Image failure or stale source cannot move the pointer; the provider attempt retains its quota accounting. No existing character or battle is changed by deployment alone. Private personality/background are not included in the appearance image brief.

## Verification

Verify successful portrait revision and switch preserve all other settings, old content and live records; reject V2, stale source, non-owner and busy authoring; HTTP idempotent replay calls the image provider once; failed generation creates no revision. Build, typecheck, governed tests and direct behavioral tests precede deployment. Evidence belongs in `docs/evidence/portrait-and-speech-recovery-2026-10-03.md`.
