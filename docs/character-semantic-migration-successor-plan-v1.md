# Character semantic migration successor plan — revision 1

- Status: Proposed for owner review
- Date: 2026-09-10
- Authority: accepted character semantic migration requirement revision 6
- Scope: planning only; no ADR acceptance, provider call, deployment, policy
  activation, production migration, or pointer mutation

## 1. Outcome and current baseline

Deliver two user-visible recoveries without merging their causes or authority:

1. restore new-character creation by closing the separate response-schema
   identity correction; and
2. restore the eight frozen ready V2 characters through reviewed, append-only,
   LLM-assisted semantic migration to strict V3, without a permanent V2 reader
   exception.

The existing conscious-agency implementation and its quality comparison remain a
separate delivery stream. This plan does not rewrite its completed history or
treat local schema validity as model-quality evidence.

## 2. Planning decisions

### 2.1 Two coordinated lanes

Lane A closes the already-started character-authoring response-schema repair.
Lane B establishes and delivers semantic migration. Lane A does not wait for the
full migration design, but its post-cutover authoring contract must eventually
target the schema version selected by Lane B.

### 2.2 ADR lineage

Do not accept Proposed ADR-0029 revision 1. Its permanent V2 compatibility reader
conflicts with the accepted requirement. The recommended disposition is to mark
that proposal Rejected and create a new numbered successor ADR package that
explicitly refines ADR-0010 and ADR-0011. Revising ADR-0029 in place is possible,
but makes the rejected reader direction and the new migration direction share one
identity, so it is not recommended.

Use two coordinated ADR records if the first draft shows that one record cannot
remain reviewable:

- semantic asset contract: `CharacterDefinitionV3`, conscious guidance,
  qualified mechanical fallback, compiler and capability identities, deferred
  markers, capsule role and disclosure boundaries;
- migration transaction contract: frozen attempts and provider requests,
  change-set and semantic repair, review diff, receipts, idempotency, per-asset
  append/CAS, cutover, and rollback.

The split is a drafting boundary, not permission to accept one half with an
incoherent cross-record contract. Both must identify their dependency and exact
combined acceptance state.

### 2.3 Effect boundaries

Local implementation, deployment, schema-3 authoring-policy activation, paid
provider candidate generation, owner acceptance of candidate digests, production
append/CAS, and production readback are separate effects. No earlier task grants
authority to a later one.

## 3. Ordered work packages

| ID | Work package | Depends on | Completion evidence | Authority boundary |
| --- | --- | --- | --- | --- |
| A1 | Close the response-schema identity repair already present in WIP | accepted RCA and current WIP | focused regression plus full typecheck, tests, build, duplication and Lizard; code review; Seal readback | local correction only; no provider or deployment |
| A2 | Verify the authoring repair on the real provider route | A1 | frozen request/schema identity, bounded call receipt, response classification, and no unapproved retry | requires a separately bounded paid-provider approval |
| A3 | Deploy and verify new-character creation | A1, deployment readiness; A2 when live-provider evidence is required by the release decision | deployment identity, health/readback, create flow result, rollback readiness | separate deployment and production-use approval |
| B1 | Resolve ADR lineage and author the successor ADR package | accepted requirement v6 | ADR-0029 disposition; complete paired `.think`/`.md` candidates; CLI LLMThink audit and `adr:check`; impact preview | Proposed only; no implementation authority |
| B2 | Review and accept, revise, or reject the exact successor ADR package | B1 | complete Japanese review scope, alternatives, risks, unknowns, owner decision, accepted Seal lineage | owner decision required |
| B3 | Implement V3 semantic asset contracts and compiler boundaries | B2 | strict V3 parsing; V2 historical read; qualified tuple rejection; guidance/mechanics separation; capsule excluded from runtime/public compilers | local implementation only |
| B4 | Implement durable migration attempts and preservation | B3 | frozen source and request identities; operation coverage; bounded capsule; disclosure checks; crash/retry fixtures | local implementation only |
| B5 | Implement bounded semantic generation, review, and repair | B4 | all six operations; whole-candidate semantic review; expanding repair closure; per-request receipts; full revalidation; owner-readable semantic diff | local tests use fixtures/test doubles; no paid call |
| B6 | Implement append-only activation, replay, drift, and rollback controls | B5 | exact candidate acceptance binding; per-asset atomic append/CAS; completed replay idempotency; source/pointer drift; old battle readability; rollback fixture | local implementation only |
| B7 | Run the integrated local release gate | B6 | production-shaped nine-ready-character fixture, affected eight and 21 soft entries covered; 16 no-state excluded; full typecheck, tests, build, duplication, Lizard, ADR check, Seal stale review and fsck | proves local contract only |
| B8 | Deploy dual V2/V3 read support without schema-3 activation | B7 | deployed revision readback; historical V2 and new V3 compatibility probes; migration resume capability; rollback readiness | separate deployment approval; no provider or pointer write |
| B9 | Freeze and review the production migration manifest; run no-provider/no-write dry-run | B8 | exact eight logical/generation/content identities; drift and already-complete report; expected provider work and ceilings; zero calls/writes | production read-only authority and owner manifest review |
| B10 | Generate provider-backed migration candidates | B9 | separately approved model/route/budget; per-request receipts; structural and semantic results; owner-review diffs; failures remain non-current | separate paid-provider approval; no activation |
| B11 | Accept exact candidates per asset or exact batch | B10 | accepted candidate digest set; declines and unresolved items explicit | owner decision required; still no pointer write |
| B12 | Append accepted V3 generations and move pointers per asset | B11 | per-asset atomic receipts, CAS results, partial-failure isolation, unchanged failures, rollback target | separate production-write approval |
| B13 | Verify restoration, then decide schema-3 authoring cutover | B12 | eight target outcomes; selector list and battle binding readback; old-battle readability; capsule non-consumption; failure report | readback first; policy activation is a later owner decision |
| B14 | Activate strict schema-3 authoring and verify create/revision paths | B13, A1; A3 deployment state reconciled | qualified policy receipt; new create/revision emit V3; restore/import use migration; rollback exercise/readiness | separate production policy-change approval |

