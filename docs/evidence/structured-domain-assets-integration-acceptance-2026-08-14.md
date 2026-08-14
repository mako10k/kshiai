# Structured domain assets integration acceptance — 2026-08-14

- Scope: `SDA_INTEGRATION`
- Authority: Accepted ADR-0010 through ADR-0013
- Result: local integrated cutover acceptance complete
- Excluded authority: push, release, Stage, production Promote, eager migration,
  and production data cleanup

## Result

Characters, battlefield presets, and narration styles now share one closed
pre-public boundary. New battles select only accessible ready schema-2
generations, bind the exact generation IDs/digests and compiler contracts, and
continue from battle-owned snapshots after later asset revisions or deletion.
No selection, search, matchmaking, random, direct-ID, retry, resume, history,
replay, or observability path implicitly upgrades a selectable asset.

The final legacy cutover removed the unused narration V1 save/create/update and
fallback resolver contracts, removed the raw narration upsert request schema,
and removed the unused legacy snapshot constructor. Operational changes to an
unsupported character now update only its retained management row and append no
V1 generation. A maintained system battlefield read-model refresh always goes
through schema-2 import activation, including an immutable new generation when
the seed content changed.

## Integrated acceptance matrix

| Boundary | Runtime receipt |
| --- | --- |
| Two-stage authoring and explicit upgrade | The three family route suites retain structure-first generation, owner review/confirmation, partial-failure, idempotency, expiry, pointer-drift, and atomic activation coverage. |
| Selection and search | Owner character search, opponent search, battlefield search, and narration selectors admit the ready fixtures and exclude them after deletion. Existing family suites prove unsupported/upgrading/failed exclusion. |
| Matchmaking and random pools | Random and rating-based character matching return only a ready opponent; battlefield system refresh activates the exact ready schema-2 seed before it can enter the random pool. |
| Exact battle binding | One battle binds both character generations, the preset generation and deterministic instance, and the narration generation/compiled phase policy. Public battle DTOs contain none of the manifest, compiler, source digest, hidden coefficients, or raw style instruction. |
| Agents and narrator | Existing projection/consumer suites cover side-specific character inputs and perspective gates. The integrated receipt proves the prologue narration request uses the battle-bound phase instruction after the current style is revised and deleted. |
| Cross-generation edits | Character portrait, battlefield image, and narration policy each advance their current generation after battle creation while the stored battle manifest, battlefield instance, and narration snapshot remain byte-identical. |
| History, read, and replay | Asset deletion leaves `GET /battles/:id`, global history search, advance, and same-key advance replay operational from the immutable manifest and phase receipts. |
| Deletion and retention | Character deletion is an operational tombstone. Battlefield/style deletion removes the management read row. All three disappear from new selection while historical generations and battle-owned snapshots remain retained for existing battles. |
| Export | No raw source/definition export API is shipped; `/api/assets/export` is absent. The supported external serialization surfaces remain bounded management/public/battle/history DTOs. Adding private portability export is a separately reviewed product/API decision. |
| Internal observability | An ordinary owner receives the hidden-route 404. A developer can read the exact retained asset manifest after deletion, while agent state and frozen narration input are redacted and only their receipt digests remain in the canonical summary. |

## Regression anchors

- `backend/src/routes-structured-asset-integration.test.ts` exercises the real
  authenticated HTTP, SQLite, generation, battle, deletion, replay, history,
  and internal-observability seams for all three families.
- `backend/src/repositories/system-battlefield-seed.test.ts` proves a changed
  system read model cannot remain paired with an older ready generation.
- `backend/src/routes-structured-character-acceptance.test.ts`,
  `routes-structured-battlefield-acceptance.test.ts`, and
  `routes-structured-narration-acceptance.test.ts` retain each family's full
  authoring and incompatibility matrix.

## Validation receipt

- `npm run lint`: passed typecheck plus `jscpd` and `lizard`.
  - jscpd duplicated-line ceiling: `2.11%`;
  - Lizard current/baseline: CCN `121/121`, function length `67/67`,
    parameter count `5/5`; maxima and total excess also did not regress.
- `npm test`: passed — 517 tests total.
  - shared: 253;
  - backend: 246;
  - frontend: 15;
  - deployment worker: 3.
- `npm run build`: passed for shared, backend, and frontend. Vite retained its
  existing non-blocking large-chunk warning.
- `perttool document check docs/structured-domain-assets.pert`: passed with
  only the existing milestone-acceptance advisory warnings.
- `git diff --check`: passed.

## Decision boundary

`SDA_INTEGRATION` and the local structured-domain-assets PERT objective are
complete. This evidence grants no push, release, Stage, Promote, bulk migration,
or production cleanup authority.
