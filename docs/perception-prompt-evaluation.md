# Perception prompt topology evaluation

Status: v8 evaluation complete; reviewed and unqualified models recorded
Fixture version: `perception-prompts-v8`
Last updated: 2026-08-04

## Purpose

Choose whether semantic world reconciliation and non-mechanical sensory evidence
share one LLM call or use two responsibility-specific calls. This is a reviewed
provider/model decision, not a per-turn runtime heuristic.

The preferred topology remains `combined` when it meets every quality floor. A
`split` topology is accepted only when combined fails a quality floor and split
passes all floors. If neither passes, no topology is selected.

## Fixed matrix

The versioned matrix contains three cases:

1. a strong impact in darkness where side A cannot identify side B;
2. source-less footsteps in fog, represented as ambient evidence;
3. a visible persistent object pickup requiring a correct world patch.

Each topology is evaluated three times per fixture. This yields nine combined
samples and nine split samples. Split has two sequential calls per sample, so a
full provider/model evaluation makes 27 billed calls. There is no retry or
adaptive repair call.

## Metrics and floors

| Metric | Floor |
|---|---:|
| World schema-valid rate | `>= 0.98` |
| Sensory schema-valid rate | `>= 0.98` |
| World-patch correctness | `>= 0.95` |
| Sensory coverage | `>= 0.90` |
| Attribution error rate | `<= 0.02` |
| Identity leakage rate | `0` |

Latency p95/mean and token totals/means are recorded but cannot override a
quality failure. Combined response sections are scored independently, so invalid
sensory evidence does not make a valid world patch invalid.

## Running an evaluation

The command requires an explicit provider and `--execute` acknowledgement:

```bash
npm run eval:perception-prompts --workspace=backend -- \
  --provider openai \
  --model gpt-4.1-mini \
  --repetitions 3 \
  --output docs/evidence/perception-openai-gpt-4.1-mini.json \
  --execute
```

The output file is created with exclusive-create semantics and is never used to
rewrite configuration automatically. Review the report, then add an exact
provider/model entry to `REVIEWED_PERCEPTION_TOPOLOGIES` in code. Unknown model
revisions do not inherit a decision from another model or provider.

## Current reviewed decisions

| Provider | Model | Topology | Evidence |
|---|---|---|---|
| `mock` | `mock-v1` | `combined` | 9 deterministic reference samples per topology; all quality metrics pass |
| `openai` | `gpt-4.1-mini` | `combined` | v8: combined 9/9 passes every quality floor; split schema, world, and coverage each `0.8889` |

The checked-in OpenAI report is
[`evidence/perception-openai-gpt-4.1-mini-v8.json`](evidence/perception-openai-gpt-4.1-mini-v8.json)
with SHA-256
`c6212fb333ee44fced7cd6f6f6236495286d3c1df695b84e9f33516aa1decb05`.
Combined averaged `6112.89 ms` and `2351.22` tokens; split averaged
`10565.78 ms` and `2983.11` tokens.

`xai/grok-4-fast-non-reasoning` and `xai/grok-4.5` remain unreviewed: the fast
model's formal v8 run left combined sensory schema/coverage at `0.7778`; split
reached `0.8889` but also exceeded the attribution-error floor at `0.03125`.
The engine model repeatedly exceeded the 30-second diagnostic timeout. The XAI
v8 report is
[`evidence/perception-xai-grok-4-fast-non-reasoning-v8.json`](evidence/perception-xai-grok-4-fast-non-reasoning-v8.json)
with SHA-256
`bc2536024338a851d3243f8595ea8257eefcc01c7fae5c8cb5a097e14b7e336f`.
Unknown or failed models do not inherit the OpenAI decision. Runtime semantic
reconciliation remains world-only until `T_EVIDENCE` integrates the exact
reviewed entry.
