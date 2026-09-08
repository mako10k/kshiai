domain KshiaiRc8CompactFirstLiveRca:
  description "Correct the character-list failure and delayed real Compact validation without masking either defect."

problem P1:
  "What mechanisms created the production character disappearance symptom and allowed promotion before the intended Compact artifact was proven in Stage?"

premise PRODUCT:
  "The completion contract is a working Compact release with preserved character identity and behavior, not merely a successful deployment workflow."

premise PERSISTENCE:
  "Persisted immutable generations and authoring candidates remain readable according to their recorded schema version."

premise AUTHORING:
  "New action norms must select at least one structured action and selectorless prose must not silently become executable behavior."

premise PROJECTION:
  "Character-list review marks need attempt identity and status, not candidate content."

premise RELEASE:
  "Stage evidence applies only to the immutable backend and Worker identities that actually served the observed Compact battle."

evidence E1:
  "Production retained the character rows while GET /api/characters failed with a selectorless action-norm Zod error from candidate_json."

evidence E2:
  "Commit 9161b9cf added the selector refinement directly to CharacterActionNormV2Schema while retaining schemaVersion 2."

evidence E3:
  "parseAttempt parsed historical candidate_json with the current envelope schema, making previously valid data unreadable."

evidence E4:
  "The character list used the complete latest attempt only to derive reviewState from attemptId and status."

evidence E5:
  "ADR-0014 requires existing awaiting candidates to remain readable without regeneration and makes list marks projections of attempt state."

evidence E6:
  "Current authoring validation already compiles action norms and rejects a selectorless generated norm."

evidence E7:
  "Stage aliases were derived only from the release tag and could be retargeted by another Stage run for the same tag."

evidence E8:
  "The artifact promoted to production lacked a completed Compact battle observation on that exact Stage revision."

evidence E9:
  "Local regressions for historical reads, eligibility, list projection, backend revision identity, and release workflow contracts pass, and repository typecheck passes."

evidence E10:
  "All 625 workspace tests and production build pass; duplication check passes; isolated Lizard 1.23.0 stays within every checked-in complexity baseline."

evidence E11:
  "Production request logs on revision kshiai-api-00130-gon show GET /api/me and GET /api/notifications returning 200 while GET /api/characters and GET /api/character-drafts/latest return 400 with the same selectorless action-norm Zod failure."

evidence E12:
  "The Characters screen calls GET /api/characters, the Character Create screen calls GET /api/character-drafts/latest, and the Match screen includes GET /api/characters in its initial Promise.all load."

evidence E13:
  "The production deployment smoke checks the frontend, unauthenticated health, direct-origin fail-closed behavior, and an authenticated /api/me call, but it does not exercise the screen-facing read API surface."

evidence E14:
  "The authenticated smoke creates a temporary empty user, so adding only empty-account list calls would not exercise the retained historical candidate that triggers this compatibility defect."

pending U1:
  "The complete production count and status distribution of selectorless candidates and active generations remains unknown."

decision I1 based_on E1, E2, E3, PERSISTENCE:
  "The list defect was created by putting a new semantic activation invariant into the parser for already persisted V2 data."

decision I2 based_on E4, PROJECTION:
  "An unnecessary candidate-deserialization dependency amplified one incompatible candidate into a complete list outage."

decision I3 based_on E7, E8, RELEASE:
  "Compact evidence was delayed and misattributed because Stage identity was mutable and promotion did not require exact Compact battle evidence."

decision I4 based_on E11, E12:
  "The reported errors on multiple screens are proven for Characters, Character Create, and Match as propagation from the same retained-candidate parsing defect; other screens remain unproven rather than being assigned the same cause."

decision I5 based_on E13, E14:
  "The release escape was caused by a smoke contract that omitted both the screen-facing authenticated read surface and a retained-data compatibility fixture."

decision D1 based_on P1, I1, E5, E6, AUTHORING:
  "Keep the V2 persisted reader backward compatible and enforce selectors at authoring compilation and ready-generation activation or eligibility."

decision D2 based_on I2, PROJECTION:
  "Read latest list marks through a typed metadata-only query without candidate deserialization."

decision D3 based_on D1, PERSISTENCE:
  "Keep historical candidates readable, report current acceptance failure explicitly, and never silently activate or rewrite them."

decision D4 based_on I3, PRODUCT, RELEASE:
  "Use run-unique Stage identities and require a successful exact-revision Compact persisted-setting battle receipt before Promote."

decision D5 based_on D1, D2, D3, D4, E9, E10, U1:
  "Retain the production population count as unknown, verify locally, and perform no external write without separate authority."

decision D6 based_on I5, PRODUCT, PERSISTENCE:
  "Extend authenticated release smoke across side-effect-free screen reads and exercise them with a bounded retained-data compatibility fixture with explicit cleanup."
