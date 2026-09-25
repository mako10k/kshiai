# Structured selectable-asset workflow — whole-document supersession impact (2026-09-17)

## Decision and scope

The product owner directed supersession of the **entire** [old workflow](../structured-asset-authoring-workflow.md) on 2026-09-17. No individual clause remains current authority merely because it was not the no-invention clause. The historical body and its old Seal are retained. The new source Seal is `eebfcfbc6d7e`; the former Seal was `7c6ad0bde0c5`.

This is a whole-source disposition, **not** a declaration that all downstream claims are false, and not acceptance of a newly invented full-scope successor. Accepted ADR-0010, ADR-0011, ADR-0012, ADR-0013, ADR-0014, foundation requirement revision 3, character V3 authoring requirement revision 5, and their independent acceptance records must be read on their own terms. The old document's future-family scope is **unresolved**; do not silently retain it or silently exclude it.

## Current foundation v3 owner-decision anchor

On the owner's subsequent instruction to create a new current basis, the unchanged [foundation v3 owner-acceptance record](../structured-semantic-authoring-foundation-requirements-v3-acceptance.md) was registered under the new SealGraph REF `acceptance/structured-semantic-foundation-v3-owner-decision`. Its Seal is `d53bc670bd6f0889a13f229a2f7583e2d76f5acb4fe7fd43a6391827355a657d`, `root=true`, `draft=false`, and has no Cause Links. The bound source workfile matches the Seal. The record identifies the exact Accepted requirement document with SHA-256 `b5693f6d47e975ea1cb78adaa686185630db5ffc6d52c74f3481ac77511c99da`; that source digest was independently read back unchanged.

This root records the existing owner acceptance as the provenance boundary; it does not create or alter product semantics. The older `acceptance/structured-semantic-foundation-v3` REF and proposal/reasoning lineage remain draft and stale historical material. SealGraph source bindings are local metadata, not a synchronized artifact; the REF-to-path mapping above must be checked and rebound on a fresh checkout before relying on workfile-currentness.

After the owner's approval and one read-only Luna review, the exact unchanged [foundation v3 requirement text](../structured-semantic-authoring-foundation-requirements-v3.md) was registered as `requirement/structured-semantic-foundation-v3-accepted-snapshot`, Seal `2a779ad74cb7e11bbc803024ea90c3ba6fc8ec57a0c6701b441a449a9440587a`. Its sole Cause is the owner-decision root above. Its provenance explicitly treats present-tense references to the former workflow as historical replacement context, not revived authority. Future selectable-family scope remains undecided. This requirement REF does not itself admit a test, authorize implementation, or clear any of the 115 previously impacted heads; none of those heads was relinked or re-Sealed here. Its source binding also requires fresh-checkout verification.

## Inspection method and limits

`sealgraph impact --all-paths --max-paths 100 @7c6ad0bde0c5ae5723190f99739e009dad70e618f59c33ba3bb05f70b76c128a --format json` found **115 distinct current downstream REF heads**. Path enumeration hit the 100-path limit for 27 heads; membership in the 115-head set is complete. One REF, `reasoning/structured-semantic-authoring-foundation-requirement-v1`, has a direct Cause edge to the former root; the other 114 are transitively reachable. Direct textual references were also searched across `docs`, `scripts`, `backend`, `frontend`, and `packages`.

After sealing the whole-source supersession, all 115 impacted current heads appear in `sealgraph stale --refs-only --scan`. `sealgraph fsck` reports `result: ok`. Stale means their old Cause chain requires review; it is not a judgment that each claim is false.

Every REF below was structurally classified. This is **not** a clause-by-clause semantic approval of the REF, a test-admission decision, or a determination that it must be re-Sealed. All current normative and operational consumers need their own semantic recheck against current Accepted authority before being claimed current. Historical records remain preserved; they may not be reused as a shortcut to current authority.

## Current normative/design heads — 7, semantic recheck required

