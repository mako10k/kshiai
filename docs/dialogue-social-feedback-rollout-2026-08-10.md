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

## Follow-up RCA — appraisal subject ownership

Post-rollout trace review found a remaining semantic loop in battle
`btl_9c7e05fae4c9bfb80d3b6229`. On turns 16–19, a character's private
`observedImpact` described the counterpart repeating a warning. The same turns
continued to select `fresh_leverage` and `advance`, even though the intended
social-feedback mechanism is for the speaker to account for whether the
speaker's own preceding expression has retained attention, credibility, or
force.

This is not evidence of an action/result A/B swap. The schema records the
bearer of a social consequence (`self` or `relationship`) but does not bind its
appraisal subject to the speaker's preceding expression. The model therefore
can validly use counterpart speech as the subject of the observation while
still assigning the consequence to `self` or `relationship`. In addition, the
expression brief permits `counterpart_speech` as a public focus. The intended
self-appraisal and legitimate response to counterpart speech are consequently
represented in the same free-form appraisal surface.

The next implementation must make that ownership structural: bind observed
impact, observed social consequence, and continuity basis to
`own_previous_expression`; keep counterpart-speech response in a separate
semantic context that cannot satisfy repetition suppression, social cost, or a
continuity decision. This retains character-authored deliberate repetition but
removes the route by which a speaker externalizes its own anti-repetition
reflection onto the counterpart. It requires schema and pipeline changes, not
phrase matching, prompt-only bans, cancellation, retries, or additional model
calls.
