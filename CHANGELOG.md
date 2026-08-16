# Changelog

All notable changes to this project are documented in this file. The format is
based on Keep a Changelog, and releases follow Semantic Versioning.

## [Unreleased]

## [0.21.4] - 2026-08-16

### Fixed

- Open scene-beat combat no longer copies the previous turn's semantic or
  world operations into the new turn record. The first skip after a beat
  close can save again.

### Operations

- No database migration. Application rollback returns to v0.21.3.

## [0.21.3] - 2026-08-16

### Fixed

- Battle story auto-follow scrolls the overflowing 物語 pane again, not the
  window. Inner scroll also holds follow.

### Changed

- New battles group combat into 3-micro-turn scene beats (ADR-0016). Open-beat
  combat skips the narration job, world LLM, and expression agents until the
  beat closes. Existing battles keep one narration per combat turn.

### Operations

- No database migration. Application rollback returns to v0.21.2.

## [0.21.2] - 2026-08-16

### Added

- Administrators and developers can re-enter as the existing E2E observer or
  opponent from `/internal/observations`. The server rotates a one-shot
  password; the browser signs in through the normal email/password grant.
- Adds an in-repo Playwright battle-screen smoke (`npm run test:e2e-gui`). It
  is not a required merge check.

### Operations

- Implements Accepted ADR-0015. Stage binds `SUPABASE_SECRET_KEY` on Cloud Run
  so mint works on the API. No database migration. Application rollback returns
  to v0.21.1.

## [0.21.1] - 2026-08-16

### Fixed

- Battle auto-follow uses the usable viewport above the bottom navigation, so
  the latest log is not crushed under the menu.
- Compact battlefield object list: closed accordion, smaller type, no
  character rows or portable/usable facts, and duplicate labels omitted.

### Changed

- Battlefield instances stay one-fight. The save-from-battle route and battle
  screen save buttons are removed.

### Operations

- No database migration. Application rollback returns to v0.21.0.

## [0.21.0] - 2026-08-16

### Added

- Adds public / friends-only / private visibility to battlefields and narration
  styles, matching character matchmaking. Owners change it from the battlefield
  detail and narration-style list. Existing assets without a setting stay public.

### Fixed

- Stops asking the model for the full battlefield definition during create,
  revision, and upgrade. Fill uses a small required-and-nullable schema with
  string descriptions; the server supplies IDs, topology, and force-free
  defaults. Upgrade restores a public scene from the existing blurb if the
  card validator rejects the model output.
- Shows only unread counts in the burger menu and opens the list on
  `/notifications`. The open panel sits above the bottom navigation.

### Operations

- No database migration. Visibility lives in existing `sheet_json`. Application
  rollback returns to v0.20.1.

## [0.20.1] - 2026-08-16

### Fixed

- Stops asking the model for the internal character-definition object during
  create, revision, and old-character upgrade. Fill now uses a small
  required-and-nullable schema with string descriptions, then the server
  supplies consumer tags, clause defaults, and force-coupled responses.
- Accepts mixed or incomplete fill objects instead of failing the job when a
  description is a string or an action norm omits `response`.

### Operations

- No database migration. Application rollback returns to v0.20.0, which remains
  compatible with the existing authoring-attempt and job tables.

## [0.20.0] - 2026-08-15

### Added

- Queues character, battlefield, and narration-style generate, upgrade, and
  revision work instead of running the provider inside the owner HTTP request.
- Opens dedicated review screens for create approval and change compare, with
  burger notifications and list marks for queued, generating, awaiting, and
  failed attempts.

### Changed

- Begin-authoring routes return `202` with attempt progress. Latest reads
  include failed attempts so an older awaiting draft is not shown after a later
  failure.

### Database

- Adds additive migrations `0020_character_authoring_jobs.sql`,
  `0021_owner_notifications.sql`, and `0022_family_authoring_jobs.sql`. They
  create job and notification tables and add `owner_notifications.asset_type`.
  Existing authoring attempts and generations are not rewritten.

### Operations

- Implements Accepted ADR-0014. Application rollback leaves migrations `0020`
  through `0022` in place. v0.19.1 remains compatible with the new tables
  because it does not read them.

## [0.19.1] - 2026-08-15

### Fixed

- Stops re-generating a full legacy character sheet during old-character
  upgrade. The existing sheet is converted deterministically, then only missing
  structured fields are filled. Mechanical checks restore combat, identity, and
  capabilities, and a single self-review pass may correct the remainder.

### Added

- Shows in-flight authoring progress with a spinner and step label during
  character create and upgrade, including resume after reload.

### Operations

- No database migration. Application rollback returns to v0.19.0, which remains
  compatible with the existing authoring-attempt status vocabulary.

## [0.19.0] - 2026-08-14

### Added

- Adds version-2 structured battlefield definitions with immutable generations,
  disclosure-bound public scene projections, deterministic instance compilation,
  and explicit owner-reviewed creation and upgrade flows.
