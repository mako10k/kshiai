# Dialogue expression state and history requirement v3 review

- Review status: Completed
- Lifecycle step: Step 3 independent review
- First-owner route: `REVIEW`
- Subject: `docs/dialogue-expression-realization-requirement-v3.md`
- Subject SHA-256:
  `b5c7f96f1e2d73d2bed4f3356f703942bed4c3c68414e7f06889c56dbad4c265`
- Review input:
  `docs/dialogue-expression-realization-requirement-review-input-v3.md`
- Review-input SHA-256:
  `b681307115327c9722724688b818dc205630f59530d2ec32a623311bb5a6e255`
- Repository basis: `1dd12c03551f56086ed5ef81b562a402bb61f2d8`
- Date: 2026-09-08

## Coverage

The review compared the unchanged subject with:

- the product outcome stated in the candidate;
- `docs/requirements.md` at the candidate's recorded digest, especially
  F-BTL-13, F-BTL-15, F-BTL-37, and F-BTL-48;
- Accepted ADR-0004, ADR-0008, ADR-0018, and authoritative ADR-0024;
- the existing dialogue-pipeline immutable binding, Compact LLM contracts,
  battle revision compare-and-save, and provider construction as
  non-normative feasibility evidence; and
- all five questions in the owner-reviewed v3 review input.

The candidate bytes were not edited during review. Command-line LLMThink
audited the review reasoning with zero fatal, error, or warning findings.

## Findings

### Contradictions with the requirement or authoritative source

None found.

- The candidate preserves F-BTL-15, F-BTL-37, and F-BTL-48 responsibility,
  canonical-utterance, observer-projection, and narrator-separation rules.
- It explicitly revises only the new-Compact disposition of F-BTL-13 by
  removing completed speech from semantic state and new writes while retaining
  old-policy readability.
- Its state/history/output split, content-independent acceptance, existing
  revision boundary, absence of new lifecycle identity, compatibility, and
  closed-schema rules match Accepted ADR-0024.
- No clause makes correctness depend on text inequality, normalization,
  similarity, or a model-declared reason for repetition.

### Evidence gaps or unresolved unknowns

#### E1 — Existing immutable selector must be made explicit before code claims compatibility

- Classification: Evidence gap / unresolved implementation unknown
- Severity: P1
- Evidence: the current dialogue-pipeline snapshot has `schemaVersion: 1`, a
  `legacy | compact` projection mode, settings `revision`, generation identity,
  and content digest. It does not yet state which retained Compact bindings use
  the old contract and which use the revised contract.
- Impact: an implementation that changes every `compact` snapshot in place
  would violate the candidate's old-battle compatibility requirement.
- Disposition: this does not require a new lifecycle ID or a change to the
  candidate. Before implementation, the design must select an explicit stable
  discriminator inside the existing immutable binding, such as a compatible
  schema/contract revision. If the existing binding cannot express that without
  changing the accepted contract, return to requirement revision before code.

### Optional or future candidates

None added. In particular, expression opportunities, realization receipts,
new IDs, reuse detectors, text-similarity gates, critics, and diversity scoring
remain excluded rather than becoming review recommendations.

### Out of scope

- Current code still places `lastSpeech` in Compact deep-psyche state, returns
  generic `speech`, uses an arbitrary-record decode, and writes accepted speech
  back to `lastSpeech`. These are expected implementation mismatches, not proof
  that the candidate is contradictory or already satisfied.
- Production provider adapters disable mock fallback, while separately governed
  provider routing exists outside this requirement. This candidate neither
  authorizes nor redesigns that routing; its implementation must add no retry,
  critic, prior-line fallback, mock substitution, cross-provider fallback, or
  successful-path provider-count expansion.
- Paid replay, Stage, production, release, and battle migration remain separate
  later authority decisions.

## Review conclusion

Step 3 is completed on the unchanged subject digest. No contradiction blocks a
Step 4 owner decision. E1 remains visible as an implementation-predecessor
condition already bounded by req008 and acceptance criterion 9; it is not a new
requirement and does not by itself require candidate revision.

The next lifecycle action belongs to the requirement owner: `ACCEPT`, `REVISE`,
or `REREVIEW`. This review does not accept the requirement and does not authorize
implementation, provider calls, deployment, release, or migration.

## Owner disposition and E1 resolution

On 2026-09-08 the product owner made acceptance conditional on correcting E1.
The implementation design now fixes
`dialoguePipeline.snapshot.schemaVersion` as the stable discriminator:
`schemaVersion: 1` retains the legacy Compact contract and
`schemaVersion: 2` selects the revised Compact contract. Persisted V1
snapshots are not reinterpreted.

This resolves E1 inside the existing immutable binding without adding a new
identifier or changing the reviewed requirement candidate. The candidate
remains byte-for-byte unchanged at
`b5c7f96f1e2d73d2bed4f3356f703942bed4c3c68414e7f06889c56dbad4c265`.
The corresponding acceptance decision is recorded in
`docs/dialogue-expression-realization-requirement-acceptance-v3.md`.
