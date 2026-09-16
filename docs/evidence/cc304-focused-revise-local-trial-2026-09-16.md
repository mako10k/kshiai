# cc304 focused revise local trial — 2026-09-16

## Scope

This record covers one controlled local appearance-revision trial only. The trial
uses the real owner HTTP command, queued worker, controlled semantic provider,
common kernel, character adapter, persistence, and owner review response. It does
not enable focused revision in the ordinary runtime and does not cover create,
migration, final acceptance, paid provider use, deployment, or activation.

## Implementation boundary

`buildRoutes` accepts an explicit local-trial option that selects the
`appearance` cluster. Omitting the option preserves the existing generic revision
route and its V2 compatibility check. The production route construction omits the
option.

For the controlled trial, the route binds the request to the current immutable V3
generation and registers a focused `revise` source. The worker then uses the
existing semantic-authoring provider, kernel, character adapter, and persistence
path.

## Observed diagnostic result

The focused-authoring test file completed with 7 passing tests. In the bounded
revise case, the owner HTTP command returned an attempt, the worker retained the
Japanese appearance instruction, an invalid first provider response did not
advance the candidate, the repaired candidate changed only the appearance claim,
the owner review response exposed the old and candidate appearance values, and
the current generation pointer remained on the original generation. Final
acceptance remained unavailable and `resultGenerationId` remained null.

This execution result is diagnostic until evaluated through its exact Seal and
Cause state. A passing command alone is not current test authority.

## Authority limit

The existing accepted-design and character-adapter Causes used by this path are
transitively stale in the current graph. Any implementation and verification
Seal created for this trial therefore remains draft/stale evidence. It may record
what ran against those exact historical Causes, but it must not be used as a
current conformance or completion claim.

## Value account

Realized end-user value is zero: no ordinary runtime path was activated and no
current character was changed. The future-value contribution is a bounded local
observation that the existing components can carry one appearance revise request
to a non-current owner-visible review candidate. Current authority still requires
reconciliation of the stale governing Cause chain before this diagnostic result
can become current evidence.