- `acceptance/adr-0032`
- `acceptance/adr-0033`
- `acceptance/adr-0035`
- `acceptance/character-v3-authoring-v5`
- `acceptance/structured-semantic-authoring-kernel-design-v1`
- `acceptance/structured-semantic-foundation-v3`
- `design/structured-semantic-authoring-kernel-v1`

Review against the current Accepted requirement/ADR revision and its exact Cause chain. In particular, foundation revision 3 and the accepted kernel design must not inherit an unreviewed future-family promise from the old document.

Read-only content recheck of these seven heads found no current normative claim supported **only** by the old workflow. ADR-0032 independently defines authoring time boundaries; ADR-0033 defines run-configuration identity; ADR-0035 defines revise-scope resolution; character requirement v5 defines its authoring behavior; and the kernel design and its acceptance record identify current foundation/character/ADR authorities. Foundation v3 still names the old workflow as a historical source and replacement target, so that reference must not be interpreted as a live authority edge. This finding does **not** clear their stale Cause chains or draft Seals, nor does it authorize bulk re-Sealing. ADR-0014 also has a direct textual reference to the old workflow, but defines its queue behavior independently; preserve its Accepted decision and review the reference at its next revision.

## Current plan/implementation/verification/index heads — 50, semantic recheck required

- `evidence/test-authority-inventory-2026-09-15`
- `implementation/cc304-focused-revise-route-v1`
- `implementation/semantic-authoring-accounting-v1`
- `implementation/semantic-authoring-battlefield-conformance-v1`
- `implementation/semantic-authoring-capability-session-v1`
- `implementation/semantic-authoring-character-adapter-v1`
- `implementation/semantic-authoring-character-contracts-v1`
- `implementation/semantic-authoring-contracts-v1`
- `implementation/semantic-authoring-family-conformance-v1`
- `implementation/semantic-authoring-kernel-v1`
- `implementation/semantic-authoring-narration-conformance-v1`
- `implementation/semantic-authoring-orchestration-v1`
- `implementation/semantic-authoring-ports-v1`
- `implementation/semantic-authoring-progress-monitor-v1`
- `implementation/semantic-authoring-proposal-decoder-v1`
- `implementation/semantic-authoring-public-contracts-v1`
- `implementation/semantic-authoring-public-mapping-v1`
- `implementation/semantic-authoring-repository-v1`
- `implementation/semantic-authoring-run-state-v1`
- `implementation/semantic-authoring-scripted-ports-v1`
- `implementation/semantic-authoring-shared-export-v1`
- `implementation/semantic-authoring-sqlite-migration-v1`
- `index/adr`
- `plan/character-semantic-migration`
- `verification/adr-0031`
- `verification/adr-0032-design-consistency`
- `verification/character-focused-authoring-request-scope-v1`
- `verification/character-focused-authoring-v1`
- `verification/character-focused-review-e2e-v1`
- `verification/character-v3-authoring-requirement-v5`
- `verification/provider-json-v1`
- `verification/semantic-authoring-character-adapter-v1`
- `verification/semantic-authoring-character-contracts-v1`
- `verification/semantic-authoring-conformance-v1`
- `verification/semantic-authoring-kernel-foundation-v1`
- `verification/semantic-authoring-kernel-slice1-independent-review-2026-09-12`
- `verification/semantic-authoring-kernel-slice2-independent-review-2026-09-12`
- `verification/semantic-authoring-kernel-slice3-independent-review-2026-09-12`
- `verification/semantic-authoring-kernel-slice4-independent-review-2026-09-12`
- `verification/semantic-authoring-kernel-slice5-integration-review-2026-09-12`
- `verification/semantic-authoring-kernel-wip-handoff-2026-09-11`
- `verification/semantic-authoring-provider-v1`
- `verification/semantic-authoring-public-mapping-v1`
- `verification/semantic-authoring-repository-v1`
- `verification/semantic-authoring-scripted-ports-v1`
- `verification/semantic-authoring-shared-contracts-v1`
- `verification/structured-semantic-authoring-foundation-requirement-v3`
- `verification/structured-semantic-authoring-kernel-design-v1-revision3-self-check`
- `verification/structured-semantic-authoring-kernel-design-v1-revision4-self-check`
- `verification/structured-semantic-authoring-kernel-design-v1-revision5-self-check`