- Adds version-2 structured narration-style definitions with bounded perspective,
  voice, cadence, phase, intensity, rhetoric, example, and counterexample policies,
  plus a deterministic phase prompt compiler.
- Adds deterministic character action-norm and relationship-seed receipts so
  priority, inhibition, exception, and exact logical-character precedence remain
  server-owned and replayable.

### Changed

- Makes structured character, battlefield, and narration generations authoritative
  for new battle selection and binding. Public descriptions remain derived
  projections and are never reverse-parsed into runtime authority.
- Binds each new battle to immutable generation IDs, content digests, compiler
  contracts, a deterministic battlefield instance, and compiled narration phase
  policies that survive later asset edits or deletion.
- Excludes unsupported, upgrading, failed, inaccessible, and deleted assets from
  search, matchmaking, random pools, direct battle creation, and retry paths while
  preserving owner management and historical battle replay.

### Database

- Adds additive migrations `0018_structured_battlefield_assets.sql` and
  `0019_structured_narration_assets.sql` for compatibility state and two-stage
  authoring attempts. Existing owner assets are not inferred or bulk-upgraded.

### Operations

- Adds `jscpd` duplication checks and `lizard` complexity, function-length, and
  parameter-count baselines to the required static validation path.
- Leaves billing design-only and deferred; this release adds no payment provider,
  entitlement, metering, price, or checkout runtime behavior.
- Application rollback leaves migrations `0017` through `0019` and retained
  immutable generations in place; older applications must not be assumed to
  enforce the new selection-eligibility boundary.

## [0.18.1] - 2026-08-14

### Fixed

- Constrains provider-generated `CharacterDefinitionV2` values with the full
  strict JSON Schema before applying the existing server-side Zod validation.
- Performs at most one validation-receipt-bound repair request when semantic or
  cross-reference validation still rejects a structured definition, then
  fails closed if the repaired definition remains invalid.
- Removes self-referenced JSON Schema defaults emitted for repeated action
  feasibility fields while preserving their original strict constraints.

### Operations

- Adds no database migration and performs no bulk character upgrade. Existing
  characters remain owner-managed and unselectable until their explicit
  latest-version candidate is generated, reviewed, and accepted.

## [0.18.0] - 2026-08-13

### Added

- Adds version-2 structured character definitions with immutable generation
  envelopes, disclosure policies, claim-validated public profiles, and explicit
  owner confirmation before activation.
- Adds the owner-facing `このキャラを最新版に更新` workflow. Unsupported
  characters remain manageable but are excluded from match, opponent, random,
  and direct battle selection until a compatible generation is activated.
- Adds perspective-specific external, self-inner, and omniscient character
  projections for narration, plus an appearance-only portrait prompt compiler.
- Adds grounded observable manifestations that become public battle events only
  after an observer-safe source event and compatible committed expression exist.
- Adds a deterministic narrator presentation-focus projection for emphasizing
  one committed consequence without changing battle authority.

### Changed

- Separates internal turn-limit adjudication rationale from the public verdict.
  The existing judgment narrator receives only a bounded audience-safe factor
  projection and cannot reconsider the canonical result.
- Removes raw latent `interior` state from conscious character-expression
  inputs while retaining it inside the private psyche stage.
- New battles bind the exact ready character generation and frozen compiler
  inputs without creating or activating an asset generation during battle start.
- V2 portrait revisions and restore operations append immutable character
  generations; V2 portrait prompts exclude background, relationships,
  capabilities, equipment, and private psyche fields.

### Database

- Adds `character_asset_states` and owner-scoped
  `character_authoring_attempts` in
  `0017_structured_character_assets.sql`. The tables are additive and existing
  character rows are deliberately treated as unsupported until their owner
  explicitly upgrades them.

### Operations

- This pre-public compatibility cutover does not bulk-migrate or infer hidden
  character structure. After deployment, each character intended for a new
  battle must be explicitly upgraded and accepted by its owner.
- Application rollback keeps migration `0017` in place. The v0.17.4 application
  ignores the new tables; V2 generations created after deployment must not be
  assumed to preserve V2 selection semantics while that older application is
  serving traffic.

## [0.17.4] - 2026-08-13

### Fixed

- Records every physical provider attempt at the shared transport boundary,
  including retries and failed calls, and classifies each attempt by a
  revisioned battle-operation taxonomy.
- Reads retained narration attempts independently from active lease ownership
  so completed and abandoned attempts remain visible in observation totals.
- Stops an observation before outbound provider I/O when its atomically
  reserved operation ceiling would be exceeded.

### Operations

- Binds each observed battle immutably to one approved observation run and
  requires exact ledger, narration receipt, per-layer total, and terminal-state
  reconciliation before accepting the run.
- Adds an LLM-free provider-accounting Stage fixture covering success, retry,
  failure, idempotent reservation, and fail-closed ceiling exhaustion.
- Uses a phase-aware upper bound of 169 provider operations for the normal
  24-advance production observation while preserving unavailable token or cost
  values as unknown.

### Database

- Adds the observation run and physical provider-attempt ledger in
  `0016_provider_operation_accounting.sql`. The migration is additive, and the
  v0.17.3 application ignores the new structures as a rollback target.

