# Structured character cutover acceptance evidence

- Date: 2026-08-14
- Authority: ADR-0011 (`Accepted`)
- PERT task: `SDA_CHARACTER` (`done`)
- Scope: local implementation and verification only
- Excluded: deployment, release, bulk migration, and production operations

## Result

The bounded character cutover is complete. Runtime character authoring now
uses only V2 authoring attempts, and character definition or portrait changes
use only immutable V2 generations. Unsupported legacy characters fail closed
until the owner explicitly creates and confirms an upgrade candidate.

The additive `character_drafts` table remains in the database so this local
cutover does not perform destructive data deletion. Its runtime repository and
all route fallbacks were removed; a retained legacy row is neither read,
updated, confirmed, nor deleted by the application routes.

ADR-0011 operational state remains intentionally outside the immutable
definition boundary: visibility, battle records, improvement state, opponent
memory, and soft deletion keep their existing persistence paths. Character copy
also remains because it imports a new character into generation 1 rather than
mutating an existing generation.

## Route and persistence receipts

| Boundary | Receipt |
| --- | --- |
| V2 authoring lifecycle | Authenticated create, latest, chat, confirm, and discard routes operate on V2 attempts; confirmation activates generation 1. |
| Dormant legacy drafts | A seeded legacy draft is absent from latest and receives 404 from chat, confirm, and delete; its database row remains unchanged. |
| Legacy mutation rejection | Restore, portrait toggle, and portrait generation return 409 before an image-provider call, sheet update, or generation append. |
| Immutable portrait operations | Image generation, toggle, and restore each append exactly one V2 generation; replaying the same idempotency key appends none. |
| Explicit existing-character upgrade | The upgrade route creates an owner-review candidate while the character stays ineligible; owner confirmation activates generation 1 and makes it selector-eligible. |
| Selection and battle gates | Owner, search, random, and auto selectors exclude unsupported characters, and direct battle creation rejects unsupported player or opponent IDs. |

## Regression anchor

`backend/src/routes-structured-character-acceptance.test.ts` exercises the
authenticated HTTP routes against real SQLite persistence. LLM and portrait
provider calls use bounded injected fixtures; route, service, transaction,
idempotency, and projection behavior remain real.

## Validation

Run from the repository root:

```text
npm test
npm run typecheck
npm run build
perttool document check docs/structured-domain-assets.pert
git diff --check
```

Results:

- `npm test`: 489 tests passed
  - shared: 242;
  - backend: 229;
  - frontend: 15;
  - deployment worker: 3.
- `npm run typecheck`: passed for every workspace and the deployment worker.
- `npm run build`: passed for shared, backend, and frontend. Vite retained its
  existing non-blocking large-chunk warning.
- `perttool document check docs/structured-domain-assets.pert`: passed with
  existing milestone-acceptance advisory warnings.
- `git diff --check`: passed.

## Decision boundary

`SDA_CHARACTER` is complete locally, and the next PERT frontier is
`SDA_BATTLEFIELD`. This evidence does not authorize release, Stage, production
Promote, or bulk migration.
