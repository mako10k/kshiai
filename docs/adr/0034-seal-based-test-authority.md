# ADR-0034: Require Seal-based authority for current test evidence

- Status: Accepted
- Revision: 1
- Date: 2026-09-16
- Decision owner: Product owner
- Related: `scripts/test-authority.mjs`,
  `scripts/test-authority-inventory.json`, and
  `docs/evidence/test-authority-inventory-2026-09-15.md`

## Context

The repository's current test selector distinguishes a bounded set of tests with
SealGraph verification REFs from tests outside that inventory. It disables an
inventoried test when its REF or source binding is missing, its workfile differs from
the sealed source, or its verification chain is stale. Tests outside the inventory
are still executed as `ungoverned`, with only a warning that their results are not
SealGraph validity evidence.

That behavior does not implement the owner's current policy. A test without a Seal
does not state an adequate basis. A sealed test is evidence only for the exact basis
identified through its Seal and Cause Links. If that basis later becomes stale or
progresses to a new revision, the old test is not current evidence for the new basis,
although its immutable Seal remains historical evidence for the original basis.

## Decision drivers

- Prevent an aggregate green test run from presenting unsealed tests as authoritative
  current evidence.
- Preserve the direction from governing authority to downstream verification.
- Make upstream progress observable without destroying historical evidence.
- Preserve test files for later grounding, repair, or diagnostic use.

## Considered options

1. Keep executing unsealed tests in the authoritative aggregate and warn that they are
   ungoverned. This preserves broad execution but mixes non-evidence with current
   evidence in one pass/fail result.
2. Treat a verification Seal as permanently current. This preserves a stable test set
   but lets a test for an older basis appear to verify a newer one.
3. Require a source-matched verification Seal with explicit Cause Links, and require
   its dependency chain to be current for the claim being evaluated. Proposed.

## Decision

A test is valid evidence for a current claim only when all of these conditions hold:

1. The test is mapped to an existing `verification/*` REF.
2. The REF head Seal is locally source-bound to that exact test file.
3. The workfile bytes match the content of that verification Seal.
4. The verification Seal has at least one explicit Cause Link identifying its
   governing basis.
5. The verification Seal and every required Cause path are not stale relative to the
   current REF heads relevant to the claim.

If any condition is absent, the authoritative repository test selector disables that
test. The test file is not deleted. It may be run only as explicitly non-authoritative
diagnostic work, and that result must not be cited as current pass or fail evidence.

When a Cause becomes stale or its REF progresses, the verification does not carry
forward to the newer basis. The immutable old verification Seal remains valid
historical evidence for the exact original Cause generation. It is neither rewritten
nor deleted. A new current claim requires review and a new downstream verification
Seal against the applicable basis.

This decision is accepted for exact ADR-0034 revision 1.

## Consequences

### Positive

- The authoritative aggregate reports only tests with an explicit, current basis.
- A passing test cannot silently inherit authority from a later requirement, design,
  or implementation revision.
- Historical evidence remains inspectable at its original immutable Seal.

### Negative and risks

- Most existing repository tests become disabled until their basis is reviewed and
  sealed; this reduces current authoritative coverage rather than pretending it exists.
- Explicit diagnostic commands are needed when an unsealed test is still useful for
  investigation.
- Creating Seals mechanically without reviewing Causes would satisfy syntax but not
  semantic authority, so resealing must remain a separate evidence-bearing action.

## Compatibility and migration

No test file or historical Seal is migrated or deleted. The behavior change is in the
authoritative selector: inventory misses change from active `ungoverned` execution to
disabled `unsealed` status. Existing source-diverged and stale tests stay disabled.
Existing current verification Seals remain eligible only if they also have explicit
Cause Links.

## Verification

- Selector regression coverage proves an unlisted test is disabled as `unsealed`.
- Selector regression coverage proves missing Cause Links disable a sealed test as
  `missing_basis`.
- Existing source mismatch, source divergence, and direct/transitive stale coverage
  remains in force.
- Inventory readback identifies every discovered test as either current evidence or
  disabled with a specific reason.
- The selector's own regression test is source-bound and sealed downstream of this
  accepted decision before its result is cited as current evidence.

## Implementation references

- `scripts/test-authority.mjs`
- `scripts/test-authority.test.mjs`
- `scripts/test-authority-inventory.json`
- `docs/evidence/test-authority-v2-action-plan-2026-09-16.think`

## Review and acceptance

On 2026-09-16, immediately after exact ADR-0034 revision 1 and its complete Japanese
review translation were presented, the product owner replied
`ACCEPTします。計画を再検討`. The reviewed pre-acceptance authoritative `.think`
SHA-256 was
`8602baf182a786e28d16a87c4cce707bc3b904a746e0b668851587ada65ebbdc`.

The plan must be reconsidered before selector implementation. This acceptance does not
authorize bulk resealing, commit, push, provider calls, deployment, migration,
activation, or production change.