## [0.17.3] - 2026-08-13

### Fixed

- Builds `@kshiai/shared` before the Stage narration receipt fixture and pins
  the proof to the single exact worker test instead of invoking the full backend
  suite.

### Database

- No new migration. The additive v0.17.1 schema remains compatible with the
  production v0.17.1 application rollback target.

## [0.17.2] - 2026-08-12

### Fixed

- Binds narration tasks to an exact receipt and delivery generation, fences
  stale workers, and prevents duplicate or out-of-order provider work.
- Streams durable narration receipt updates independently from battle advance
  and renders terminal and pending receipts in one canonical sequence.
- Removes duplicate first-class battlefield object cards by preferring the
  observer-safe object projection over the legacy semantic fallback.
- Routes the turn-limit referee explanation through the fast model tier while
  preserving deterministic winner authority.
- Keeps active battles visible in battle history and fails invalid persisted
  history rows visibly instead of silently dropping them.

### Operations

- Production observation now requires an exact run approval and a declared
  provider-operation ceiling before creating a battle.
- Observation acceptance verifies ordered terminal narration receipts, one
  attempt per receipt, no live leases, completed outbox delivery, and battle
  history visibility.
- Stage runs an LLM-free exact-receipt lifecycle fixture before its bounded
  Cloud Tasks OIDC transport smoke.

### Database

- No new migration. The additive v0.17.1 schema remains compatible with the
  v0.17.1 application rollback target.

## [0.17.1] - 2026-08-12

### Fixed

- Recovers narration deliveries whose Cloud Task was accepted but never
  completed, using generation-bound task identities and stale-entry checks.
- Rejects battle checkpoints from stale lease holders with monotonic fencing,
  and makes retried battle creation reuse its committed battle instead of
  repeating setup work.
- Shows sanitized narration outbox status, delivery generation, and attempt
  count in the administrator battle-pipeline view.

### Database

- Adds narration delivery generations and battle-lease fencing tokens
  (`0015_pipeline_recovery_fencing.sql`).

### Operations

- Stage release now proves Cloud Tasks OIDC delivery to the exact no-traffic
  revision with a bounded smoke request that does not call an LLM or mutate a
  battle.
- The migration is additive; the v0.17.0 application remains the application
  rollback target while the new columns remain in place.

## [0.17.0] - 2026-08-12

### Added

- Sequential initiative checkpoints let the later character observe the
  committed, observer-safe result of the earlier action before deciding. Equal
  initiative reuses the previous order or performs the specified weighted/fair
  draw without redrawing on retry.
- Durable, ordered narration receipts and battle-scoped SSE replay decouple
  canonical advance from terminal narration generation, with fenced workers,
  idempotent recovery, deterministic fallback, and administrator queue/cost
  visibility.
- Immutable generations for editable characters, battlefields, narration
  styles, and dialogue settings are bound into each battle.
- Bounded delayed and conditional battle effects carry explicit action,
  system-rule, or environment/world provenance.
- A deterministic lightweight psyche reaction policy supplies structured
  emotion, interpretation, impulse, arousal, and confidence without an
  additional normal-turn LLM call.
- Versioned battle-pacing snapshots and the provisional
  `candidate-12-v2` policy support twelve-turn battles, earlier finish pressure,
  effect-driven restoration, and gradual production observation.

### Changed

- Narration and semantic-adjudicator prose can explain canonical results but
  cannot overwrite gameplay state or the deterministic winner.
- Battle advances persist restartable bucket-level revisions and expose their
  causal DAG in the administrator view without exposing private prompts or raw
  provider output.
- The provisional pacing candidate increases committed per-turn change and
  removes implicit 20% parameter restoration; existing battles retain their
  frozen legacy policy.

### Database

- Adds immutable asset generations (`0011_asset_generations.sql`).
- Adds optimistic battle revisions (`0012_battle_revision.sql`).
- Adds the battle presentation read model (`0013_battle_presentations.sql`).
- Adds ordered narration entries, fenced leases, attempts, public events,
  outbox, and retention state (`0014_ordered_narration_worker.sql`).

### Operations

- All migrations are additive and forward-only; the prior application revision
  ignores the new structures and remains a valid application rollback target.
- Stage and Promote workflows require the exact `BATTLE_PACING_POLICY` value.
  `current` is the rollback value; `candidate-12-v2` affects only newly created
  battles and remains provisional.

## [0.16.0] - 2026-08-11

### Added

- Battle action `reflect`: spends one turn analyzing the fight and writing
  forward guidelines into battle-volatile memory (not durable character
  matchup memory). Cautious or cornered agents may choose it; impulsive ones
  avoid it. Narration keeps the pause opaque unless focus grants interior
  access; aftermath psyche may still draw on those notes when composing a
  post-battle lesson.
- Public user profile pages (`/users/:id`) with settable display name (random
  default), favorites, and friend request / remove controls.
- Character detail links to the creator's user profile.

### Fixed

