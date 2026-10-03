# 0048: V3 profile guidance source projection

- Status: Accepted
- Date: 2026-10-03
- Decision owner: Product owner; implementation authority is the explicit instruction to manually migrate all remaining characters through Grok CLI and register V3 revisions.
- Related: ADR0030, ADR0043, [manual migration evidence](../evidence/manual-grok-character-v3-migration-2026-10-03.md)

## Context

V2 permits natural-language action norms without selectors. Faithful V3 migration moves these to conscious guidance. The existing V3 profile adapter discards guidance, so a previously supported unchanged public description loses its supporting facts. Grok's independent review found this on the first migrated cat character. Fabricating an executable selector, weakening validation or storing the statement in an unrelated field would hide the defect.

## Decision drivers

- Preserve the meaning and public explanation of existing characters.
- Keep conscious guidance separate from executable action norms.
- Preserve explicit disclosure authority and reject private-source leakage.

## Considered options

1. Invent selectors or duplicate text in unrelated definition fields: rejected.
2. Skip claim validation: rejected.
3. Add a typed V3 profile projection with explicit guidance disclosure: selected.

## Decision

Add a shared V3 profile source projector that retains existing V3 profile-v2 facts and their ordering, then adds conscious-guidance statement facts only for unconditional public profile rules naming that guidance statement or its wildcard collection. The existing presentation/claim-receipt contract remains version2/version1 respectively; facts retain their canonical typed support references. Existing policies without guidance permissions produce exactly the previous projection.

Manual migration may copy an existing unconditional public action-norm statement permission to the exact guidance statement created from that source norm, using the model's source-accounting mapping. It must not grant a wildcard right to all guidance or expose description metadata. Legacy characters without such an existing permission receive no inferred public guidance permission. No pattern matching of natural language is involved.

The V3 candidate readiness validator uses this projector. Historical V2 validation and authoritative character definition schemas remain unchanged. Claims receive actual stateless model assessment against the resulting allowed facts; no successful receipt is fabricated.

## Consequences

### Positive

- Faithful guidance migrations can preserve supported public descriptions without fake mechanical behavior.
- The projection respects explicit public rights and can be consumed by future V3 authoring.

### Negative and risks

- Registration requires the deployed validator to understand the new explicit policy paths. Deployment must precede activation of affected candidates.
- Conditional disclosure remains excluded until a projection context can prove its prerequisites.

## Compatibility and migration

No database DDL or historical generation rewrite. Existing policies and projection digests remain stable. New migrated candidates bind the exact new policy and assessed projection digest. Existing battles continue using their immutable snapshots.

## Verification

Test an explicitly public statement, private/narrator/conditional denial, unchanged output without guidance permission, and real V3 candidate readiness with a guidance-backed public profile. Run focused tests, workspace typecheck/build, governed tests and static checks, then deployment smoke before registering affected characters.

## Implementation references

- `packages/shared/src/character-profile-v3.ts`
- `backend/src/services/character-authoring-candidate.ts`