## 4. Dependencies and critical path

The migration critical path is:

`B1 -> B2 -> B3 -> B4 -> B5 -> B6 -> B7 -> B8 -> B9 -> B10 -> B11 -> B12 -> B13 -> B14`

Lane A can close locally before B1-B7 complete. A3 and B14 must reconcile the
deployed authoring contract so that a temporary repair is not later mistaken for
the final V3 cutover. The existing conscious-agency task `t029` should receive its
own final completion review. Its planned `t030`-`t032` model-quality comparison
does not prove semantic migration and is not a predecessor to B1.

## 5. Validation strategy

Each B3-B6 slice must add focused behavioral tests before the next slice. B7 is
the first integrated local claim and must cover every accepted requirement
criterion with a traceability table. Tests must distinguish:

- source-cause correction from escape/detection checks;
- structural validity from semantic consistency;
- attempt, provider request, candidate, generation, and current-pointer identity;
- guidance effects from deterministic mechanical effects;
- current consumer compatibility from deferred future capabilities; and
- local/test-double evidence from live provider and production evidence.

Seal the accepted requirement as an explicit Cause of this plan. At each accepted
ADR or implementation slice, inspect `impact` before edits, link the exact sources
and verification evidence, review the stale frontier, reseal only reviewed
artifacts, and finish with `fsck`. Zero stale is not semantic approval.

## 6. Alternatives and tradeoffs

### One combined recovery task

This reduces planning overhead, but couples a small authoring fix to unresolved
architecture, paid model behavior, and production writes. Failures become harder
to attribute and approval boundaries become ambiguous. Not recommended.

### Permanent V2 compatibility reader first

This could restore the selector quickly, but directly conflicts with the accepted
objective and preserves dual meaning under V2. Rejected by the accepted baseline.

### Fully serial execution, including Lane A after migration design

This is simple to schedule but delays the independent new-character repair. It
offers no corresponding safety gain. Not recommended.

### Two coordinated lanes with staged migration

This restores the independently repairable creation path sooner and keeps every
irreversible or paid effect gated. It carries coordination cost at A3/B14 and a
larger test matrix. Recommended.

## 7. Risks and open design decisions

- The successor ADR package may need two records; the exact split is decided by
  reviewability and atomic consistency, not document size alone.
- Capsule retention, export, deletion, and sensitive-data treatment remain open.
- Qualified compiler, capability, fallback, provenance, prompt, response, and
  repair contract identities remain open.
- Retry count, token/cost ceilings, semantic-review independence, and model drift
  handling remain open.
- The exact deployment and production rollback route is not established by local
  tests.
- The frozen eight-generation manifest must be refreshed immediately before B9;
  the 2026-09-10 observation is historical evidence, not perpetual current state.
- Partial success is expected and must not be presented as restoration of all
  eight until B13 readback proves each target.

## 8. Plan acceptance and next action

If this plan is accepted, first update the delivery PERT and backlog with B1-B14
and explicit authority gates. Then execute A1 as the next local correction and B1
as the next architecture task. Plan acceptance does not accept the future ADR or
authorize A2/A3/B8-B14 effects.

Reasoning source:
`docs/evidence/character-semantic-migration-successor-plan-v1.think`.
CLI LLMThink audit: fatal 0, error 0, warning 0, info 1. The info finding retains
the open design and production proof obligations rather than weakening the plan.
