# Actual-Turn Input-Derivability Replan

Status: adopted on 2026-08-06 after the user accepted `defer`

Decision lineage:
`actual-turn-capture-authority-v1` -> `changed` -> input-derivability PoC

Authoritative schedule:
`docs/battle-pipeline-actual-turn-shadow-observation.pert`

## 1. Why the plan changed

The adopted runtime does not authoritatively produce all five input areas
required by `ConflictHandlingApplicabilityInput`:

- `allowedFallbacks`
- coarse `proposals`
- `adaptive` execution and contested references
- purpose-scoped `reads`
- consistency `issues`

Actual-turn capture is therefore deferred. The replacement path tests whether
these inputs can be produced with explicit provenance and without inference
before capture authority is reconsidered.

## 2. PoC milestones and effectiveness checks

Velocity basis: `453p/128d`, or approximately `3.539p/d`.

| Task | Estimate | Forecast | Intended effect | Effectiveness evidence |
|---|---:|---:|---|---|
| `T_INPUT_DERIVATION_PROTOCOL` | 1p | 0.283d | Make authoritative derivation testable before code is accepted | Every one of the five input areas has an allowed source map, explicit unavailable state, inference boundary, fixtures, metrics, and stop conditions |
| `T_INPUT_DERIVATION_POC` | 2p | 0.565d | Determine whether runtime-shaped values can form complete inputs offline | Every emitted field carries source provenance; missing or ambiguous sources are rejected; no events, prose, cognition, speech, or narration are used as substitutes |
| `T_INPUT_DERIVATION_EVAL` | 2p | 0.565d | Measure derivability rather than assuming the adapter is correct | At least 15 preregistered cases cover all five areas plus missing and ambiguous controls; 100% provenance for emitted fields; zero inferred fields; 100% rejection of missing required sources; identical output over 20 replays; unchanged input digests |
| `T_CAPTURE_AUTHORITY_REVIEW` | 1p | 0.283d | Prevent a technically successful PoC from silently becoming capture authority | A new exact candidate is frozen and explicitly decided by the user; only a conformant approval unlocks actual sampling |

Possible derivability evaluation results are `supported`, `revise`,
`unsupported`, or `indeterminate`. `supported` is evidence for the next
authority review; it is not capture authorization by itself.

## 3. Remaining schedule

After the four-task derivability path, the existing observation path remains:

| Task | Estimate | Forecast |
|---|---:|---:|
| `T_ACTUAL_SAMPLE` | 2p | 0.565d |
| `T_OBSERVATION_EVAL` | 2p | 0.565d |
| `T_OBSERVATION_DECISION` | 1p | 0.283d |

Total remaining work is 11p, forecast as approximately 3.108d at the current
velocity. The forecast is an empirical planning conversion, not a deadline or
an effectiveness guarantee.

## 4. Authority boundaries

The derivability path is offline and local. It does not authorize runtime hook
implementation or activation, DB or network access, external LLM or XAI calls,
user-data capture, canonical or battle persistence writes, release, or
deployment.

There are two later decisions:

1. starting each recommended implementation task remains an explicit work
   decision;
2. after derivability evaluation, actual-turn capture requires a separate exact
   authority approval even if the PoC result is `supported`.

Classifier changes, runtime adoption, persistence, release, and deployment
remain separately gated after the observation plan.