- Match start CTA no longer sits under the fixed bottom navigation.
- Battlefield object labels fall back to Japanese kind names instead of the
  raw `object` token when a canonical label is missing.

### Database

- Adds `users.display_name`, `user_favorites`, and `friend_requests`
  (PostgreSQL migration `0010_user_public_profile.sql` and SQLite schema).

### Operations

- Expand-only schema change; prior application revisions remain compatible.
- Mid-fight reflect notes stay on battle state (`battleVolatileMemory`) and
  are not copied into character opponent memories unless aftermath synthesizes
  them into `privateMemory`.

## [0.15.0] - 2026-08-11

### Added

- Burger menu for low-frequency tools and a fixed bottom primary navigation bar.
- Friends list API and UI; character matchmaking visibility (`public` / `friends` / `private`).
- Paginated character and opponent candidate lists (opponents default to 10 with search beyond).
- Separate character creation page at `/characters/new`.
- Public projection of non-position battlefield object/actor state on the battle screen.

### Database

- Adds `friendships` table (PostgreSQL migration `0007_friendships.sql` and SQLite schema).

### Operations

- Expand-only schema change; prior application revisions remain compatible.

## [0.14.8] - 2026-08-10

### Fixed

- Distinguishes advancing with fresh relational leverage from reframing after a
  prior social move loses force. A private `social_reappraisal` basis now
  supports the latter without treating it as a deliberate repetition.

### Operations

- This remains a compact-context staging candidate only. It adds no phrase
  matching, speech rejection, cancellation, mechanical penalty, action-timing
  change, or additional LLM call.

## [0.14.7] - 2026-08-10

### Fixed

- Clears inherited battle-private memory on the compact prologue's fail-open
  provider path as well as its fulfilled path, preserving the boundary between
  current inner state and durable opponent notes.

### Operations

- This remains a compact-context staging candidate only. It adds no phrase
  matching, speech rejection, cancellation, mechanical penalty, action-timing
  change, or additional LLM call.

## [0.14.6] - 2026-08-10

### Fixed

- Separates read-only, opponent-specific matchup notes from the current
  battle's private inner memory, preventing a stored plan or reflection from
  recursively becoming the next battle's dominant thought.
- Makes compact aftermath write one standalone matchup reflection and gives
  present observer-safe self, counterpart, and ambient results priority over a
  familiar conversational demand when choosing a new social approach.

### Operations

- This remains a compact-context staging candidate only. It adds no phrase
  matching, speech rejection, cancellation, mechanical penalty, action-timing
  change, or additional LLM call.

## [0.14.5] - 2026-08-10

### Fixed

- Types private dialogue consequences as belonging to the speaker or the
  relationship, rather than allowing an intended tactical effect on the
  counterpart to occupy the social-cost appraisal.
- Requires an LLM-authored, decision-compatible private continuity basis:
  fresh relational leverage for development or reframing, protective holding
  for deliberate repetition, and withdrawal for meaningful silence.

### Operations

- This remains a compact-context staging candidate only. It adds no phrase
  matching, speech rejection, cancellation, mechanical penalty, action-timing
  change, or additional LLM call.

## [0.14.4] - 2026-08-10

### Fixed

- Separates the preceding expression's observed interpersonal effect and cost
  from the current expression's anticipated effect and cost in the private
  dialogue appraisal.
- Adds an LLM-authored continuity posture so a character can recognise a
  fraying approach or deliberately hold a line for character-specific reasons,
  without phrase bans, prose matching, retries, cancellation, or mechanic
  changes.

### Operations

- Compact appraisal output now requires every temporal social-feedback field;
  legacy persisted states retain bounded defaults. The staged compact override
  remains revision-local and production stays on the legacy projection pending
  fresh observation acceptance.

## [0.14.3] - 2026-08-10

### Added

- Adds a revision-local dialogue projection override to the protected staging
  workflow, allowing compact dialogue observation without changing the shared
  production administrator setting.

### Operations

- The override is validated as `compact` or `legacy`, is snapshotted only by
  battles created through the zero-traffic staged revision, and is explicitly
  removed when staging without an override.

## [0.14.2] - 2026-08-10

### Fixed

- Makes compact deep psyche return a typed, private appraisal of the prior
  expression's expected impact, observed interpersonal impact, and next
  approach on every turn.
- Gives compact expression that appraisal as the character's semantic decision
  context, preserving meaningful character-driven reiteration without phrase
  bans, prose rejection, or mechanical changes.

### Operations

- Compact mode was reverted to legacy immediately after the failed v0.14.1
  production observation and remains opt-in until this release passes staged
  and protected production observation.

## [0.14.1] - 2026-08-10

### Fixed

- Keeps committed character utterances in one ordered conversation-continuity
  thread instead of also treating them as fresh action/result observations.
- Removes duplicate compact-context aliases and gives the private expression
  brief a semantic relationship move, so recurrence remains a character-driven
  choice rather than a repeated lexical input.

### Operations

