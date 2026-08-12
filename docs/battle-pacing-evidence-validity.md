# Battle pacing evidence validity

Status: minimum smoke validation complete (`T_VALIDATE_PACING_EVIDENCE`)

Scope was intentionally narrowed by owner direction on 2026-08-12. Broad
simulator correspondence is not a prerequisite for parameter exploration;
production observation is the decision evidence.

## Purpose

Determine which pacing evidence can support candidate search and which evidence
is strong enough for an owner adoption decision. Issue #98's approximately
eight-turn average and approximately twelve-turn maximum are initial hypotheses;
they must not be rejected from one synthetic run.

## Immediate finding

The first deterministic harness is **not adoption-grade evidence**.

It reported a 9.41-turn mean and 100% KO rate for the current policy. Retained
production evidence from 2026-08-04 instead includes multiple battles reaching
turn 20 with long `wait` or single-skill streaks. This is not a small numerical
error: the harness omits the behavioral loops that motivated Issue #98.

The earlier recommendation to revise or reject the twelve-turn candidate may be
used only to reject that particular synthetic fixture configuration. It cannot
reject the Issue target or establish actual battle pacing.

## Minimum smoke result

- Two independent fixed-seed runs produced the identical SHA-256 digest
  `f477b101b57546e988ad45febc1e73e56da198867e74a6a38d8fe19c4f705460`.
- The shared suite passed 214 tests, including turn-limit classification,
  finisher timing/pressure, sequential initiative, and bounded delayed effects.
- Paired fixture streams are isolated per fixture, so differing match lengths
  do not shift later comparison inputs.
- The harness is therefore usable for aggressive candidate search and
  regression checks, with the adoption limitations below unchanged.

## Known validity gaps

| Gap | Current synthetic harness | Required evidence |
|---|---|---|
| Character/action diversity | One generated stat family; mostly basic attack/defend; forced finisher timing | Stratified real sheets and action-policy classes, including passive and support loops |
| Decision behavior | Fixed random action rule | Actual action proposer outputs or frozen recorded decisions replayed under a declared counterfactual boundary |
| Full pipeline | Shared deterministic engine only | Backend advance orchestration including feasibility, semantic/world reconciliation, persistence, and phase boundaries |
| Speech repetition | Not measured | Actual character-expression outputs with normalized repetition metrics |
| Semantic progress | Not measured | Canonical semantic/world transition and no-change rates per turn |
| Delayed effects | One unconditional turn-2 HP effect | Due-turn, predicate, cancel, expiry, and interaction with early terminal states |
| Baseline correspondence | No calibration | Prediction error against retained battles/fixtures, with unsupported strata reported separately |
| Uncertainty | One seed and aggregate variance | Multiple independent seeds, confidence intervals, sensitivity to fixture/action mix |
| Candidate tuning | Arbitrary 12/6/6–12 thresholds | Parameter search over turn limit, damage/defense/recovery, finisher timing/power, and pressure curve |

## Evidence ladder

1. Pure deterministic unit fixtures prove invariants and catch regressions.
2. Stratified engine simulations explore candidate ranges; they do not establish
   role-play behavior.
3. Replays of retained canonical inputs test correspondence where the same
   decision sequence remains meaningful.
4. Backend E2E with mock providers proves orchestration and measurement wiring,
   not model behavior.
5. A separately authorized, cost-bounded real-LLM local trial measures action,
   speech, latency, token, and fallback behavior.
6. Production observation, if wanted, remains a separate release/operations
   authorization.

No lower rung may be presented as evidence for an omitted higher-rung behavior.

## Next validation work

- Extract a sanitized aggregate from retained battle records: completion turn,
  finish reason, action mix/streaks, committed mechanical/semantic changes,
  and delayed-effect incidence.
- Add representative aggressive, defensive, support/control, resource-limited,
  passive-loop, and asymmetric fixtures.
- Run paired multi-seed sensitivity tests and report confidence intervals by
  stratum, not just one pooled mean.
- Define the counterfactual boundary: changing pacing mechanics while replaying
  recorded decisions does not predict how an LLM would adapt its later choices.
- Only after correspondence is acceptable, tune candidates toward the Issue
  hypotheses and prepare an exact real-LLM trial budget for owner approval.

## Automatic restoration decision

The production candidate uses `explicit_effects_only`. It does not apply the
legacy once-per-turn 20% movement toward base parameters. HP was already
excluded from that legacy restoration; the change primarily stops implicit
MP/stamina recovery and automatic erasure of buffs, debuffs, and maximum-value
changes.

Recovery and reversal must instead come from an accepted action (`rest`,
`defend`, or a skill), a scheduled effect, or an explicit rules/world effect.
Existing battles and the current rollback policy retain
`legacy_twenty_percent`, so the candidate can be reverted without rewriting
their historical semantics.

## Sources currently available

- `docs/evidence/production-narration-2026-08-04.md`: retained production
  evidence including turn-20 battles and action/speech loops.
- `backend/src/e2e-observer.ts`: stable E2E sheets useful for one explicit
  fixture stratum, not a representative population.
- `packages/shared/src/battle-engine.test.ts`: deterministic rule coverage.
- `packages/shared/src/battle-pacing-observe.ts`: the initial candidate-search
  harness whose applicability is restricted by this document.
