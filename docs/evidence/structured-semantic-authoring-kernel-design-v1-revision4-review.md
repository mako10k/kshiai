# D11 focused semantic authoring kernel design v1 revision 4 — review

- Status: Review complete; `REVISE`
- Date: 2026-09-15
- Exact review subject: DRAFT Seal `7bfc10a07b45…`
- File SHA-256: `559c8bce9165b51a3aa274c701ee17aee3fe97a96652601cb8b2f7fc71537594`
- Scope: complete English design revision 4 and its complete Japanese projection
- Authority checked: accepted ADR-0032, foundation requirement v3 F9/F15, retained
  ADR-0031 decisions, and the design's own bounded-resource and closed-transition rules
- Independence: performed in the current Codex task; this does not satisfy a separately
  required independent-reviewer identity
- Excludes: design revision, acceptance, implementation, provider calls, cutover,
  deployment, production effects, commit, and push

## Conclusion

`REVISE`, with two P1 findings. Revision 4 resolves the prior timed-out-request closure,
late-result rejection, and replacement-request identity defect. Two false-condition
branches remain contradictory or undefined, so implementation and fixtures still lack
one authoritative transition table.

## Findings

### [P1] Preserve the matching resource-exhaustion outcome

Lines 470–471 require every exhausted cumulative-resource dimension to return its
matching bounded-resource outcome. Lines 542–545 instead map failed recovery admission
to `provider_transport_unavailable`. If the second call is rejected because calls,
tokens, or cost are exhausted, the stop cause is resource exhaustion, not provider
unavailability. Misclassification would weaken the required failure receipt and retry
diagnostics.

Required correction: retain the original timeout receipt, but terminate the run with
the matching bounded-resource outcome and consumed-budget evidence when recovery
admission fails for a resource limit. Keep `provider_transport_unavailable` only for the
transport-policy or transport-recovery branches that it actually describes.

Evidence: design lines 470–478 and 542–545; foundation v3 F15 lines 335–342 and
360–366; ADR-0032 lines 90–91.

### [P1] Define the no-valid-recovery-basis transition

Lines 531–540 correctly require every same-run recovery to prove either a changed
transport condition or a materially different authorized request. Lines 542–549 define
what happens for zero/consumed recovery, failed resource admission, and a lost fence,
but not what happens when the fence and budgets are valid and neither `recoveryBasis`
can truthfully be established. F9 forbids scheduling an unchanged blind retry, leaving
the run claimed with no specified next transition.

Required correction: treat absence of an admissible `recoveryBasis` as exhausted
applicable transport recovery and move the run to an explicitly named recoverable
technical failure with retained timeout evidence and an owner-triggered new-run recipe.
The fixture must verify that transition rather than select it.

Evidence: design lines 531–549 and 758–765; foundation v3 F9 lines 232–258.

## Material difference from revision 3

Revision 4 correctly adds request terminalization, late-result rejection, distinct
replacement identities, typed recovery bases, a closed request-state vocabulary, and
expanded fixtures. The findings are limited to the newly defined recovery rejection
matrix; prior skeleton, portrait-authority, time-boundary separation, and fencing
corrections remain unaffected.

## Alternatives and tradeoffs

1. **Correct both branches (recommended):** preserves precise diagnostics and closes
   the recovery matrix without choosing time values or recovery count.
2. **Use one generic technical failure for every branch:** simpler, but loses the
   accepted matching resource-exhaustion reason.
3. **Permit an unchanged retry when no basis exists:** avoids immediate failure, but
   directly violates F9's blind-retry prohibition.

## Risks and unknowns

- Exact provider timeout, worker lease, and zero-or-one recovery policy remain pending.
- Provider convergence, latency distribution, and runtime behavior remain unverified.
- This same-task review is not evidence of a separate independent-reviewer identity.

## Evidence-chain result

- `C-TIMEOUT-101` (`📜`): failed resource admission is misclassified as provider
  unavailability. References `E-TIMEOUT-101` and `E-TIMEOUT-102`.
- `C-TIMEOUT-102` (`📜`): the no-valid-recovery-basis transition is undefined.
  References `E-TIMEOUT-103` and `E-TIMEOUT-104`.
- `A-TIMEOUT-101` (`proposed`): revise only those two branches and re-review the exact
  successor design.

## Review decision

- Verdict: `REVISE`
- Findings: two P1
- Acceptance recommendation: none for revision 4
- Next authorized action: none; this review does not itself authorize revision
