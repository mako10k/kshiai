# Battle pacing local measurement (2026-08-12)

## Decision scope

This is deterministic local evidence for `T_MEASURE_LOCAL_PACING`. It is not
production evidence and does not adopt a policy. No LLM, provider, network, or
deployment was used.

The implementation freezes these coupled values in one `BattlePacingPolicy`
snapshot per new battle: turn limit, finisher unlock turn, decisive-pressure
start/maximum, warning distance, and deterministic terminal adjudication.
Legacy saves without the snapshot retain the current derived policy.

## Compared policies

| Policy | Limit | Finisher | Pressure | Warning | Terminal authority |
|---|---:|---:|---:|---:|---|
| `pacing-current-v1-20` | 20 | 10 | 10 to 20 | 1 turn | deterministic engine |
| `pacing-local-12-v1` | 12 | 6 | 6 to 12 | 1 turn | deterministic engine |

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
| Completion turn, mean | 9.4125 | 10.3333 |
| Completion turn, median | 10 | 11 |
| Completion-turn variance | 1.8257 | 1.7639 |
| KO rate | 100% | 91.67% |
| Limit-hit / forced-terminal rate | 0% | 8.33% |
| Mean committed HP change per resolved turn | 20.7348 | 18.7738 |
| Repeated-action rate | 73.20% | 61.61% |
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

Recommendation to the owner: **revise**, rather than adopt, `pacing-local-12-v1`.
Keep the versioned snapshot implementation, then measure a follow-up candidate
that separates the turn limit from finisher unlock/power timing. The desired
eight-turn average remains a hypothesis. Speech quality and production pacing
require separately authorized evidence.