A passing test or existing implementation is evidence only. Test expectations must map to their current Accepted causes; old-root reachability alone cannot admit them. No current head in this group was automatically re-Sealed or promoted by this supersession.

Read-only per-REF check of these 50 heads found that **all 50 current Seals are draft** and, after the root revision, stale. None can be cited as a current admitted test result or current implementation-conformance proof. No direct quotation or path reference to the old workflow was found in their sealed content; this does not rule out semantic inheritance through upstream Causes. Some implementation REFs have no local source binding, so their current workfiles cannot be established from the REF alone. The character path must be reconciled upstream-first: current Accepted requirement/ADR → plan/design → implementation → assertion-level verification. Family-conformance code and tests need an explicit present-family versus future-family boundary before any promotion; the old document supplied a future-family promise that current Accepted sources do not automatically carry. Historical self-check/review verification REFs remain historical even if their past result said PASS.

Current WIP selector readback from `npm run test:inventory`: 156 unit-suite files discovered, 2 active, 1 provisional (draft result), and 153 disabled. This is a diagnostic of the present worktree, not a product-completion metric; the selector's own sealed source is currently diverged and this readback does not approve any test expectation.

## Historical/proposal/review/projection/evidence heads — 58, preserve

- `acceptance/adr-0031`
- `acceptance/structured-semantic-foundation-v2`
- `evidence/adr-0031-acceptance`
- `evidence/adr-0032-acceptance-ja`
- `evidence/adr-0033-acceptance-ja`
- `projection/adr-0031`
- `projection/adr-0031-accepted`
- `projection/adr-0031-ja-accepted`
- `projection/adr-0032`
- `projection/adr-0032-design-consistency-ja`
- `projection/adr-0033`
- `projection/adr-0033-ja`
- `projection/adr-0033-review-ja`
- `projection/structured-semantic-authoring-kernel-design-v1-acceptance-ja`
- `projection/structured-semantic-authoring-kernel-design-v1-ja`
- `projection/structured-semantic-authoring-kernel-design-v1-review-ja`
- `projection/structured-semantic-authoring-kernel-design-v1-revision3-review`
- `projection/structured-semantic-authoring-kernel-design-v1-revision3-review-ja`
- `projection/structured-semantic-authoring-kernel-design-v1-revision3-self-check-ja`
- `projection/structured-semantic-authoring-kernel-design-v1-revision4-review`
- `projection/structured-semantic-authoring-kernel-design-v1-revision4-review-ja`
- `projection/structured-semantic-authoring-kernel-design-v1-revision4-self-check-ja`
- `projection/structured-semantic-authoring-kernel-design-v1-revision5-review`
- `projection/structured-semantic-authoring-kernel-design-v1-revision5-review-ja`
- `projection/structured-semantic-authoring-kernel-design-v1-revision5-self-check-ja`
- `proposal/adr-0031`
- `proposal/character-v3-authoring-requirement-v4`
- `proposal/character-v3-authoring-requirement-v5`
- `proposal/structured-semantic-authoring-foundation-requirement-v1`
- `proposal/structured-semantic-authoring-foundation-requirement-v2`
- `proposal/structured-semantic-authoring-foundation-requirement-v3`
- `reasoning/adr-0031-acceptance`
- `reasoning/adr-0031-independent-review`
- `reasoning/character-v3-authoring-requirement-v4`
- `reasoning/character-v3-authoring-requirement-v5`
- `reasoning/structured-semantic-authoring-foundation-requirement-v1`
- `reasoning/structured-semantic-authoring-foundation-requirement-v2`
- `reasoning/structured-semantic-authoring-foundation-requirement-v3`
- `reasoning/structured-semantic-authoring-kernel-design-v1`
- `reasoning/structured-semantic-authoring-kernel-design-v1-review`
- `reasoning/structured-semantic-foundation-v1-review`
- `reasoning/structured-semantic-foundation-v2-acceptance`
- `reasoning/structured-semantic-foundation-v2-review`
- `review/adr-0031`
- `review/adr-0031-input`
- `review/adr-0032`
- `review/adr-0033`
- `review/character-v3-authoring-requirement-v4-input`
- `review/character-v3-authoring-requirement-v5-input`
- `review/structured-semantic-authoring-foundation-requirement-v1-input`
- `review/structured-semantic-authoring-foundation-requirement-v2-input`
- `review/structured-semantic-authoring-foundation-requirement-v3-input`
- `review/structured-semantic-authoring-kernel-design-v1`
- `review/structured-semantic-authoring-kernel-design-v1-revision3`
- `review/structured-semantic-authoring-kernel-design-v1-revision4`
- `review/structured-semantic-authoring-kernel-design-v1-revision5`
- `review/structured-semantic-foundation-v1`
- `review/structured-semantic-foundation-v2`

