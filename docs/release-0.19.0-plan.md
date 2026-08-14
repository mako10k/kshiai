# v0.19.0 release plan

Status: local release acceptance passed. The feature merge is complete; the
release PR, immutable tag, Stage, Promote, and production evidence are not yet
claimed.

## Release intent

v0.19.0 completes the pre-public structured-domain-asset cutover across
characters, battlefield presets, and narration styles. Each family now uses a
validated immutable schema-2 generation, a disclosure-bounded public projection,
explicit two-stage authoring or upgrade, server-enforced selection eligibility,
and exact battle-owned snapshots. Character action norms and relationship seeds
also produce deterministic server-side receipts.

This is a minor release because it adds user-facing authoring and management
features, new persistence structures, and intentionally tighter pre-1.0 API and
selection contracts. It implements Accepted ADR-0010 through ADR-0013. Billing
remains design-only and deferred; no Stripe, entitlement, metering, catalog,
checkout, portal, or paid-route behavior is part of this release.

## Frozen release boundary

- Version and tag: `0.19.0` / `v0.19.0`.
- Releasable branch: `main`, after the release PR is squash-merged and all four
  required checks pass on the exact merged SHA.
- Stage configuration remains `narration_guarded`, dialogue projection override
  `none`, and battle pacing `candidate-12-v2`.
- Stage must build the backend and Worker from one exact annotated tag and retain
  the immutable image digest, no-traffic Cloud Run revision, and Worker version.
- Migrations `0018_structured_battlefield_assets.sql` and
  `0019_structured_narration_assets.sql` are additive and perform no eager
  inference, bulk upgrade, or destructive cleanup.
- Promote and all production traffic changes remain later protected actions.

## Acceptance

- Root, shared, backend, and frontend versions plus the lockfile are exactly
  `0.19.0`.
- The integrated HTTP and repository suites prove two-stage authoring, explicit
  upgrade, atomic activation, idempotency, expiry, pointer drift, privacy,
  eligibility, exact generation binding, immutable replay, deletion retention,
  and bounded internal observability across all three asset families.
- Character rule receipts prove deterministic priority, inhibition, exception,
  and exact logical-character relationship precedence without prompt authority.
- `npm test`, `npm run typecheck`, `npm run build`, `npm run lint`, and
  `git diff --check` pass. `npm run lint` includes both `jscpd` and `lizard`.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact commit
  merged to `main`; the annotated `v0.19.0` tag resolves to that commit.
- Stage applies or confirms migrations `0017` through `0019`, passes the exact
  LLM-free narration and provider-accounting fixtures, and verifies health,
  PostgreSQL, Cloud Tasks OIDC, protected direct origin, authentication, SSE,
  R2, the staging edge, and the immutable Worker preview.
- Stage is infrastructure and migration evidence only. Before any Promote,
  separately read back bounded owner/operator flows showing that unsupported
  character, battlefield, and narration assets remain manageable but excluded;
  explicit upgrade candidates remain ineligible before acceptance; and accepted
  ready generations alone become selectable and bind to a new battle.

## Database, compatibility, and rollback

Migration `0018` adds battlefield compatibility state and authoring-attempt
records. Migration `0019` adds the equivalent narration-style records. They are
forward-only and additive. Existing owner assets remain unsupported until an
explicit upgrade succeeds; maintained system battlefield seeds activate through
the schema-2 import path.

Application rollback does not roll back migrations `0017` through `0019` or
delete immutable asset generations and authoring evidence. If Stage or a later
production smoke finds an authoring, eligibility, or binding fault, stop new
asset activation and traffic progression, preserve the evidence, and issue a
new patch version after correction. Do not move or delete `v0.19.0`.

## Local evidence

- `npm test`: 520 tests passed across shared, backend, frontend, and deployment
  workspaces.
- `npm run lint`: passed typecheck, `jscpd`, and `lizard`; all configured
  duplication and complexity baselines remained within their frozen ceilings.
- `npm run build`: passed shared, backend, and frontend production builds with
  only the existing non-blocking Vite large-chunk warning.
- `npm run build:worker`: passed the Wrangler deployment dry-run.
- `node scripts/check-npm-audit.mjs`: reported no advisories.
- Both PERT documents passed validation with only their existing non-blocking
  milestone-acceptance advisories; `git diff --check` passed.

## Evidence sources

- [`evidence/structured-domain-assets-integration-acceptance-2026-08-14.md`](evidence/structured-domain-assets-integration-acceptance-2026-08-14.md)
- [`evidence/structured-character-rule-receipts-2026-08-14.md`](evidence/structured-character-rule-receipts-2026-08-14.md)
- [`evidence/structured-battlefield-cutover-acceptance-2026-08-14.md`](evidence/structured-battlefield-cutover-acceptance-2026-08-14.md)
- [`evidence/structured-narration-cutover-acceptance-2026-08-14.md`](evidence/structured-narration-cutover-acceptance-2026-08-14.md)
