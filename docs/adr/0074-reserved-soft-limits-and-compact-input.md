# ADR-0074: Soft time warnings and compact adjudication schema

- Status: Accepted
- Revision: 1
- Date: 2026-10-12
- Decision owner: Repository owner
- Authority: [canonical decision](0074-reserved-soft-limits-and-compact-input.think)
- Related: ADR0072 revision1; ADR0073 revision1; docs/unified-consciousness.pert; Stage38179086287

## Context

Application v0.25.0-rc.3 committed9turns and25reservations with exact ranked memory carry-forward, then reached the600second whole-battle deadline during turn10 narration. All10adjudications completed, taking518seconds total;41physical attempts were consumed. Adjudication inputs were approximately34000characters. The strict10minute operating limit, introduced before measurement, prevented live acceptance despite correct turn execution.

## Decision drivers

- Owner explicitly requests soft limits with warning logs, looser hard limits and adjudication input compression.
- Preserve adjudication strength, canonical state, historical bindings and bounded authorized spending.
- Avoid reducing information or weakening result validation to obtain a passing Stage.

## Considered options

1. Retain strict10minute battle stop: already measured insufficient; rejected.
2. Remove all bounds: risks indefinite requests and does not respect paid authorization; rejected.
3. Separate advisory timing from absolute bounds and losslessly compact prompt schemas: selected.

## Decision

Accept reserved turn policy v3: battle soft600000ms/hard1800000ms; character/narration soft60000ms/hard120000ms; adjudication soft180000ms/hard300000ms. Existing durationMs/deadlineMs/adjudicationDeadlineMs denote hard limits; new soft fields only produce structured, value-free warning logs. Soft expiry must neither cancel requests nor stop commits. Hard limits still clip every dispatch and commit. The role hard deadline spans known429retries in policy v3; unknown-send replay and timeout retries remain forbidden. Keep max36turns,5reservations,4normal calls,200physical attempts, output token bounds, models and strict world/trace validation.

New immutable adjudication prompt v3 replaces repeated identical schema subtrees with local JSON Schema references, preserving the complete response contract and all state/assets/order input. Retain prompt v1/v2 and policy v1/v2 exact historical behavior. Do not discard world fields or private evidence. Align Cloud Run request timeout600seconds and Stage E2E job45minutes with the looser bounds; existing600second per-advance deadline and renewable lease cover a normal turn's worst-case540seconds plus overhead.

Owner acceptance: 「ソフトリミットでログ出力で、ハードリミットをもっとゆるくすべきでは？裁定入力の圧縮は行って下さい。」 This authorizes correction and offline verification under existing deployment authority. It does not add another paid fixture to the exhausted one-fixture authorization; prepare a concrete candidate before requesting any additional paid run.

## Consequences

### Positive

- Measured timing targets become observable without prematurely failing correct battles.
- Schema compression reduces transmitted characters without removing rules or canonical data.

### Negative and risks

- Hard time budgets are longer; maximum attempts remain200and prices unconfigured.
- Fewer input characters do not prove faster inference or better entertainment; real-model evidence remains necessary.

## Compatibility and migration

New battles bind policy v3 and prompt v3. No historical conversion or database migration. Preserve all three failed fixtures and unknown physical requests. This supersedes ADR0073's new-creation deadline and unchanged-prompt selection only; historical policy v2 and all other contracts remain intact.

## Verification

Check soft expiry warns while requests/turns continue; hard expiry still stops with atomic state protection; v1/v2 compatibility and no replay; schema expansion equality and strict response coverage; saved Stage input size comparison with zero API calls; typecheck/static/build/full governed PostgreSQL tests and individual authority review. Release only exact-source CI and successful Stage artifacts.

## Implementation references

- Stage38179086287: https://github.com/mako10k/kshiai/actions/runs/38179086287
- Prior application v0.25.0-rc.3 source97478bb99f28a967057f8f7c87885e4c844435a3; PR188.
