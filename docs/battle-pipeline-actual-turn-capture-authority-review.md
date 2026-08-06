# Actual-Turn Capture Authority Review After Input-Derivability PoC

Status: reviewed as `defer` on 2026-08-06

Decision outcome: `changed`

Plan task: `T_CAPTURE_AUTHORITY_REVIEW`

Reviewed candidate: `actual-turn-capture-authority-v1`

This review closes the current authority gate. It does not authorize runtime
source authoring, runtime hook implementation or activation, actual-turn data
capture, DB or network access, external LLM or XAI calls, canonical or battle
persistence writes, release, or deployment.

## 1. Frozen evidence

| Artifact | SHA-256 |
|---|---|
| input-derivability protocol | `9ce6e1f62e7051ba8420e7ebb5aa2ee9591cece002700c4c990eeb2471f2f69b` |
| pure derivation module | `44485e3f69df8246a8cd0cd7a1b848ba05a8b86cffb1f23ed6064a00e07aac63` |
| fixed fixture corpus | `8a3f826f3aa44b9d72673373a62dac42b130f3722ed9e352ac28fa92dc4a1344` |
| evaluator | `305a77ff10ed9bed23e09c62135d0e12943353d10a17980105ed997099190797` |
| raw evaluation evidence | `950312d2ca7493ec0cfb73727bbb324462a2553140d87e3b51252a9279c6ca73` |
| raw evidence content digest | `7027cb4f88287a75501b03eb507e7dfb60c6fc61bc37423895088fd3a1801cac` |

The registered evaluation decision is `revise`. All transformation gates pass,
but ordinary-runtime authoritative availability is `0/5` for:

- `turn_fallback_policy`
- `coarse_proposal_registry`
- `adaptive_stage_receipt`
- `purpose_read_set`
- `consistency_issue_snapshot`

Synthetic fixture success is not evidence that an ordinary resolved turn can
currently supply these artifacts.

## 2. Authority decision

The user requested a plan change on 2026-08-06. The current capture candidate
therefore remains deferred and `T_CAPTURE_AUTHORITY_REVIEW` is recorded as a
changed outcome.

This is not a rejection of the privacy and failure boundaries frozen for
`actual-turn-capture-authority-v1`. The candidate remains unavailable because
activating it now would either emit only `insufficient_source` or require
unreviewed inference or source authoring.

## 3. Replacement direction

Replan a separate source-authoring PoC that tests whether the five artifacts
can be authored by their semantic owner stages and assembled in memory without
changing battle results, call topology, narration inputs, or persistence.

The replacement plan must:

1. freeze semantic ownership, lifecycle, provenance, and non-interference
   metrics before implementation;
2. test pure stage-owned artifact constructors separately from ordinary-turn
   shadow assembly;
3. evaluate runtime-shaped deterministic fixtures without actual user data;
4. record `supported`, `revise`, `unsupported`, or `indeterminate` under a
   preregistered rubric; and
5. require another explicit capture-authority review after evaluation.

Only a future conformant authority decision may unlock actual sampling. This
review authorizes only the plan change and recording this changed outcome.
