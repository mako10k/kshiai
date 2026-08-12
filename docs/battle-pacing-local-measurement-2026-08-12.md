# Battle pacing local measurement (2026-08-12)

> Evidence correction: this single synthetic fixture family is suitable only
> for candidate-search regression. It is not adoption-grade and cannot reject
> Issue #98's pacing hypotheses. See
> [battle-pacing-evidence-validity.md](battle-pacing-evidence-validity.md).

## Decision scope

This is deterministic local evidence for `T_MEASURE_LOCAL_PACING`. It is not
production evidence and does not adopt a policy. No LLM, provider, network, or
deployment was used.

The implementation freezes these coupled values in one `BattlePacingPolicy`
snapshot per new battle: turn limit, finisher unlock turn, decisive-pressure
start/maximum, warning distance, and deterministic terminal adjudication.
Legacy saves without the snapshot retain the current derived policy.

## Compared policies

| Policy | Limit | Finisher | Pressure | Automatic restoration | Terminal authority |
|---|---:|---:|---:|---|---|
| `pacing-current-v1-20` | 20 | 10 | 10 to 20 | legacy 20% | deterministic engine |
| `pacing-candidate-12-v2` | 12 | 6 | 6 to 12 | explicit effects only | deterministic engine |

The 12-turn policy is a proposal only. Its earlier thresholds scale the
decision windows; they are not asserted to be optimal.

## Method

- 240 paired fixtures per policy, fixed seed `9966112`.
- Per-fixture seeded streams prevent a shorter match from shifting later input.
- Character HP, attack, defense, speed, defense choices, initiative ties, and a
  bounded turn-2 delayed effect vary deterministically.
- Both sides use the finisher at the policy unlock turn when still active.
- A KO includes the canonical incapacitation result before the separate
  aftermath presentation beat. A forced terminal is a turn-limit result.
- Speech repetition is explicitly not measured because this harness makes no
  character or narration model call.

Run with:

```sh
node --import tsx scripts/measure-battle-pacing.ts
```

## Results

| Metric | Current 20 | Candidate 12 |
|---|---:|---:|
| Completion turn, mean | 9.4125 | 7.9625 |
| Completion turn, median | 10 | 8 |
| Completion-turn variance | 1.8257 | 2.0028 |
| KO rate | 100% | 100% |
| Early KO (turn 1–2) | 0% | 0% |
| Limit-hit / forced-terminal rate | 0% | 0% |
| Mean committed HP change per resolved turn | 20.7348 | 24.3904 |
| Repeated-action rate | 73.20% | 58.08% |
| First initiative A / B | 52.92% / 47.08% | 52.92% / 47.08% |
| Scheduled delayed effects resolved | 100% | 100% |
| Repeated speech | not measured | not measured |

## Interpretation and recommendation

The candidate reduces repeated actions, preserves paired initiative distribution,
and resolves all bounded delayed effects. It does not improve completion pacing
in this fixture: mean completion is 0.9208 turns later and 8.33% of samples reach
forced terminal judgment. The likely mechanism is that moving the one-use
finisher to turn 6 replaces an otherwise effective attack before pressure has
grown enough; this is a hypothesis to verify, not a production conclusion.

The initial v1 candidate was superseded after parameter search. The v2 search
candidate reaches the eight-turn hypothesis in this synthetic fixture, but it
does not support a permanent retain/revise/adopt decision. Production behavior
under the separately accepted guarded trial is the decision evidence.
