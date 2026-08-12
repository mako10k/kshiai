# ADR-0004: Versioned lightweight psyche dynamics

- Status: Accepted
- Date: 2026-08-12
- Decision owner: Product owner
- Related: GitHub Issue #98; ADR-0002; ADR-0003; `docs/dialogue-context-projection.pert`; `docs/battle-semantic-state.md`
- Detailed design: `docs/lightweight-psyche-reaction-policy.md`

## Context

The battle pipeline currently uses an LLM to advance each character's private deep-psyche state. Sequential bucket execution can increase critical-path latency, and calling an LLM for every private appraisal is expensive and can make ordinary reactions more elaborate than the character or situation warrants.

Reducing calls must not merge contexts that have different authority or visibility. Private psyche, action selection, outward expression, semantic/world adjudication, and narration are separate consumers. Combining them into one prompt would weaken the observer-relative and private-state boundaries deliberately established by the battle pipeline.

Character differences must affect not only the initial emotional state but also how a character appraises input, how strongly state changes, how dimensions interact, and how quickly state returns toward baseline. At the same time, embedding an entire character sheet would mix psyche traits with names, appearance, abilities, equipment, setting prose, and other irrelevant or sensitive features.

## Decision drivers

- Preserve context, privacy, and authority separation even when it costs additional independent calls.
- Remove routine private-psyche evolution from the LLM critical path.
- Keep the first implementation deterministic, bounded, explainable, and replayable.
- Support character-specific emotional dynamics rather than only different initial values.
- Prevent unrelated character fields from influencing psyche dynamics through an opaque embedding.
- Version every feature contract, model, weight set, and character psyche profile used by a battle.

## Considered options

1. Combine psyche, action, and expression in one LLM call. This reduces calls but crosses consumer and visibility boundaries and is rejected.
2. Keep LLM-authored deep psyche and only shorten prompts. This retains cost, latency, and over-elaboration and is not the target architecture.
3. Immediately adopt a third-party learned affect model. Available models have mismatched inputs, datasets, validation, or licensing and are not accepted as authoritative.
4. Establish an explicit-parameter deterministic model, collect and evaluate trajectories, then train a small bounded neural dynamics model whose character variation is conditioned only on a curated psyche-trait representation. Choose this option.

## Decision

### Stable component boundaries

The psyche engine consumes only a private, server-validated feature packet derived from the character's observer-relative perception, prior private psyche state, and battle-frozen psyche trait profile. It emits a bounded private state plus reason-coded transition evidence.

Action selection and outward expression remain independent consumers. They receive separate least-authority projections of psyche state and must not receive each other's raw inputs or outputs. Narration and semantic/world adjudication remain separate as well. LLM-call reduction never justifies combining these contexts.

### Initial explicit model

The first authoritative implementation uses named numeric parameters and deterministic transition functions. It distinguishes:

- initial or baseline psyche state;
- appraisal sensitivity to normalized event features;
- gain and inhibition between psyche dimensions;
- decay and recovery time constants;
- action-facing projection tendencies;
- expression-facing projection tendencies.

A trait such as fearfulness therefore changes threat sensitivity and recovery dynamics, not merely the initial fear value. Every update is bounded, replayable, and accompanied by machine-readable contribution receipts.

### Learned target model

After the explicit baseline is stable and accepted evidence exists, train a lightweight neural state-transition model. The shared model represents common psyche dynamics. Character-specific variation is a bounded residual or parameter modulation of that shared model; it may not replace the base dynamics without limits.

The learned model starts in shadow mode. Authoritative adoption requires stability, calibration, swap-symmetry where applicable, bounded output, replay behavior, privacy, failure fallback, and character-distinction acceptance. The deterministic explicit model remains a fallback and evaluation baseline.

### Psyche-only character embedding

Do not embed the complete character sheet or arbitrary character prose. Define a versioned `PsycheTraitProfile` containing only fields that describe private appraisal and affect dynamics. Normalize the accepted profile, serialize the normalized value into a canonical structured string, then embed that string.

Normalization is part of the authoritative feature contract, not an incidental preprocessing detail. It must define at least:

- Unicode normalization and whitespace handling;
- controlled vocabulary, aliases, and locale-independent labels;
- fixed field and collection ordering;
- explicit defaults and distinct handling of unknown, absent, and neutral values;
- common numeric scales, clamping, and quantization;
- duplicate and contradictory trait resolution;
- canonical units, polarity, and direction for sensitivities, gains, inhibition, coupling, and decay;
- deterministic serialization with no timestamps, editor metadata, or unstable identifiers.

