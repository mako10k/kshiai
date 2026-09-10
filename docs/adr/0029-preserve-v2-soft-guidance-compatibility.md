# ADR-0029: Preserve already-ready V2 soft-guidance compatibility

- Status: Rejected
- Date: 2026-09-10
- Decision owner: Product owner
- Revision: 2
- Authoritative record: [same-basename think](0029-preserve-v2-soft-guidance-compatibility.think)
- Rejected proposal baseline: [requirement revision 1](../character-v2-compatibility-requirements-v1.md)
- Disposition authority: [accepted requirement revision 6](../character-v2-compatibility-requirements-v6-acceptance.md)
- Successor: [ADR-0030](0030-llm-assisted-character-semantic-migration.md)
- Related: ADR-0010, ADR-0027, [current RCA](../character-authoring-selection-rca-2026-09-10.llmthink.dsl), [rc8 RCA](../rc8-compact-first-live-rca-2026-09-08.md)

## Context

Revision 2 records disposition only. The revision-1 direction below is retained
as historical proposal content, but it is not implementation authority. The
accepted requirement revision 6 rejects a permanent V2 compatibility reader,
and the owner accepted the recommended plan to mark this proposal Rejected and
create a new numbered successor ADR.

Production has nine character generations whose persisted state points to an
exact `ready` V2 generation. A later selector rule, added without changing the
V2 schema or compiler version, now reevaluates eight as unsupported. The match
API consequently returns only Takumi. The eight generations contain twenty-one
selectorless soft `prefer` entries and no selectorless constraint.

The fields also expose terminology debt. Those old entries are stored under
`actionNorms`, but without a selector they cannot select, rank, or constrain an
action. Their only coherent prior effect is awareness-gated guidance supplied to
the character's conscious judgment.

## Decision drivers

- Preserve the meaning of already-activated immutable V2 generations.
- Keep new authoring strict and prevent invented action selectors.
- Keep conscious guidance out of non-deliberative psyche state.
- Restore usable characters without rewriting production generations.
- Keep unsupported legacy/no-state characters outside new battles.

## Considered options

1. Keep all selectorless V2 generations unsupported and require regeneration.
   This preserves current strictness but retroactively changes already-ready V2.
2. Preserve selectorless soft entries as legacy conscious-only guidance for the
   exact already-ready generation, while requiring selectors for new activation.
3. Rewrite immutable generations or infer selectors. This invents behavior and
   violates the generation contract.

## Rejected proposal

Revision 1 proposed option 2. That option is now rejected.

An executable action norm has at least one structured selector. An already-ready
V2 entry with no selectors may be interpreted only as `legacy conscious-only
guidance` when it is a soft `prefer` with `preference` or `commitment` force. Its
statement may enter conscious judgment according to its clauses and awareness,
but it cannot rank, exclude, force, or fabricate an action. Selectorless
constraints remain invalid.

Persisted V2 compatibility validation and new-activation readiness become
separate functions. The former permits this exact bounded legacy interpretation;
the latter continues to reject all selectorless action norms. Eligibility also
requires the persisted state to point to that exact already-ready generation.
A read never changes state or generation bytes.

## Consequences

### Positive

- The eight observed ready V2 characters can return to match selection.
- New authoring remains structurally strict.
- Legacy conscious guidance is not misrepresented as an engine constraint or
  moved into psyche.
- No production generation is rewritten.

### Negative and risks

- The old storage field keeps a qualified compatibility meaning until those
  generations are explicitly migrated.
- The restored characters retain conscious guidance that does not mechanically
  prefer an action; this must be visible in tests and terminology.
- Sixteen no-state legacy characters remain unsupported.

## Compatibility and migration

No persisted bytes, generation pointers, old battle manifests, or compiler IDs
are rewritten. The compatibility branch applies only to an exact current
generation already marked ready. New create, revision, upgrade, restore, and
derived activation require at least one selector per action norm.

A future dedicated conscious-principle field and an explicit migration to it are
outside this ADR.

## Verification

- Restore selection and battle binding for an already-ready soft-selectorless
  V2 fixture.
- Keep selectorless constraints and non-ready generations rejected.
- Prove legacy statement changes do not alter ranked/excluded actions.
- Prove new activation rejects any selectorless action norm.
- Run `npm run adr:check`, focused and full tests, typecheck, duplication, Lizard,
  and Sealgraph impact/readback after acceptance.

## Implementation references

- `packages/shared/src/structured-character.ts`
- `packages/shared/src/character-definition-rules.ts`
- `backend/src/repositories/character-assets-v2.ts`
- `backend/src/repositories/character-assets-v2.test.ts`
- `backend/src/routes-structured-character-acceptance.test.ts`

## Review

The owner did not accept this implementation direction. ADR-0030 is the proposed
successor. This rejected record authorizes no implementation, provider call,
commit/push, release, deployment, or production data change.