- No database migration, extra LLM call, reservation-timing change, or
  deterministic phrase ban is introduced. Canonical mechanics, observer
  ownership, and action validation are unchanged.

## [0.14.0] - 2026-08-10

### Added

- Projects each character's observer-relative action result into a compact,
  role-labelled dialogue packet. The private deep-psyche stage receives that
  packet and returns a bounded state delta plus an expression brief; the public
  speech/action stage receives the brief separately from recent dialogue.
- Adds a per-battle snapshot of administrator dialogue-context settings:
  compact or legacy projection, recent-exchange length, and relevant-memory
  limit. New battles use the saved snapshot, while active battles remain
  reproducible with the configuration they began with.
- Adds administrator controls for those settings and retains an internal,
  observer-safe projection trace for diagnosis.

### Operations

- No database migration is required. Deterministic action validation, canonical
  mechanics, private-memory boundaries, and public narration ownership are
  unchanged. Rollback to v0.13.7 remains application-compatible.

## [0.13.7] - 2026-08-09

### Changed

- The deep-psyche stage now privately chooses whether each public expression
  develops, reframes, intentionally reiterates, or visibly withholds its prior
  approach. The speech/action stage executes that choice without changing
  mechanics or applying a deterministic phrase ban.

## [0.13.6] - 2026-08-09

### Fixed

- Makes the public expression stage carry out the deep-psyche stage's already
  committed speech approach. When a character judges that its prior words did
  not land, it changes the character's public angle in that character's own
  terms instead of treating that judgment as optional background.
- Keeps repetition available only when the committed protective stance, fresh
  result, and speech appraisal make it a meaningful character choice; this is
  a private psychology-to-expression handoff, not a phrase ban or narration
  rewrite.

## [0.13.5] - 2026-08-09

### Changed

- Adds a private deep-psyche LLM stage before each character's speech/action
  stage. It commits compact emotional, relational, event-appraisal, core-need,
  and protective-stance conclusions from observer-safe results and bounded
  conversation continuity; it never produces public speech or mechanics.
- The later speech/action stage receives that committed psyche read-only and
  cannot replace it. It now expresses the character's private intent through
  one organic line and proposes only the next validated action.
- Turn-0 matchup strategy and post-battle reflection are formed by the
  deep-psyche stage, using the existing per-opponent memory already supplied to
  private continuity.
- The administrator dialogue guide is applied exclusively to the deep-psyche
  stage. The management screen now labels this responsibility explicitly.

### Operations

- Adds no database migration: the new bounded interior fields have defaults and
  remain compatible with persisted battle JSON. Internal turn traces retain the
  separate deep-psyche inputs, outputs, and accepted state for audit.
- Canonical battle results, observer-relative perception, deterministic action
  validation, and public narration ownership remain unchanged.

## [0.13.4] - 2026-08-09

### Changed

- Character-agent calls now receive the fresh committed action/result context
  and the bounded conversation-continuity context as distinct input threads.
  The character privately chooses whether each one-line expression is chiefly
  an action reaction, conversational continuation, or a natural weave of both.
- Keeps recurrence as a character-driven choice: the model may repeat or fall
  silent when its disposition and current result warrant it, without a
  deterministic phrase ban or a narrator rewrite.

### Operations

- No database migration or runtime setting is required. Existing stored agent
  state remains compatible; the new private speech mode has a safe default.
- Canonical mechanics, action validation, and public speech ownership remain
  server-controlled and unchanged.

## [0.13.3] - 2026-08-09

### Added

- Adds an administrator-only runtime settings page for the character dialogue
  pipeline: an editable psychology guide, on/off switch, and a 4–24 entry
  conversation-history window. Saves take effect on the next character-agent
  invocation without a deployment.
- Adds private character speech appraisal for expected effect, observed effect,
  and the next character-specific approach. The model may still choose
  repetition or silence when that is grounded in its own personality and
  situation.

### Operations

- Persists the singleton dialogue setting with revision-based conflict handling
  and an audit user/timestamp. Active character-agent trace inputs retain the
  setting snapshot for later internal observation.
- Adds the `dialogue_pipeline_settings` PostgreSQL migration. The SQLite runtime
  creates the compatible table automatically.
- Dialogue settings remain input-only context: canonical character facts,
  server-owned action validation, damage, and battle results are not configurable
  through this surface.

## [0.13.2] - 2026-08-09

### Added

- Adds a test-realm-only dialogue-quality observation to the persistent battle
  E2E run. It records exact repetition, consecutive repeated lines, reaction
  share, per-speaker lexical diversity, and structural opportunities to answer
  a counterpart's earlier utterance without affecting battle behavior.
- Replaces the causal-only E2E fixture with a fresh pair of deliberately
  contrasting voices: an observant questioner and a terse, defiant swordsman.

## [0.13.1] - 2026-08-09

### Fixed

- Removes the retired tactical-policy step and its client-side generation call
  from match setup. Starting a match now goes directly to the character-owned
  turn-0 strategy selection, informed by that opponent's bounded plan and
  reflection memory as well as the current battle state.

## [0.13.0] - 2026-08-09

