# Changelog

All notable changes to this project are documented in this file. The format is
based on Keep a Changelog, and releases follow Semantic Versioning.

## [Unreleased]

## [0.5.0] - 2026-08-04

### Added

- Adds observer-relative battle perception frames with qualitative absolute and
  target-relative effect bands plus self reserve cues, without exposing raw
  combat totals or thresholds.
- Adds multi-modal sensory evidence, anonymous observer-local contacts, and
  perspective-specific narration views with deterministic identifier redaction.
- Gives each character agent only its frozen self-labelled perception frame,
  validated next actions, and counterpart name/condition only when the frame
  supports that knowledge.
- Shows matchup-scoped win rate and predicted win rate on opponent selection,
  and improves battle log auto-scroll hold when the player scrolls manually.

### Changed

- Normal-turn narration is driven by a derived perception view instead of the
  full canonical event and world payload for character-limited perspectives.
- Character agents no longer receive unconditional foe names, shared semantic
  observations, or canonical cognition as action authority.
- Centers settled rating display independently for public and overall tracks.

### Operations

- No database migration. Existing battle JSON gains optional perception frame
  and private registry fields; older application revisions ignore them.
- Active legacy battles without perception data seed empty registries and mark
  the setup counterpart as identified so ongoing matches do not lose known names.
- Provider or projection failure keeps engine-authored cues and previous contact
  continuity; invalid sensory evidence is discarded without fabricating facts.
- Prologue and aftermath narrator contracts are unchanged in this release.

## [0.4.0] - 2026-08-04

### Added

- Fixes one finishing technique per character at battle start, preferring an
  explicit special skill and otherwise reusing the strongest existing attack or
  magic skill without inventing a new ability.
- Gives each isolated character agent a bounded next-turn decision containing
  available actions, qualitative conditions, remaining turns, unlock timing,
  current and maximum finisher multiplier, critical opportunity, and the single
  remaining use.
- Stores one validated next-turn action reservation per side and falls back to
  selected battle policies when a reservation is unavailable or invalid.

### Changed

- Finishers can be activated once per battle by a character reservation or an
  explicit player action. Static policy fallback never spends them automatically.
- Keeps the general post-turn-ten critical-pressure curve separate from the
  one-use finisher multiplier: normal at turn 10 and maximal at turn 20.
- Advances both private character agents for every narration perspective so an
  external narrator no longer suppresses inner continuity or action planning.

### Operations

- No database migration, environment, authentication, billing, or public DTO
  change is required. Existing battle JSON derives missing finisher state
  deterministically when its next turn resolves.
- External-perspective battles now make the same two parallel fast-model
  character-agent requests as internal perspectives. The next-action decision is
  included in those existing agent updates and does not add a separate request.
- Application rollback remains compatible with the optional battle-state fields;
  the prior revision ignores them.

## [0.3.0] - 2026-08-04

### Added

- Adds automatic opponent matching based on public rating and internal combat
  profile, with deterministic tie-breaking.
- Adds server-backed character drafts with preview, conversational adjustment,
  confirmation, discard, and draft restoration before a character is saved.
- Adds narration-style editing to the existing style management screen.
- Adds bounded drama state, action-focused narration beats, durable semantic
  environment changes, and recent-prose repetition controls without retaining
  full battle history.
- Unlocks finishing attacks after turn 10 and gradually raises critical and
  finishing pressure to its maximum at turn 20.

### Changed

- Character generation now returns a draft instead of immediately persisting a
  playable character; clients must explicitly confirm the draft.
- Balance-summary access now fails closed unless the authenticated user is
  listed in `ADMIN_USER_IDS` or `ADMIN_EMAILS`.

### Operations

- Applies forward-only migration `0006_character_drafts.sql`, which only adds
  the draft table and remains compatible with the previous application revision.
- Configure an administrator allowlist only when balance-summary access is
  required. No billing or provider-secret changes are included.
- Application rollback may leave the added draft table in place; the previous
  revision ignores it. Drafts created through this release are not playable
  characters until confirmed.

## [0.2.0] - 2026-08-04

### Added

- Adds bounded, structured battle-world state for persistent scene facts,
  characters, objects, terrain, effects, locations, visibility, and lifecycle.
- Adds side A, side B, and public current observations with only the exact latest
  diff, allowing each character agent to update its private inner state from
  what that character can observe.
- Adds atomic JSON Pointer-style semantic patches with revision, turn, causal
  event, tombstone, attachment, size, depth, and protected-mechanics validation.
- Adds an operator CLI for inspecting, diffing, and revision-guarded patching of
  the current battle state, plus a public battle-state panel.

### Changed

- Resolves deterministic mechanics first, reconciles their durable observable
  consequences second, advances both isolated character agents third, and lets
  narration render only the committed public observation last.
- Seeds structured state for new battlefields and deterministically adapts
  legacy battles without adding a database migration or retaining full state
  history.

### Operations

- No database, authentication, billing, provider-secret, or callback changes are
  required. Existing JSON battle records remain readable, and older application
  revisions ignore the new optional fields if an application rollback is needed.

## [0.1.10] - 2026-08-04

