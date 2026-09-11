# D11 focused semantic authoring kernel design v1 revision 2 — re-review

- Status: Re-review complete; `PASS`; recommendation `ACCEPT`
- Date: 2026-09-11
- Exact review subject: DRAFT Seal `c4f8cb366d78…`
- Scope: the complete English design candidate revision 2 and its complete Japanese projection
- Authority checked: accepted ADR-0031 revision 1, accepted foundation requirement v3,
  accepted character authoring requirement v5, and current shared public contracts
- Independence: performed in the current Codex task; this does not satisfy a separately
  required independent-reviewer identity
- Review rule: unfinished downstream detail is not treated as a REVISE reason
- Excludes: acceptance, implementation, provider calls, cutover, deployment, production
  effects, commit, and push

## Conclusion

`PASS`, with no P0–P3 findings. Revision 2 resolves both substantive findings from the
corrected revision-1 review. No new contradiction with accepted semantics, authority,
or compatibility boundaries was established. Owner `ACCEPT` is recommended for this
exact design revision.

## Resolution of prior findings

### Semantic-skeleton ordering — resolved

The skeleton phase now spans cluster 1 and only the server-designated essential
ability/limit and key-relationship claim slices from clusters 2 and 3. Those claims
must exist and pass applicable hard checks before remaining dependent work fans out.
The model receives only the registered targets through the closed
`CharacterSkeletonPhaseOperationV1` subset, so the correction does not expose either
complete cluster early.

Evidence: candidate lines 297–307 and 394–405; character requirement v5 R6 and R10.

### Portrait authority — resolved

`set_portrait` is absent from the model operation catalog. Create retains a null or
pre-authorized server binding, revise and migrate retain the frozen baseline binding,
and only a separately authorized server operation may change it. A provider attempt to
select portrait identifiers is rejected as an unknown operation.

Evidence: candidate lines 323–341 and 413–417; character requirement v5 R7.

## Findings

No P0, P1, P2, or P3 findings.

## Downstream completion obligations — not findings

The following requirements remain active at their stated gates:

1. exact DTO and focused patch schema elaboration before implementation relies on them;
2. exact process-loss takeover transition before durable execution is enabled;
3. one-to-one mapping of all fifteen conformance cases before claiming test completion;
4. complete public owner-Q&A projection before public routes are wired.

Acceptance of this design does not waive those obligations. A later concrete conflict
may create a new finding when evidence exists.

## Owner decision points — not findings

- eight calls and USD 0.50 as proposed default limits;
- additive legacy `failed` projection versus a versioned public status;
- new-attempt Q&A recovery versus same-run resume; and
- no-progress and cycle-detector thresholds.

## Material difference from revision 1

Immutable comparison with revision 1 shows only:

- revision/status wording;
- cross-cluster focused skeleton-phase correction;
- removal and server-side handling of portrait binding; and
- the matching self-review explanation.

The remaining architecture, compatibility boundary, persistence direction, resource
policy proposal, Q&A flow, conformance direction, and acceptance boundary are unchanged.

## Alternatives and tradeoffs

1. **Accept revision 2 (recommended):** closes the two demonstrated defects while
   preserving downstream details at their proper gates.
2. **Revise again to elaborate downstream contracts now:** may reduce later writing,
   but no current defect requires it and it would recreate an unnecessarily early gate.
3. **Reject the architecture:** appropriate only if the owner wants to reopen the
   accepted thin-kernel, focused-capability, or server-authority direction. This review
   found no evidence requiring that rollback.

## Risks and unknowns

- Provider convergence and numerical fitness remain unverified.
- The four owner decisions remain unaccepted until the owner selects them as part of
  this exact design revision.
- This same-task review is not evidence of a separate independent-reviewer identity.

## Review decision

- Verdict: `PASS`
- Findings: none
- Recommendation: owner `ACCEPT` for exact DRAFT Seal `c4f8cb366d78…`
- Acceptance effect: accepts the design only; implementation, provider execution,
  cutover, deployment, and production effects remain separately gated
