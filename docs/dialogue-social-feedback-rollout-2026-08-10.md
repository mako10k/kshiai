# Dialogue social-feedback rollout — 2026-08-10

## Outcome

`v0.14.8` is production-deployed after protected staging and owner approval.
The promoted immutable artifacts are Cloud Run revision `kshiai-api-00076-fal`
and Worker version `a0dcd308-cb2e-4ac3-a7fe-a02262931546`.

The isolated staging battle `btl_bb6512d7ae592b7f365972a1` produced 19 unique
public lines out of 21. Nagi was 11/11 unique; Gaku had two exact duplicates.
This is a material improvement over the previous 16/21 observation, but not a
claim that all repetition is eliminated.

## What changed

- Opponent-specific plans and reflections are separate read-only matchup memory
  at compact turn 0, rather than recursive current-battle private memory.
- The compact prologue clears inherited private memory on both normal and
  provider-fallback paths.
- Private dialogue appraisal distinguishes fresh-leverage advancement from
  `social_reappraisal`: changing angle because prior words lost force.
- Repetition remains available as a character-authored `protective_hold`; no
  phrase list, prose matching, speech retry, cancellation, extra LLM call, or
  mechanical dialogue penalty was introduced.

## Operating policy from here

1. Keep production compact dialogue under observation; retain battle traces and
   dialogue-quality metrics as diagnostics only, never runtime controls.
2. Complete the remaining protected production observations across additional
   matchups before treating the rollout plan as accepted.
3. Reopen RCA when a semantic loop recurs, a provider fallback leaks excluded
   state, or mechanics/observer-safety diverge. Diagnose from structured traces
   before changing prompts or schemas.
4. Preserve the boundary: LLMs author private meaning and public expression;
   deterministic code validates schemas, ownership, persistence, and safety.
