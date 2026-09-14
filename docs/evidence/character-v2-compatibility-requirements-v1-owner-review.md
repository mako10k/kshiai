# Character V2 compatibility requirement revision 1 — first owner review

- Candidate: `docs/character-v2-compatibility-requirements-v1.md`
- SHA-256: `5f69f908445ce3ccc0745f06e56ff2df5f74f938cf8ef471c802f93dd8f3635d`
- Lifecycle: Step 2 first owner review pending
- Date: 2026-09-10

## Source and authority

The candidate is derived from the owner's current production bug report,
read-only production evidence, Accepted ADR-0010 and ADR-0027, and the earlier
rc8 RCA. It preserves immutable generation and responsibility ownership. It
proposes a narrower compatibility interpretation for already-ready V2 data; it
does not treat current implementation or the RCA as requirement authority.

## Scope presented for review

In scope are the exact terminology and behavior in R1-R7 and their acceptance
criteria. Out of scope are a new V3 storage field, bulk migration, provider
replay, deployment, production traffic, and production data writes.

The central review question is whether already-ready V2 selectorless soft
guidance should retain its original conscious-only behavior while new
activations continue to require executable selectors.

## Proposed independent-review input

Review the exact candidate digest for:

1. consistency with ADR-0010's immutable activation and server eligibility;
2. consistency with ADR-0027's psyche/conscious/engine ownership;
3. proof that legacy conscious-only guidance cannot rank, exclude, or force an
   action;
4. proof that a read cannot promote an unsupported generation; and
5. separation of new-authoring validation from persisted V2 interpretation.

Do not promote a future V3 field, general migration, provider replay, or
deployment into a revision-1 acceptance criterion.

## Owner routes

The owner selects `REVISE`, `REVIEW_THEN_REVISE`, `REVIEW_THEN_DECIDE`, or
`REVIEW`. This review does not accept the candidate, ADR-0029, implementation,
deployment, or a production write.