### Added

- Character agents forecast deterministic repeated-action fatigue, reduced
  effect, and opponent readability before choosing an action, and receive the
  corresponding committed result after resolution.
- Every character keeps bounded, owner-private opening-plan and post-battle
  reflection memory for each opponent.

### Changed

- Match setup no longer generates or selects tactical policy cards. Each
  character chooses its opening strategy from its own turn-0 thought.

### Operations

- No database migration. Opponent memory is optional character-sheet JSON and
  remains compatible with existing records.

## [0.12.2] - 2026-08-07

### Changed

- Extends LLM operation deadlines to match fast, engine, and long-running call
  profiles instead of aborting every provider at the former 12-second limit.
- Retries HTTP 429 at most twice and HTTP 503 once within the selected provider,
  while preventing retries after streamed output has begun.
- Restricts ordered provider fallback to DNS and billing or exhausted-credit
  failures. Timeouts, rate limits, service unavailability, parse failures, and
  other operation errors remain terminal within the selected provider.

### Operations

- Keeps the existing provider order, models, call authority, and one-hour
  in-memory cooldown. `LLM_PROVIDER_COOLDOWN_MS` is the preferred setting and
  the existing `LLM_QUOTA_COOLDOWN_MS` remains accepted for compatibility.
- Adds no migration, secret, cohort switch, direct battle mechanic, or narrator
  output guard.

## [0.12.1] - 2026-08-07

### Changed

- Aligns non-authoritative environment proposals with persistent transition
  shapes the canonical world reconciler can represent, while keeping final
  acceptance and effects server-validated.
- Clarifies that the existing battlefield and canonical world may ground a
  proposal cause, and that an accepted environment decision must include its
  matching canonical operation.

### Operations

- Adds no schema, provider call, direct environment mechanic, narrator guard,
  or runtime flag. The always-enabled world-process boundary is unchanged.

## [0.12.0] - 2026-08-07

### Added

- Adds an explicit accepted, rejected, or skipped environment-process receipt
  linking the supervisor proposal, canonical decision, resolved event, source,
  and following-turn effect keys in the internal battle DAG.

### Changed

- Treats supervisor happenings as non-authoritative proposals evaluated by the
  existing post-resolution semantic/world reconciliation call.
- Emits an environmental situation event and bounded following-turn situation
  values only after a grounded non-character world transition is accepted.
- Removes direct proposal-owned coefficients, environmental hits,
  pre-resolution public events, and same-turn HP effects from the live service
  path.

### Operations

- The new path is always enabled. It adds no migration, secret, environment
  variable, provider call, narrator guard/repair, or cohort switch. Non-critical
  narrator-only work remains pending while accepted canonical input can improve
  narration incidentally.

## [0.11.1] - 2026-08-07

### Changed

- Presents character-agent `nextAction` as six action-kind-specific JSON shapes
  so standard actions do not copy free-action-only explanation and subject
  fields into otherwise valid proposals.

### Operations

- Keeps the strict server validator and proposal receipt unchanged. This is an
  always-enabled prompt-only alignment with no migration, secret, environment,
  provider-order, or narrator-policy change.

## [0.11.0] - 2026-08-07

### Added

- Retains each bounded character-agent action proposal separately from the
  server-owned validation receipt and accepted following-turn action.
- Shows proposal acceptance or a bounded rejection reason in the Site A and
  Site B lanes of the separate internal pipeline DAG.

### Changed

- Keeps valid character continuity and speech when only the accompanying action
  proposal is invalid, instead of treating the complete model response as a
  provider failure and retrying another provider.
- Centralizes action availability, finisher, affordance, instrument, and
  required-change validation at the battle-service authority boundary.

### Operations

- Existing battle records remain readable because the new trace receipt is
  optional. No database migration or new environment variable is required.

## [0.10.0] - 2026-08-07

### Added

- Retains bounded per-turn Site A and Site B character-agent inputs, provider
  dispositions and outputs, and server-accepted outputs together with narrator
  input, provider output, and public output.
- Adds a per-turn pipeline DAG to the separate internal observation screen. It
  shows current-turn adjudication and canonical transition, parallel character
  inputs and outputs, and narrator input and output without modifying the
  normal battle screen.

### Changed

- Sends the narrator one role-labelled turn brief that places each action beside
  its structured causality and readable resolution reason, explicitly reports
  accepted canonical change, and separates current state from static battlefield
  background.
- Removes duplicate outcome prose from the narrator payload while preserving the
  existing single narrator call and free choice of wording. This release adds no
  claim validator, prose rejection, repair loop, retry policy, or mechanical
  authority for narration.

### Operations

- Existing battles remain readable; pipeline traces are available only for turns
  created by this or a later backend revision. No database migration or new
  environment variable is required.

## [0.9.0] - 2026-08-07

### Added

- Adds a fail-closed `/internal/observations` diagnostics screen and API for
  administrators, developers, test users, and E2E users. It exposes retained
  battle logs, raw battle state, and canonical turn progression without
  changing or linking from the normal battle UI.
