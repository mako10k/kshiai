# ADR-0010: Use a common immutable envelope for selectable assets

- Status: Accepted
- Date: 2026-08-13
- Decision owner: Product owner
- Supersedes: ADR-0003
- Related: `SDA_ENVELOPE_DESIGN` in `docs/structured-domain-assets.pert`;
  `docs/structured-asset-envelope-design.md`;
  `docs/structured-domain-assets-current-inventory.md`; ADR-0003

## Context

Characters, battlefield presets, and narration styles are all editable and
selectable, but today each family mixes several concerns in one current JSON
row. Structured battle input, public presentation prose, private or internal
fields, and free-form LLM instructions have no common disclosure or
compatibility contract. Generation generally creates structure-like fields and
public prose in one provider operation.

The repository already records immutable generations and battle manifests.
However, the generic generation payload is untyped, append and current-pointer
activation are one operation, and current rows have no readiness state. Selection
queries therefore cannot exclude schema/compiler-incompatible assets. Battle
creation currently calls the write-and-activate generation operation for selected
characters, narration style, and battlefield preset. In some cases it writes a
different snapshot shape than authoring, so merely starting a battle can append a
generation and move an asset's current pointer.

The accepted product workflow now requires natural source to structured
definition to derived public description, explicit owner-triggered upgrade, and
server-side exclusion of unsupported objects. A shared architectural boundary is
required before implementing the character, battlefield, and narration schemas.

## Decision drivers

- Keep mechanics, knowledge, perspective, privacy, and presentation authorities
  separate without discarding expressive descriptions.
- Make two-stage model generation retryable and atomically activatable.
- Prevent selection and battle creation from mutating authored assets.
- Bind new battles to exact compatible generations as required by ADR-0003.
- Allow owners to manage pre-public legacy assets without allowing those assets
  into battle selection.
- Enforce target-, channel-, consumer-, and runtime-knowledge projection in
  server code rather than prompts.
- Give P2-P4 one lifecycle contract while leaving their domain schemas free to
  evolve independently.

## Considered options

1. Extend each mutable current row independently and continue creating missing
   generations at battle start. This is a small local change, but preserves
   divergent lifecycle rules, cannot guarantee atomic two-stage activation, and
   lets a read/selection path mutate asset identity.
2. Store one generic JSON document per generation and describe disclosure and
   consumer behavior in prompts. This preserves expression, but makes privacy
   and knowledge gates nondeterministic and prevents reliable eligibility tests.
3. Add a common immutable envelope, persisted authoring attempts, server-owned
   projection compilers, explicit compatibility state, atomic activation, and
   read-only battle binding. This has the largest P1 cost but supplies one
   enforceable lifecycle and privacy boundary for all asset families.

## Decision

Choose option 3.

Every selectable character, battlefield preset, and narration style will use a
stable logical asset ID and immutable `AssetGenerationEnvelopeV2`. A ready
generation contains a validated asset-specific structured definition,
schema-bounded disclosure policy, a stored public description derived from the
frozen natural source plus display-safe projection, source and generator
provenance digests, projection/compiler versions, and canonical content digest.
The structured definition is authoritative; the public description is not a
runtime rule source.

Authoring is a persisted idempotent state machine. Structure generation and
validation finish before description generation. Only a transaction that
rechecks the attempt's expected current generation may append the complete
envelope and move the current pointer. Failure leaves the existing pointer
unchanged. No provider call runs under the activation transaction.

The exact management compatibility states are `unsupported`, `upgrading`,
`upgrade_failed`, and `ready`. Initial creation failures exist only as failed
attempts because no logical asset becomes visible before successful activation.
Management views include owner-accessible incompatible assets and their upgrade
affordance. Selection queries, searches, opponent/random pools, and battle
creation accept only accessible `ready` generations that satisfy all required
compiler versions.