These heads retain historical provenance. The classification does not authorize their claims for current work; if a current consumer cites one, review that use against current Accepted authority.

## Direct text-reference disposition

The old source is named directly in ADR-0010, ADR-0014, the common-envelope/projection designs, the domain-assets backlog/inventory, and foundation requirement revisions 1–3 and associated review evidence. Accepted ADR text and frozen accepted requirement snapshots are preserved as historical records; their date-of-writing descriptions of the then-Accepted workflow are not reinterpreted as a live link to the superseded source. The current backlog/inventory and design references require their own next-use freshness check. `docs/battle-fit-gap.pert` contains a separate “no-invention” phrase for battle narration; the phrase match alone does not prove reliance on this workflow.

The full set of 17 pre-existing text matches, excluding the superseded source and this audit, is disposed as follows:

- Frozen Accepted documents with historical references, preserve without rewriting: `docs/adr/0010-structured-selectable-asset-envelope.md`, `docs/adr/0014-queue-asset-authoring.md`, `docs/structured-semantic-authoring-foundation-requirements-v3.md`.
- Superseded ADR-0031 projections, preserve historically: `docs/adr/0031-focused-structured-semantic-authoring-kernel.md`, `.think` of the same basename.
- Designs and planning/inventory documents needing a next-use freshness check: `docs/structured-asset-envelope-design.md`, `docs/structured-asset-information-projection-design.md`, `docs/structured-domain-assets-backlog.md`, `docs/structured-domain-assets-current-inventory.md`.
- Historical foundation candidates/review evidence, preserve without promotion: `docs/structured-semantic-authoring-foundation-requirements-v1.md`, `docs/structured-semantic-authoring-foundation-requirements-v2.md`, `docs/evidence/structured-semantic-authoring-foundation-requirements-v1-owner-review-ja.md`, `docs/evidence/structured-semantic-authoring-foundation-requirements-v1.think`, `docs/evidence/structured-semantic-authoring-foundation-requirements-v2-owner-review-ja.md`, `docs/evidence/structured-semantic-authoring-foundation-requirements-v3-owner-review-ja.md`, `docs/evidence/structured-semantic-authoring-foundation-v1-review.think`.
- Separate wording, not an established Cause of this supersession: `docs/battle-fit-gap.pert`.

## Remaining decisions and gates

- Decide the future selectable-family boundary through owner-controlled requirement review if a future family is actually proposed. Current Accepted sources cover the three named families, not an automatic family-extension promise.
- Recheck the 7 normative/design heads upstream-first, then the 50 operational/index heads as needed for the V3-character path. Preserve the 58 historical heads. Record exact authority, semantic effect, and SealGraph Cause revision before any individual re-Seal.
- Do not rewrite the rationale of Accepted ADRs, bulk re-Seal descendants, turn draft results into Accepted evidence, or treat this inventory as proof of product behavior.