- Retains exact semantic and mechanical-world transitions in future turn
  records so canonical progression can be inspected after a battle.

### Fixed

- Persists each validated E2E observation beside its battle and uploads only a
  non-sensitive execution receipt, avoiding any need to grant the GitHub deploy
  identity project-wide log-reading access.

## [0.8.1] - 2026-08-07

### Fixed

- Bounds the rotating persistent E2E account password to 44 UTF-8 bytes. The
  prior 81-byte value made Supabase Auth return `500 unexpected_failure` before
  either dedicated account could complete application sign-in.

### Operations

- Keeps the already-created observer authentication identity and all future
  accounts, fixtures, ratings, and battles durable; the hotfix adds no cleanup
  or data migration.

## [0.8.0] - 2026-08-07

### Added

- Adds server-owned `general`, `test`, and `e2e` account kinds. Test and E2E
  users share a separate test realm for cross-account characters, battlefields,
  narration styles, battles, and rating observations.
- Adds two persistent Codex observation identities with reusable characters, a
  fixed rainy-alley battlefield, and a causal-observation narrator. Each run
  retains a new full production API/SSE battle and a sanitized observation.
- Adds a protected production observation workflow bound to the active guarded,
  digest-pinned Cloud Run revision.

### Security and privacy

- Hides test-realm characters, custom assets, direct character access, battle
  creation targets, and rating populations from normal general users.
- Keeps account classification and administrator authorization server-owned;
  client claims cannot opt into the test realm or administrator access.
- Excludes credentials, internal user IDs, raw parameters, private semantic
  state, and rating internals from observation artifacts.

### Operations

- Adds forward-only migration `0007_account_kind.sql`; existing users remain
  `general`, so the prior application revision stays compatible after migration.
- Stage binds `ADMIN_EMAILS=mako10k@mk10.org`, and Promote rejects a staged
  revision without that administrator binding or guarded causal narration.
- Persistent E2E passwords rotate on every run, but accounts, fixtures, ratings,
  and battles are never cleaned up. Sanitized workflow artifacts are retained
  for 90 days while the database battle remains durable.

## [0.7.2] - 2026-08-07

### Added

- Adds a server-owned causal turn receipt that links effective actions,
  resolution reasons, source-owned events, committed mechanical evidence,
  semantic changes, and bounded carry-forward state without mining prose.
- Adds an ID-free, perspective-safe causal projection to the existing narrator
  input behind the reversible `BATTLE_CAUSAL_NARRATION_MODE` guard.

### Security and privacy

- Rejects dangling or uncommitted evidence and keeps canonical identifiers and
  unobserved causal attribution out of character-limited narration inputs.
- Keeps narration presentation-only: the slice adds no mechanics, persistence,
  winner, rating, cognition, or additional LLM-call authority.

### Operations

- No database migration, backfill, authentication, provider-order, secret, or
  infrastructure-topology change is required. The causal narration mode
  remains `off` unless a staged Cloud Run revision explicitly selects
  `narration_guarded`.

## [0.7.1] - 2026-08-06

### Added

- Skills enter a power-based cooldown of 1–9 turns after a successful use, so
  stronger techniques cannot be repeated every turn. Cooldown state is stored on
  the combatant and filtered from character-agent available actions.

### Changed

- Softens narrator obligations: ordinary turns prioritize concrete action and
  outcome description, and no longer require a form-evaluation sentence every
  turn. Progression hints apply only when the fight is stuck or late.

### Operations

- No database migration. Existing battles start with empty skill cooldown maps
  and acquire them as skills are used. Optional `skillLastUsedTurn` on combatant
  JSON is ignored by the prior revision on rollback.

## [0.7.0] - 2026-08-05

### Added

- Adds profile-grounded battle priorities so characters still seek victory by
  default while commitments such as compassion, safety, or promises may guide
  action selection when their configured priority is higher.
- Adds `free_action` as a full-turn natural-language attempt for ordinary
  interactions such as grabbing, removing clothing, picking up props, changing
  posture, or preparing an improvised tool.
- Adds lazy canonical object promotion and append-only concretization for
  profile appearance, equipment, battlefield, semantic, and committed-event
  roots without requiring every garment or loose prop to be pre-registered.
- Adds observer-safe tactical-need, latent-affordance, and opportunity-chain
  inputs so characters can prepare bounded offensive, defensive, control, or
  scene advantages over multiple turns.
- Adds battle-time profile overrides and ID-free scene-state facts derived from
  the same canonical world placement, keeping removed or relocated profile
  items consistent in character and narrator context.

### Changed

- Lets validated held or worn objects supply bounded qualitative instrument
  effects to later basic attacks, skills, or defense without letting free
  actions directly write damage, resources, incapacity, or victory.
- Calls one batched server-side free-action adjudicator only on turns where at
  least one character reserved a free action; ordinary turns add no LLM call.

### Security and privacy

- Keeps character intent and observer-local labels separate from canonical
  world facts. Hallucinated objects are not promoted, and a character may keep
  believing an object is a stone while the server binds the real ball.
