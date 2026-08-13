# Structured character P2 implementation checkpoint

- Date: 2026-08-13
- Authority: ADR-0011 (`Accepted`)
- PERT task: `SDA_CHARACTER` (`active`)
- Scope: local implementation and verification only
- Excluded: deployment, release, bulk migration, and production operations

## Achieved in this checkpoint

- Added strict shared `CharacterDefinitionV2`, disclosure, generation-envelope,
  compatibility, authoring-attempt, and battle compiler-input contracts.
- Added deterministic public-profile, deep-psyche, conscious-self,
  counterpart-relation, legacy-upgrade, and transitional read-model projectors.
- Removed raw `interior` and stable latent disposition from the conscious
  expression provider boundary; the private psyche stage retains them.
- Added SQLite and PostgreSQL persistence for compatibility state and
  owner-scoped authoring attempts.
- Added digest-bound create, revision, and explicit upgrade attempts with an
  owner-acceptance hold and compare-and-swap current-generation activation.
- Kept existing legacy characters unsupported and unselectable. An explicit
  owner upgrade can start even when the legacy row predates generation records.
- Added management compatibility state and the
  `このキャラを最新版に更新` action, while match and opponent selection filter
  for ready V2 characters.
- Bound new battles to the exact ready V2 generation, digest, and frozen
  compiler inputs without writing a character generation during battle start.
- Cut V2 portrait generation, portrait toggle, and one-step restore over to new
  immutable generations with owner binding, idempotency keys, expected-current
  compare-and-swap activation, and history-derived management controls. Local
  portrait files now use revision-specific URLs; R2 already returns immutable
  object URLs. V1 retains its legacy snapshot and portrait-slot behavior.
- Applied duplicate-name checks to revisions and upgrades while excluding the
  character's own current names from the reserved-name set.
- Added an independent bounded material-claim validator after profile
  generation. It receives only the approved public projection and segmented
  candidate profile, never the owner source or restricted character definition.
- Stored a digest-bound per-segment claim-validation receipt and made it a
  required compiler artifact for every ready V2 generation. Unsupported claims,
  undeclared support references, accepted high-risk claims, segment drift,
  validator failure, and profile prose outside the validated segments all fail
  closed before preview or activation.
- Reclassified pre-validator V2 generations as unsupported. They remain visible
  to the owner with the explicit update action, but are absent from ready reads
  and battle selection until a newly validated generation is accepted.
- Added deterministic external, self-inner, and omniscient narrator compilers.
  New battles freeze all three projections from each exact character generation,
  and every narration phase selects the permitted view from the battle-bound
  manifest without rereading the mutable character.
- Added grounded observable-manifestation proposals to the private psyche and
  expression boundary. A proposal becomes a turn event only when it cites exact
  observer-packet events and the character realizes it through a committed
  expression carrier; observer evidence inherits the carrier's access while
  replacing carrier wording with bounded manifestation wording.
- Added committed manifestation cues to narrator inputs. Static projection data
  remains rendering context rather than a new event, and dynamic cues enter only
  after event commitment and perception-evidence gating.
- Added an appearance-only image compiler. V2 portrait prompts receive only the
  appearance projection plus the explicit visual adjustment, excluding identity
  history, latent disposition, relationships, capabilities, equipment, and live
  psyche state.
- Added A/B swap regressions for the manifestation boundary and focus-aware
  narrator consumer regressions for both character sides.

## Verification evidence

Commands run from the repository root:

```text
npm test
npm run typecheck
npm run build
git diff --check
```

Results:

- shared: 235 tests passed;
- backend: 218 tests passed;
- frontend: 15 tests passed;
- deployment contract: 3 tests passed;
- all workspace type checks passed;
- shared, backend, and frontend builds passed;
- patch whitespace validation passed.

Focused regressions cover schema/reference rejection, disclosure of static
psyche descriptions without numeric dynamics, self-awareness, exact-target
relationship projection, owner-confirmed atomic activation, idempotent
activation replay, legacy rows without generation records, ready-only battle
binding, frozen compiler inputs, provider-boundary exclusion of raw psyche,
immutable portrait history, generation restore, owner isolation, and stale
generation-token rejection. Claim-validator regressions additionally prove the
source/definition exclusion boundary, exact segment coverage, projection-digest
binding, restricted support-ref rejection, fail-closed provider behavior,
rejection before an activatable envelope exists, and exclusion of pre-validator
V2 generations. The 56 focused projection regressions additionally cover all
three narrator perspectives, exact-generation narrator binding, appearance-only
image input, proposal-to-commit manifestation gating, carrier-access projection,
focus-aware narrator consumption, and A/B structural symmetry.

## Unmet acceptance scope

`SDA_CHARACTER` remains active. The following ADR-0011 verification or cutover
work is not proved by this checkpoint:

1. implement deterministic action-norm conflict and relationship precedence
   receipts, including the legal fallback path;
2. add expiry, concurrent pointer drift, partial-failure, route-level selector,
   and direct-battle rejection integration tests;
3. remove the remaining legacy draft/direct-mutation fallbacks after the V2
   authoring path has equivalent coverage.

## Next frontier

The next coherent slice is deterministic action-norm conflict and relationship
precedence: produce a bounded receipt, prove the legal fallback path, and keep
the same decision under A/B swap. Do not mark `SDA_CHARACTER` finished until all
required verification in the accepted design is satisfied.