Disclosure uses four intersecting server-side gates: schema ceiling, value
target/channel allowlist, registered consumer contract, and runtime
knowledge/self-awareness/perspective evidence. Ceilings are `required_public`,
`public_eligible`, and `restricted`. Rules are allow-only/default-deny, use stable
logical target IDs or registered relationship roles, and cannot widen a schema
ceiling. Bounded descriptions remain available to named consumers but cannot
create or override authoritative mechanics.

Battle creation reads and binds the exact ready current generations and compiler
outputs. It never appends or activates a selectable-asset generation. A concrete
battlefield instance remains a distinct battle-owned immutable artifact. An
explicitly requested unavailable narration style fails rather than silently
falling back; omission may select an eligible default.

Legacy selectable rows remain owner-manageable but are `unsupported` until an
explicit latest-version action succeeds. Upgrade uses the existing displayed
description as its natural source plus only defined deterministic legacy-field
mappings. There is no eager bulk inference, implicit battle-time conversion, or
permanent legacy selection path. Existing battles retain their recorded legacy
manifests and are never silently rebound.

The detailed logical schemas, transaction sequence, and verification matrix are
normative in `docs/structured-asset-envelope-design.md`. This decision closes the
P1 design milestone. The first common implementation is scheduled with P2 and
still requires an accepted character-schema ADR. Asset-family schemas are not
pre-accepted here.

## Consequences

### Positive

- One lifecycle handles create, explicit upgrade, eligibility, and binding for
  all selectable assets.
- Public prose can remain expressive without becoming a mechanics or privacy
  authority.
- Unsupported pre-public objects are recoverable from management while stale
  clients cannot force them into battles.
- Battle creation becomes a read-and-bind operation for authored assets.
- Idempotency, provider failures, pointer conflicts, and compiler compatibility
  become observable and testable.

### Negative and risks

- P1 requires new attempt and compatibility persistence plus repository/API
  separation before visible character work begins.
- Two model stages increase authoring latency and provider use.
- Factual-support validation for expressive public descriptions will sometimes
  reject acceptable prose and needs family-specific tuning.
- Temporary read models create dual-write risk during P2-P4, so P5 must remove
  or freeze every bypass before launch.
- Existing system seeds must be rebuilt or imported into ready envelopes; row
  existence alone will no longer make them selectable.

## Compatibility and migration

- Existing battles and their version-1 manifests remain readable and use their
  embedded immutable snapshots. They are not assigned invented version-2 asset
  generations.
- Existing current character, battlefield, and narration rows become
  `unsupported` for new selection until explicitly upgraded or rebuilt.
- Owners/operators retain detail, delete, and upgrade access to unsupported and
  failed assets.
- Successful explicit upgrade appends a version-2 generation and moves only that
  logical asset's current pointer. Failure preserves the old pointer.
- The current mutable tables may temporarily serve as read models, but
  version-2 current generations own readiness and battle binding.
- On acceptance, this ADR refines ADR-0003's new-battle binding implementation
  and replaces its selectable-asset legacy continuation option for the
  pre-public cutover. ADR-0003's immutable historical binding remains in force.

## Verification

- Authoring order, partial-failure, idempotent retry, and concurrent-pointer
  conflict tests pass for the generic attempt/activation contract.
- Projection tests cover all four gates, stable target IDs, two-target variance,
  restricted-field non-leakage, narrator perspective, observer knowledge, and
  character self-awareness.
- Management lists retain unsupported/upgrading/failed assets while every
  selection and direct battle path excludes them server-side.
- Battle creation performs no selectable-asset generation write, binds exact
  ready generation IDs and compiler versions, and never substitutes an
  explicitly selected style.
- Editing or upgrading after battle creation cannot change retry, resume,
  narration, history, or replay inputs.
- System seeds and legacy current rows cannot bypass version-2 activation.

## Implementation references

- [Detailed design](../structured-asset-envelope-design.md)
- [Current-state inventory](../structured-domain-assets-current-inventory.md)
- [Accepted product workflow](../structured-asset-authoring-workflow.md)
- [Information projection direction](../structured-asset-information-projection-design.md)
- `backend/src/repositories/asset-generations.ts`
- `backend/src/services/battle-service.ts`
- `packages/shared/src/battle.ts`