### Fixed

- Restores Google OAuth and browser email authentication by supplying the
  production Supabase URL and publishable key to the immutable Vite build.
- Fails staging before Worker upload when the built frontend does not contain
  both required Supabase values.
- Updates Hono and overrides the transitive Undici version to releases that
  address newly published request-processing and cache-disclosure advisories.

### Operations

- `v0.1.9` fixed authenticated battle SSE and remains the active release, but
  its GitHub-hosted frontend build did not receive the ignored local `.env`.
  Browser Supabase authentication was therefore unavailable. This release is a
  forward fix so the battle SSE repair is retained.

## [0.1.9] - 2026-08-04

### Fixed

- Carries forward the authenticated battle SSE fix and uses Cloudflare's
  immutable version preview URL for staging smoke tests instead of the preview
  alias.

### Operations

- `v0.1.8` successfully enabled version previews and uploaded working backend
  and Worker artifacts, then failed closed because only the optional preview
  alias returned HTTP 404. The immutable version URL returned HTTP 200. No
  artifact was promoted; the tag was retained and superseded by `v0.1.9`.

## [0.1.8] - 2026-08-04

### Fixed

- Carries forward the authenticated battle SSE fix and explicitly enables
  Cloudflare version preview URLs while keeping the production `workers.dev`
  endpoint disabled.

### Operations

- `v0.1.7` completed the backend build, no-traffic revision, migrations, and
  immutable Worker upload, then failed closed when the disabled preview URL
  returned HTTP 404. No artifact was promoted; the tag was retained and
  superseded by `v0.1.8`.

## [0.1.7] - 2026-08-04

### Fixed

- Carries forward the authenticated battle SSE fix and builds the shared
  workspace before the frontend during immutable Worker staging.

## [0.1.6] - 2026-08-04

### Fixed

- Carries forward the authenticated battle SSE fix and waits for asynchronous
  Cloud Build completion by polling build status, eliminating all dependency
  on default logs bucket access.
- Backend image, no-traffic revision, and migrations succeeded, then Worker
  staging stopped because shared output had not been built first. No artifact
  was promoted; the tag was retained and superseded by `v0.1.7`.

## [0.1.5] - 2026-08-04

### Fixed

- Carries forward the authenticated battle SSE fix and suppresses Cloud Build
  log streaming in the staging workflow, avoiding an unnecessary project-wide
  Viewer grant while still waiting for the immutable image build result.
- The image build succeeded, but this Cloud SDK still attempted a final logs
  bucket check. The artifact was not promoted; the tag was retained and
  superseded by `v0.1.6`.

## [0.1.4] - 2026-08-03

### Fixed

- Carries forward the authenticated battle SSE fix after granting the release
  identity permission to act as the default Cloud Build execution service
  account. The grant is scoped to that service account.
- Cloud Build and image publication succeeded, but the staging workflow stopped
  while attempting to stream the default logs bucket. The artifact was not
  promoted; the immutable tag was retained and superseded by `v0.1.5`.

## [0.1.3] - 2026-08-03

### Fixed

- Carries forward the authenticated battle SSE fix and explicitly stages Cloud
  Build source in the dedicated `gs://kshiai_cloudbuild/source` path, avoiding
  the project-wide bucket-list permission required by implicit bucket lookup.
- The staging workflow uploaded source successfully, then stopped before build
  execution because the release identity could not act as the default Cloud
  Build service account. The tag was retained and superseded by `v0.1.4`.

## [0.1.2] - 2026-08-03

### Fixed

- Carries forward the authenticated battle SSE fix from `v0.1.1`, whose
  staging run stopped before creating release artifacts because the GitHub
  deployment identity could not upload Cloud Build source.

### Operations

- Granted the deployment identity bucket-scoped writer access to the dedicated
  `kshiai_cloudbuild` source bucket. No project-wide storage role was added.
- The staging workflow still failed before artifact creation because implicit
  default-bucket lookup required project-wide bucket listing. The immutable tag
  was retained and superseded by `v0.1.3`.

## [0.1.1] - 2026-08-03

### Fixed

- Restored automatic battle progression in the production battle screen by
  attaching the current Supabase bearer token to SSE advance requests. Normal
  authenticated API calls remained available, but battle advancement returned
  HTTP 401 after the cloud authentication cutover.

### Operations

- Emergency release for a material production outage. The change affects only
  frontend request authentication; it has no database, backend API, provider,
  secret, or migration impact.
- Roll back by restoring the previously active Cloudflare Worker version. The
  Cloud Run revision and PostgreSQL schema do not need to be rolled back.
- The staging workflow failed before building or deploying artifacts. This tag
  was not retried or moved and is superseded by `v0.1.2`.

### Added

- Public repository governance with protected `main`, tag-restricted release
  environments, environment-scoped Cloudflare deployment credentials, secret
  push protection, and Dependabot security updates.
- Release governance covering versioning, required checks, immutable artifact
  promotion, database compatibility, rollback, and emergency releases.
- GitHub Actions validation, staged release and owner-confirmed production
  promotion, keyless Google Cloud deployment, smoke testing, and rollback.
