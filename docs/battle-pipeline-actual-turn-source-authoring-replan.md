# Actual-Turn Source-Authoring PoC Replan

Status: adopted on 2026-08-06 after the user requested a plan change

Decision lineage:
`input derivability revise` -> `capture deferred` -> source-authoring PoC

Authoritative schedule:
`docs/battle-pipeline-actual-turn-shadow-observation.pert`

## 1. Revised objective

The pure input derivation method is effective when all five explicit source
artifacts exist, but the reviewed ordinary runtime produces none of them. The
next objective is therefore:

> Determine whether an ordinary-turn-shaped execution can author and assemble
> all five authoritative artifacts in memory, with explicit provenance and
> without changing the resolved result, externally visible behavior, call
> topology, or persistence.

This is a PoC objective. Passing it does not prove that battle results are
correct, that unseen turns generalize, or that actual capture is safe or
authorized.

## 2. Milestones and effectiveness checks

Velocity basis: `453p/128d`, or approximately `3.539p/d`.

| Task | Estimate | Forecast | Intended effect | Effectiveness evidence |
|---|---:|---:|---|---|
| `T_SOURCE_AUTHORING_PROTOCOL` | 1p | 0.283d | Make source ownership and non-interference falsifiable before code is accepted | Each of the five artifacts has one semantic owner stage, exact source fields, lifecycle, provenance, invariants, negative cases, decision rubric, and stop conditions |
| `T_SOURCE_AUTHORING_CORE_POC` | 2p | 0.565d | Test whether owner-stage values are sufficient to create the five artifacts without inference | Pure constructors produce all registered artifacts from explicit runtime-shaped fixtures; every field has source provenance; missing or ambiguous sources fail closed; input bytes and battle results remain unchanged |
| `T_SOURCE_AUTHORING_SHADOW_POC` | 2p | 0.565d | Test whether the artifacts can coexist across an ordinary turn without becoming behavior or persistence | A disabled-by-default in-memory shadow assembly produces a complete set for eligible deterministic ordinary-turn fixtures; outcome, next-state, narration-input, call-trace, and persistence-candidate digests match the control path; no capture or external call occurs |
| `T_SOURCE_AUTHORING_EVAL` | 2p | 0.565d | Measure actual availability and non-interference instead of assuming successful wiring is useful | Preregistered positive, missing, ambiguous, contested, partial, and fail-open cases run 20 times; require `5/5` eligible availability, complete provenance, zero inference, exact control/shadow parity, unchanged input digests, deterministic outputs, and zero extra DB, network, provider, LLM, XAI, canonical, battle, or persistence writes |
| `T_CAPTURE_AUTHORITY_REVIEW_V2` | 1p | 0.283d | Prevent source-authoring evidence from silently authorizing real data collection | Freeze evidence and the exact future capture candidate, then obtain a new explicit user decision; only a conformant approval unlocks actual sampling |

The two implementation PoCs are separated deliberately. A passing pure
constructor does not establish that cross-stage lifecycle and ordinary-turn
assembly are non-interfering.

## 3. Evaluation decision rubric

- `supported`: all preregistered availability, provenance, fail-closed,
  determinism, parity, and zero-side-effect hard gates pass.
- `revise`: failures are attributable to a bounded source contract, owner-stage,
  or in-memory lifecycle change that does not require result semantics or
  persistence changes.
- `unsupported`: complete authoritative artifacts require inference, changed
  battle semantics, changed call topology, or new persistence behavior.
- `indeterminate`: evidence identity, coverage, replay stability, or required
  control observations are insufficient to apply the rubric.

Classifier output is not an oracle and is not needed to decide this stage. XAI
may be used later only when a semantic ambiguity cannot be resolved by the
frozen schema, provenance, parity, and lifecycle evidence.

## 4. Remaining schedule

| Path | Estimate | Forecast |
|---|---:|---:|
| source-authoring protocol through second authority review | 8p | 2.260d |
| existing sample, observation evaluation, and final decision | 5p | 1.413d |
| total remaining | 13p | 3.673d |

The forecast uses the current empirical velocity. It is neither a deadline nor
an assurance that the PoC or final observation result will be correct.

## 5. Authority boundaries

Adopting this plan does not start any implementation task. Each task still
requires the user's explicit instruction to proceed.

Until `T_CAPTURE_AUTHORITY_REVIEW_V2` receives a conformant explicit decision,
the plan does not authorize actual-turn data capture, activation of the frozen
capture candidate, DB or network access, external providers, external LLM or
XAI calls, canonical or battle persistence changes, release, or deployment.

The source-authoring PoC may use only deterministic local fixtures and
in-memory, fail-open observations within the explicitly approved task. Runtime
adoption outside the PoC, classifier changes, and production use remain
separate decisions.
