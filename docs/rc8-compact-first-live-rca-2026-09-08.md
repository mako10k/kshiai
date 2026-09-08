# rc8 Compact first-live RCA

## Scope and observed impact

This RCA covers two connected failures:

1. Production character management returned HTTP 400 and presented the user's
   characters as missing after rc8.
2. Compact implementation work did not produce Compact quality evidence for the
   exact artifact later promoted to production.

Production data inspection showed that the character rows still existed. The
list request failed while parsing a stored authoring candidate, with
`action norm response requires at least one structured action selector` at
`definition.actionNorms[*].response`.

Production request logs for `kshiai-api-00130-gon` additionally showed the
same retained-candidate failure on two screen-facing reads: `/api/characters`
returned 400 three times and `/api/character-drafts/latest` returned 400 twice.
In the same interval, `/api/me` and `/api/notifications` returned 200. This
proves propagation to Character Management, Character Create, and Match (whose
initial load includes `/api/characters`). It does not establish that
Battlefields, Narration Styles, Friends, or History have a separate defect.

## Root causes

### RC-1: a persisted schema version was strengthened in place

Commit `9161b9cf` added the selector invariant to
`CharacterActionNormV2Schema` without changing `schemaVersion: 2` or migrating
the already persisted V2 candidates. `parseAttempt` then applied the new parser
to historical `candidate_json`. Data that was valid when written consequently
became unreadable without any change to that data.

The selector requirement itself is not the defect. It is required for newly
generated executable action norms. The defect is enforcing a new activation
invariant inside the historical storage-read contract.

### RC-2: release evidence was not bound to the promoted Compact behavior

The Stage Cloud Run tag and Worker preview alias were derived only from the
release tag. Repeating Stage for the same tag could retarget the alias, so a
later observation could reach a different backend revision while retaining the
earlier release label.

In addition, Promote required artifact identifiers and basic smoke evidence but
did not require a completed battle receipt proving `compact` on that exact
revision. This allowed release completion to be evaluated locally as deployment
completion instead of the product outcome: an exact artifact running Compact.

## Contributing causes

- Character-list review marks require only `attempt_id` and `status`, but the
  list path loaded and parsed the complete candidate for every listed character.
  One incompatible historical candidate therefore failed the entire list.
- A revision-local Compact override and the normal persisted Compact setting
  were not kept distinct in promotion evidence. An override build is useful for
  isolation but is intentionally not a promotable ordinary production revision.

## Escape and detection causes

- Candidate fixtures were produced with the current schema. No regression used
  a candidate that had been valid under the earlier V2 read contract.
- Deployment smoke checked health and only `/api/me` after authentication. It
  did not exercise the authenticated reads used to render the product screens.
- The authenticated smoke used a newly created empty user. Empty list calls
  alone would not have exercised this retained-data compatibility failure.
- Stage smoke covered availability, authentication, SSE, queue delivery, and
  storage, but did not run a dialogue-bound Compact battle on the exact
  promotable revision.
- The observer recorded the expected revision supplied by the workflow; it did
  not independently compare that value with the revision returned by the API.

These are why the defects escaped. They are not the mechanisms that created
either incorrect state.

## Corrective actions implemented locally

- Restored `CharacterActionNormV2Schema` as the backward-compatible persisted V2
  reader. The nonempty-selector invariant remains mandatory in the action-norm
  compiler and at ready-generation activation/eligibility.
- A historical selectorless generation is now explicitly `unsupported` with
  `invalid_action_norm_selector`; it is not silently executed or repaired.
- Character-list review marks now come from one typed metadata-only query and do
  not deserialize `candidate_json`.
- Historical candidates remain visible for audit. The review response marks
  them `canAccept: false` with the concrete readiness error instead of crashing
  or silently accepting them.
- Stage backend and Worker aliases are unique to the workflow run and attempt.
- Health evidence includes the actual Cloud Run `K_REVISION`, and smoke/E2E
  compare it with the expected revision.
- Stage now runs a bounded persistent battle against the exact Worker preview
  and backend revision, validates the battle's dialogue projection and activation
  source, and retains immutable evidence.
- Promote now requires the successful Stage run and accepts only evidence for
  the same commit, tag, backend revision, Worker version, `compact` projection,
  and `persisted_setting` activation source.
- Authenticated Stage and production smoke now creates a bounded temporary
  character and historical selectorless V2 candidate, exercises the
  side-effect-free screen read surface, validates response shapes, and removes
  the temporary attempt, character, application user, and Supabase user.

## Remaining unknowns and external state

- The total number and statuses of selectorless production candidates and active
  generations have not yet been independently counted.
- `/api/character-drafts/latest` is not included in the read-only release smoke:
  despite being a GET, it wakes a global authoring job and can mutate unrelated
  work. The retained-candidate parser is still exercised through character list
  and detail smoke, and the draft route has local regression coverage. Making
  draft polling owner-scoped and read-only remains separate corrective work.
- These corrections are local only. They have not been committed, pushed,
  released, or applied to Stage or production.

## Verification

- CLI LLMThink audit: fatal 0, error 0, warning 0.
- Historical candidate list regression: passed.
- Historical generation eligibility regression: passed.
- Persisted-read versus compiler-invariant regression: passed.
- Persistent observer and release-workflow contract tests: passed.
- Authenticated read-surface smoke regressions: 2 passed.
- Full tests: shared 304, backend 300, frontend 20, deployment 3; all 627 passed.
- Repository typecheck including deployment code: passed.
- Production build: passed. Vite retained its pre-existing large-chunk advisory.
- Duplication check: passed.
- Lizard 1.23.0 in an isolated environment: all checked metrics remained within
  the repository baseline.
