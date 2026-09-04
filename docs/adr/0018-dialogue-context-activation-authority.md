# ADR-0018: Establish dialogue-context activation authority and immutable receipts

- Status: Accepted
- Date: 2026-09-03
- Decision owner: Product and release owner
- Canonical draft: [`0018-dialogue-context-activation-authority.think`](0018-dialogue-context-activation-authority.think)
- Acceptance evidence: On 2026-09-04, the owner approved the authoritative
  `.think` revision with SHA-256
  `b2f9ab7050db187117b508dea553e7c29c0e9e3e63c0f71c931b6393deb7ca1c`
- Current-main basis: `4d446e4e4459114dab9ac87ba2589040814224b4`
- Related: `docs/evidence/dialogue-activation-authority-audit-2026-09-03.md`; `docs/dialogue-activation-focus-recovery.pert`

This Markdown file is the human-readable projection of the Accepted LLMTHINK
record. The same-basename `.think` file is authoritative. Acceptance authorizes
only the bounded local implementation and regression tests described below.

## Context

Compact dialogue is implemented, but the effective projection for a newly
created battle can currently come from three places: the persisted global
operator setting, the runtime `legacy` default when that row is missing, or a
revision-local deployment override. Creation freezes the effective value into
the battle, but the retained receipt does not say which source supplied it.

That omission makes an effective `compact` or `legacy` snapshot insufficient to
distinguish normal product activation from an isolated release experiment. It
also encourages plan drift when implementation, activation, observation, and
adoption are treated as one state.

## Decision drivers

- Preserve one immutable dialogue projection for the lifetime of a battle.
- Give normal product activation one explicit owner.
- Keep a narrowly authorized Stage override from becoming ordinary production
  policy.
- Preserve existing battles, mechanics, narration, provider behavior, and
  privacy.
- Make retained evidence identify both the effective value and its authority
  source.

## Considered options

1. Code default as normal authority. This cannot express an audited operator
   choice and only fits the missing-setting fallback.
2. Deployment environment as normal authority. This conflates release
   configuration with product policy and creates dual authority.
3. Per-battle selection. This introduces an unrequested product and privacy
   surface.
4. Persisted operator setting as normal authority, with a separately gated
   Stage-only override. This is the accepted option.

## Decision

- The persisted global dialogue-pipeline setting is the sole normal authority
  for new battles. The `legacy` code default applies only when that setting is
  absent.
- A deployment override can supersede it only on an explicitly authorized,
  immutable, isolated Stage revision for one bounded observation. It is absent
  from ordinary production releases and authorizes neither Promote nor a
  persisted setting write.
- Every new battle binds an immutable activation receipt with:

  - effective projection mode;
  - source enum: default, persisted setting, or deployment override;
  - persisted settings revision and generation content identity; and
  - for an override, deployment commit and immutable artifact or revision
    identity.

- Prologue, combat turns, and aftermath consume the battle-owned receipt without
  rereading mutable activation inputs.
- Existing snapshotted battles remain unchanged. Legacy battles without a
  snapshot retain the compatibility fallback and remain source-unknown; there
  is no backfill or migration.
- Character focus remains a separate decision and does not enter product
  expression through this ADR.

## Compatibility and migration impact

The schema addition applies only to new battles after implementation.
No existing battle, public DTO, deterministic mechanic, rating, world state,
narration authority, provider-call count, retry rule, or privacy boundary is
changed. Rollback means creating later battles through the prior code path; it
does not rewrite already-bound battle receipts.

## Authority boundary

This ADR authorizes only local wiring and regression tests for the accepted
contract. It does not select `compact` in the
persisted setting, deploy, dispatch Stage, call a provider, Promote, observe
production, or change character focus. Those remain separately gated actions.

## Open integration condition

Verified current `main` already uses ADR-0015 through ADR-0017, so this record
uses ADR-0018. The namespace was rechecked unchanged on 2026-09-04. Before
integration, port this pair onto a current-main-based worktree and reconcile the
audit branch's divergent ADR-0015. Do not merge duplicate ADR identities.

## Verification required for implementation

- Default, persisted-setting, and Stage-override precedence tests.
- Direct-create and normal API create paths bind the same receipt.
- Later global-setting and deployment changes do not alter an existing battle.
- Legacy missing-snapshot behavior remains compatible and source-unknown.
- The override receipt binds the exact deployment identity.
- No difference to mechanics, public state, narration authority, provider
  calls, retries, or focus expression.
