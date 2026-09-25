# D11 focused semantic authoring kernel design v1 revision 3 — review

- Status: Review complete; `REVISE`
- Date: 2026-09-15
- Exact review subject: DRAFT Seal `76d701c299b6…`
- File SHA-256: `49181675114f6ced237ced68a335aa1e1edbb0eaa788379f0d6c09dc36a3e6f1`
- Scope: complete English design revision 3 and its complete Japanese projection
- Authority checked: accepted ADR-0032, retained ADR-0031 decisions, accepted foundation
  requirement v3, accepted character authoring requirement v5, and the design's closed
  run/request state contracts
- Independence: performed in the current Codex task; this does not satisfy a separately
  required independent-reviewer identity
- Excludes: design revision, acceptance, implementation, provider calls, cutover,
  deployment, production effects, commit, and push

## Conclusion

`REVISE`, with one P1 finding. Revision 3 correctly separates provider transport time,
worker lease time, semantic progress, and cumulative resource accounting. It does not,
however, define a closed provider-timeout transition for either the no-recovery path or
the replacement-request path. The missing transition would force implementation or a
test fixture to invent failure, retry, and late-result semantics.

## Finding

### [P1] Close the provider-timeout request and run transitions

Lines 523–529 make another provider call conditional on policy permission, cumulative
admission, a current worker fence, and a non-blind recovery strategy. They do not say
what happens when any condition is false. The closed run state machine therefore has no
specified transition for zero recovery, exhausted recovery, failed admission, or a
stale fence.

The same paragraph also does not make the timed-out request non-outstanding before a
replacement request is scheduled. Lines 610–612 accept a provider completion while its
request remains outstanding. Without a request-terminalization/replacement rule, the
late first result and the replacement result have ambiguous application eligibility.

Required correction:

1. Atomically terminalize the timed-out request and retain its maximum reservation and
   transport receipt.
2. If same-run recovery is admitted, issue a distinct replacement request under the
   current run/worker fence and reject the timed-out request's late result for
   application while retaining a safe receipt.
3. If recovery is disallowed, exhausted, inadmissible, or cannot retain the current
   fence, move the run to `failed` with a recoverable technical outcome, retained source
   and accounting, and an owner-triggered new-run resumption recipe.
4. Make the zero/one-recovery conformance fixture prove these transitions rather than
   select them.

Evidence: design lines 523–529, 596–626, and 728–736; ADR-0032 lines 42–55; foundation
v3 F9 lines 242–258 and F15 lines 360–373.

## Material difference from revision 2

Revision 3 correctly removes the proposed whole-attempt and provider-time literals and
replaces them with separate provider-route and worker-platform policies whose exact
values remain owner-controlled. The present finding is confined to the newly introduced
provider-timeout recovery boundary; the previously corrected skeleton and portrait
authority decisions remain unaffected.

## Alternatives and tradeoffs

1. **Revise the timeout transition (recommended):** closes the state contract without
   choosing numeric time values or activating a route. It adds a small amount of design
   text and required fixture detail.
2. **Defer the transition to implementation:** saves design work now, but transfers an
   externally material failure/retry decision to code and tests without accepted
   authority.
3. **Forbid same-run transport recovery:** simplifies fencing and cost behavior, but
   prematurely fixes the still-undecided policy choice to zero recovery.

## Risks and unknowns

- Exact provider timeout, worker lease, and recovery-count values remain undecided.
- Provider convergence and representative latency remain unverified.
- No runtime, deployment, or production behavior was exercised by this review.
- This same-task review is not evidence of a separate independent-reviewer identity.

## Evidence-chain result

- `Evidence-TIMEOUT-001`: the design permits recovery only conditionally but specifies
  no false-condition run transition and no timed-out-request closure.
- `Claim-TIMEOUT-001` (`📜`): revision 3 has an acceptance-blocking provider-timeout
  state-contract omission.
- `Reasoning-TIMEOUT-001`: F9/F15 require stop, receipt retention, late-result rejection,
  and explicit new-attempt retry; fixtures cannot supply missing normative semantics.
- `Action-TIMEOUT-001` (`proposed`): revise only the provider-timeout transition and
  re-review the resulting exact design revision.

## Review decision

- Verdict: `REVISE`
- Findings: one P1
- Acceptance recommendation: none for revision 3
- Next authorized action: none; this review does not itself authorize revision
