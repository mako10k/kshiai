# Perception prompt topology evaluation

Status: XAI primary topology reviewed; OpenAI remains fallback
Fixture version: `perception-prompts-v10`
Last updated: 2026-08-05

## Purpose and authority boundary

Choose whether semantic world reconciliation and non-mechanical sensory evidence
share one call or use two responsibility-specific calls **within an already
selected provider/model**. This evaluation never selects, promotes, or reorders
providers. XAI is the primary provider and OpenAI is its operational fallback.
An XAI evaluation failure blocks this perception slice for diagnosis; it does
not authorize promotion of the fallback.

The preferred XAI topology is `combined` when it meets every quality floor. If
combined loses structured or semantic accuracy and split passes all floors, XAI
uses split. The selection is reviewed configuration, not a per-turn retry.

## XAI structured-output boundary

The evaluator and XAI semantic reconciler use XAI's native strict JSON Schema
response format. Direction and distance enums are constrained at generation
time, so values such as `contact` cannot be placed in `direction`. This adds no
repair call. The parsed result still passes the shared Zod schemas and semantic
patch validator before use.

XAI documents `response_format.type = "json_schema"` as the mechanism for
schema-conforming structured output:
<https://docs.x.ai/developers/model-capabilities/text/structured-outputs>.

## Fixed matrix

The versioned matrix contains three cases:

1. a strong impact in darkness where side A cannot identify side B;
2. source-less footsteps in fog, represented as ambient evidence;
3. a visible persistent object pickup requiring a correct world patch.

Each topology is evaluated three times per fixture. This yields nine combined
samples and nine split samples. Split has two independent calls per sample:
world and sensory receive the same committed actions/events and the pre-turn
world, and run in parallel. Neither consumes the other LLM response. A complete
evaluation therefore makes 27 billed calls, with no retry or adaptive repair.

## Metrics and floors

| Metric | Floor |
|---|---:|
| World schema-valid rate | `>= 0.98` |
| Sensory schema-valid rate | `>= 0.98` |
| World-patch correctness | `>= 0.95` |
| Sensory coverage | `>= 0.90` |
| Attribution error rate | `<= 0.02` |
| Identity leakage rate | `0` |

Latency p95/mean and token totals/means cannot override a quality failure.
Combined response sections are scored independently, so invalid sensory
evidence does not make a valid world patch invalid.

## Running an XAI evaluation

The command requires an explicit provider and `--execute` acknowledgement:

```bash
npm run eval:perception-prompts --workspace=backend -- \
  --provider xai \
  --model grok-4-fast-non-reasoning \
  --repetitions 3 \
  --output docs/evidence/perception-xai-grok-4-fast-non-reasoning-v10.json \
  --execute
```

The output file is created exclusively and never rewrites configuration. An
exact provider/model decision is added only after review. Unknown revisions do
not inherit another model's decision.

## Current reviewed decisions

| Role | Provider | Model | Current topology | Evidence |
|---|---|---|---|---|
| Primary | `xai` | `grok-4-fast-non-reasoning` | `combined` | v10 combined and parallel split both passed 9/9; combined uses fewer calls and tokens |
| Fallback | `openai` | `gpt-4.1-mini` | historical v8 `combined` | retained as fallback evidence; not a current-v10 XAI substitute |
| Development | `mock` | `mock-v1` | `combined` | deterministic reference samples pass |

The accepted XAI report is
[`evidence/perception-xai-grok-4-fast-non-reasoning-v10.json`](evidence/perception-xai-grok-4-fast-non-reasoning-v10.json)
with SHA-256
`739eb515c822abc5f9f720f12a2745f4774f42faaba8f0b235277b83540cd0e1`.
Both topologies achieved schema validity, patch correctness, sensory coverage,
attribution accuracy, and identity containment of `1.0`. Combined averaged
`3431.89 ms`, p95 `4750 ms`, and `3928.11` tokens. Parallel split averaged
`4040.33 ms`, p95 `5542 ms`, and `5851.22` tokens.

The battle Fit/Gap release gate repeated the same fixed v10 matrix on 2026-08-05.
The fresh primary-provider report is
[`evidence/perception-xai-grok-4-fast-non-reasoning-v10-20260805-fit-gap.json`](evidence/perception-xai-grok-4-fast-non-reasoning-v10-20260805-fit-gap.json)
with SHA-256
`b42c572fbb926f08f5e86e10c2c48fb8130a5a755127d74d5a4d921981d07052`.
All nine combined and nine split samples again passed every quality floor with
zero call errors. Combined averaged `6632.11 ms`, p95 `9861 ms`, and `4464.89`
tokens; parallel split averaged `5995.89 ms`, p95 `8109 ms`, and `6480.67`
tokens. Because both passed and combined uses one call with fewer tokens, the
reviewed XAI topology remains `combined`.

The preceding v9 run is retained as regression evidence. Strict schemas removed
all structural failures, but combined under-attributed the clearly visible
pickup in two samples while split passed. The v10 prompt made committed events
authoritative and removed the split call dependency; both then passed. If that
combined attribution regression returns in provider integration tests, the
reviewed response is XAI parallel split, not provider substitution.

Runtime semantic reconciliation now uses this exact reviewed XAI combined prompt
and response schema. World and sensory sections are parsed and grounded
independently: either section may be rejected while the other remains usable.
OpenAI remains the ordered operational fallback and is not treated as current-v10
XAI prompt evidence.