- Filters current scene facts by narration perspective and never exposes
  canonical object IDs or an unobserved object's canonical identity to a
  character-limited narrator.

### Operations

- No database schema migration, backfill, environment, authentication, billing,
  provider-order, secret, infrastructure, or deployment-topology change is
  required.
- New action, decision-profile, world-object, receipt, and presentation fields
  remain optional in persisted battle or character JSON. The prior revision
  ignores them on rollback; active battles derive bounded legacy defaults.

## [0.6.1] - 2026-08-05

### Added

- Adds one battle-scoped encounter context for short display names,
  relationships, mutual forms of address, and bounded inner-state digests.
- Adds perspective-local narrator recognition updates to the existing narrator
  response so identified people remain associated with stable scene subjects
  across turns and viewpoint changes without another LLM request.

### Fixed

- Stops a narrator from degrading an already identified combatant to a generic
  unknown voice merely because current visual or auditory access is weaker,
  while still allowing explicit disguise, illusion, disappearance, or broken
  subject continuity to change the apparent identity.
- Separates canonical character speech ownership from narrator display labels.
  The narrator may choose context-appropriate labels and render scene-grounded
  third-party speech; only structural invalidity and control-identifier leakage
  are repaired instead of restricting labels to a server allowlist.
- Keeps A-side, B-side, and reader narrator cognition independent and updates
  both character viewpoints even when another narration viewpoint is selected.

### Security and privacy

- Keeps narrator recognition state presentation-only and prevents it from
  becoming character memory, mechanics input, canonical speech, or public DTO
  metadata. External-reader subject references remain opaque.

### Operations

- No database schema migration is required. Encounter and narrator continuity
  fields are optional battle-state JSON, and legacy battles derive bounded
  defaults without converting historical public prose into cognition.
- No environment, authentication, billing, provider-order, infrastructure, or
  deployment-topology change is included.

## [0.6.0] - 2026-08-05

### Added

- Adds a server-owned coarse battle world for position, relative distance,
  presence, exposure, occlusion, orientation, sensory and mental state, and
  held, worn, attached, or usable object relations.
- Adds realistic initial and continuous observer perception, apparent identity
  for transformations and illusions, and per-observer hearing of committed
  character speech.
- Adds observer-safe feasible action choices, execution-time revalidation, and
  structured causal effects from characters, scenes, objects, and conscious or
  unconscious state.
- Adds side-neutral initiative windows: near-equal actions resolve atomically
  from one snapshot, faster actions commit first, and slower actions are then
  revalidated. Mutual incapacity remains a valid draw.
- Adds persisted canonical turn-limit adjudication from committed facts and
  qualitative reserves, followed by a separate presentation-only verdict.

### Changed

- Makes isolated character agents the authority for actual speech. Narrators
  may place or punctuate accepted lines but cannot invent speech, alter facts or
  intent, feed public rendering back into cognition, or influence mechanics.
- Grounds each character in a frozen complete own-profile anchor and limits
  action selection to that character's private continuity, current perception,
  and server-approved world constraints.
- Applies the same speech, perception, outcome, and no-feedback boundaries to
  prologue, normal turns, terminal turns, and reaction-only aftermath.
- Replaces fixed Side A processing priority with explicit simultaneous and
  ordered temporal buckets, including side-swap invariance for conflicts.

### Security and privacy

- Keeps raw combat totals, hidden canonical locations, counterpart-private
  state, contact source mappings, and control identifiers outside character and
  public DTOs; narrator identifiers are repaired to permitted display labels.
- Removes public narration, rendered speech, and event prose from winner
  selection so narration style or provider phrasing cannot alter the result or
  rating input.

### Operations

- No database schema migration is required. New world, perception, temporal,
  adjudication, and authority-marker fields remain optional in battle state JSON.
- Legacy battles are adapted deterministically on read and persisted on the
  next normal save. Historical display remains intact; unknown-provenance
  `lastSpeech` and actions planned from it are discarded rather than becoming
  new private cognition.
- Application rollback remains compatible because prior revisions ignore the
  optional JSON fields. If an old revision resaves a battle, a later 0.6.0
  process safely repeats the deterministic authority migration.
- XAI remains the primary perception provider with the reviewed combined
  topology; OpenAI remains the operational fallback. No provider, environment,
  authentication, billing configuration, or deployment topology changes are
  included.

## [0.5.1] - 2026-08-04

### Fixed

- Stops post-processing from replacing public battle speeches with server-authored
  stock stage directions when the narrator repeats a line; duplicates are dropped
  instead so dialogue stays narrator-authored.
- Breaks multi-turn action loops (especially repeated skills and wait streaks) by
  applying drama-based variety pressure on policy fallback and character agents.
- Requires narrator turns to advance leverage using a progression hint, so ambient
  restatement of the same exchange is discouraged in favor of action-led prose.

### Operations

- No database migration, environment, authentication, or billing change.
- Compatible with 0.5.0 battle JSON; older revisions ignore new decision fields
  that are only used at runtime.

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