Semantically equivalent accepted profiles must normalize to the same canonical string and embedding input. Materially different psyche traits must not collapse merely because their source prose uses similar words. The normalized profile and its digest are stored alongside the source structured profile so administrators can inspect both the authored meaning and the exact model input.

Excluded material includes names, appearance, combat parameters, abilities, equipment, narration style, battlefield prose, public records, and unrelated memories. Free-form source prose may influence the profile only through a separate validated extraction or owner-authored structured edit; the dynamics model receives the accepted profile, not the source prose.

The embedding conditions bounded gains, decay constants, coupling, or a low-rank residual. It is not itself the psyche state and does not directly select actions or author expressions. Explicit trait parameters remain inspectable alongside the embedding so that learned correlation does not erase author control.

### Version and battle binding

The following are immutable generations and are bound through the battle asset manifest defined by ADR-0003:

- psyche input-feature contract;
- explicit transition-policy version;
- `PsycheTraitProfile` schema and accepted character profile revision;
- psyche-profile normalization and canonical-serialization version;
- embedding model and embedding vector digest;
- neural transition architecture and weight digest;
- normalization, quantization, and fallback policy.

Retries and later turns use the same bound generations. Editing a character psyche profile or promoting new weights affects only newly created battles unless an explicit migration ADR is accepted.

## Reference implementations and research

These are research references and shadow candidates, not adopted dependencies:

- ALMA separates long-term personality, medium-term mood, and short-term emotion for virtual characters: <https://citeseerx.ist.psu.edu/document?doi=679bfc64621dae3a2247be838d042643840961b3&repid=rep1&type=pdf>.
- EMA and FAtiMA provide appraisal-oriented, modular emotion architectures; FAtiMA keeps perception, appraisal, affect, and behavior components separable: <https://arxiv.org/abs/2103.03020>.
- Personality-affected Emotion Transition conditions VAD emotion deltas on dialogue context and Big Five traits, and publishes the PELD dataset: <https://arxiv.org/abs/2106.15846> and <https://github.com/preke/PELD>.
- Chordia publishes a small MLP/ONNX PAD transition model with sub-millisecond claimed inference, but its current synthetic-data training, seven-feature interface, validation scope, and license prevent authoritative adoption without separate evaluation: <https://huggingface.co/Corolin/Chordia>.
- GoEmotions/DistilBERT models classify emotion expressed in text; they do not implement private state transition and are not substitutes for the psyche engine.

## Consequences

### Positive

- Routine psyche updates can avoid an LLM call without crossing context boundaries.
- Character differences affect dynamics while remaining authorable and inspectable.
- The explicit baseline supplies labels, receipts, regression fixtures, and a fallback for later learning.
- Canonical psyche-only embeddings reduce semantic leakage from unrelated character fields.
- Versioned normalization prevents spelling, ordering, scale, and locale differences from creating accidental character variation.
- Small fixed-shape inference can run locally and independently of provider availability.

### Negative and risks

- Explicit parameters and event features require careful authoring and calibration.
- Training solely to imitate the initial rule model cannot exceed that model; later labels need independent acceptance evidence rather than self-distillation alone.
- A learned correlation can encode unintended proxies even from curated fields, so ablation and sensitivity tests are required.
- Embedding and weight retention become part of battle replay and asset-generation management.
- A low-dimensional affect state cannot capture every narrative nuance; expression remains a separate consumer.

## Verification

- Changing appearance, skills, equipment, names, or narration prose leaves psyche transition input and output unchanged.
- Equivalent aliases, Unicode forms, ordering, whitespace, and numeric source scales normalize to the same canonical psyche profile and digest.
- Unknown, absent, and explicitly neutral traits remain distinguishable after normalization.
- Changing an accepted psyche trait changes only documented transition dimensions within configured bounds.
- Private psyche never enters opponent, public, narrator, or expression inputs except through their explicit projections.
- The same bound state, feature packet, trait profile, and model generations produce the same quantized result.
- The neural candidate cannot exceed configured residual, gain, coupling, or decay limits.
- Shadow evaluation compares against the deterministic baseline and accepted behavioral fixtures without changing battle state.
- Missing or failed inference deterministically falls back without a second provider call.

## Implementation references

- No implementation is authorized or recorded by this ADR alone.
- Add feature-contract, baseline, shadow-model, training-data, evaluation, and promotion commits only after their respective plan gates are approved.
