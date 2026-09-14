# Compact V2 observation-provenance RCA — 2026-09-09

## Scope

This RCA covers an independent defect between observer perception projection
and the deep-psyche `TurnObservationPacket`. It is not the root cause of the
earlier synthetic replay's missing phenomena: that replay supplied no sensory
evidence at all. The defect was exposed only after the replay fixture began
using the normal perception path.

## Root cause

`projectObserverPerception` produced opaque, hashed percept IDs through
`observerPerceptId`, but `buildTurnObservationPacket` independently reconstructed
an obsolete literal `percept.<side>.<evidenceId>` value. These representations
could not match, so the packet retained the observed phenomenon but lost its
committed `sourceEventIds`.

The producer implementation originated in commit `115e2e04` on 2026-08-04. The
incompatible consumer lookup was added later in commit `348cb2f5` on 2026-08-10.

## Contributing cause

The opaque-ID helper was private to the projection module, while the relationship
between projection and packet construction was represented only by untyped
strings. That allowed the consumer to duplicate the contract incorrectly.

## Escape and detection cause

The source-link unit test manually constructed the literal percept ID expected
by the consumer. It did not obtain a frame from `projectObserverPerception`, so
the test never exercised the incompatible producer and consumer together.
Typecheck and build could not detect two valid strings with different meanings.

## Impact

Confirmed:

- projected sensory items lost their committed event provenance;
- deterministic psyche-reaction receipts received empty source-event lists;
- character-focus scoring lost its event evidence-density contribution;
- phenomenon text still reached the packet.

Unknown:

- how frequently the affected sensory-evidence path ran in production;
- whether the lost provenance materially changed production dialogue quality;
- whether it contributed to reported production monotony.

## Corrective action

Commit `73111aa` exports `observerPerceptId` as the single ID derivation and uses
it in packet evidence lookup. It also updates affected fixtures. This corrects
the source-producing implementation mismatch without exposing server-only
entity identity in the observer frame.

## Recurrence prevention

A composed regression now creates validated sensory evidence, projects it with
`projectObserverPerception`, builds `TurnObservationPacket`, and asserts both the
observer-safe phenomenon and its exact committed event ID. The full test suite,
typecheck, build, and network-zero replay preparation passed after the fix.

The authoritative causal record is
`compact-v2-observation-provenance-rca-2026-09-09.think`.
