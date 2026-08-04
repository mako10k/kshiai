# Release 0.5.0 plan — observer-relative battle perception

Date: 2026-08-04
Branch base: `wip/perception-consumers-20260804` (must be rewritten before merge)
Target version: `0.5.0` (minor feature release on top of `0.4.0`)

## Scope

Ship observer-relative battle perception end-to-end:

1. Qualitative self and counterpart effect/reserve cues without raw totals
2. Multi-modal anonymous contacts and identity knowledge
3. Character agents consume frozen perception frames only
4. Perspective-safe narration views with deterministic ID containment
5. Legacy battle seeding and failure/privacy compatibility

Out of scope for 0.5.0:

- Live XAI re-evaluation of prompt topology (v10 combined remains accepted)
- Migrating prologue/aftermath narrator contracts to `NarrationTurnView`
- OpenAI promotion or topology change
- Database migration (perception fields live in existing battle JSON)

## Work sequence

| Step | Task | Status |
| --- | --- | --- |
| 1 | Finish `T_CONSUMERS` review decisions and wiring tests | done |
| 2 | Finish `T_COMPAT` legacy seed, failure, non-leakage | done |
| 3 | `T_ACCEPT`: acceptance matrix, typecheck, test, build, PERT | done |
| 4 | Rewrite WIP history into focused non-WIP commits | pending |
| 5 | `release/0.5.0`: version bump, CHANGELOG, PR | pending |
| 6 | Required checks + staging smoke + production promote | pending |

## Acceptance checklist (`T_ACCEPT`)

- [x] Combined topology evidence remains the accepted XAI configuration
- [x] New battles start with unknown counterpart identity
- [x] Legacy battles without frames seed identified counterparts
- [x] Absolute/relative/reserve bands remain server-only
- [x] Counterpart name/condition appear only at permitted knowledge levels
- [x] Anonymous contacts never expose canonical source sets in frames/public DTOs
- [x] Every narration perspective omits forbidden IDs after repair
- [x] Provider and projection failure keep engine cues; no fabricated sensory facts
- [x] `npm test`, `npm run typecheck`, `npm run build` pass
- [x] `perttool document check docs/battle-perception.pert` passes
- [x] CHANGELOG Unreleased entries drafted for 0.5.0

### Validation evidence (2026-08-04 continuation)

```text
npm run typecheck  # shared, backend, frontend, deployment
npm test           # shared + backend + frontend + deployment all pass
npm run build      # shared, backend, frontend (Vite >500kB warning only)
perttool document check docs/battle-perception.pert  # OK; PTDAG-208 closure notices only
```

No new live XAI billed call was required for acceptance of the consumer/compat
boundary; the existing v10 combined topology registry remains authoritative.

## Release notes draft (for CHANGELOG)

### Added

- Observer-relative perception frames with qualitative impact and reserve cues
- Bounded private contact registries and multi-modal sensory evidence
- Perspective-specific narration views with deterministic identifier redaction
- Character-agent consumption of frozen self-labelled frames

### Changed

- Character agents no longer receive unconditional foe names, canonical cognition,
  or shared semantic observations as action authority
- Normal-turn narration is driven by a derived perception view

### Operations

- No database migration; existing battle JSON gains optional perception fields
- Active legacy battles seed identified counterparts on load
- Application rollback remains compatible: prior revisions ignore new fields

## History rewrite rule

Do not merge commit `WIP: Integrate perception consumers and add handoff`.
After acceptance, fold the transfer checkpoint into clean history:

```sh
git rebase -i 51afb9a
# or amend if still a single tip commit
git push --force-with-lease origin wip/perception-consumers-20260804
```

Open a normal PR into `main` (or `release/0.5.0` first) only after rewrite and
full validation. Follow [`release_process.md`](release_process.md).
