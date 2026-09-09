# Compact V2 observation-starvation investigation — 2026-09-09

## Scope and conclusion

This investigation explains the near-duplicate ordinary utterances in the
successful synthetic replay. It does not claim that production battles have the
same cause.

The replay fixture authored different scene changes on all three turns, but
passed them only as free-form summaries on `wait` events. It did not create
sensory evidence or update the observer perception frame. The dialogue boundary
correctly refuses to mine event prose, so the intended changes disappeared from
the actual `turnObservation` input.

The retained requests show the resulting chain:

1. Ordinary turns two and three contained the preceding self utterance but no
   fresh `counterpartResult` or `ambientChange`.
2. Deep psyche produced almost the same `nextApproach`, `relationshipMove`, and
   `publicAim` on both turns.
3. Expression realized those briefs as `相手からの反応がない。` and
   `相手からの反応がまだない。`.

For this replay, observation starvation is therefore the source condition and
the semantic loop forms before expression. Whether production battles suffer
the same starvation remains unknown until production-shaped evidence is
inspected.

## Evidence Chain

- `E-MONO-001`: the fixture contains distinct authored changes.
- `E-MONO-002`: the harness represented them only as event-summary prose and
  supplied no matching `PerceptionEvidence`.
- `E-MONO-003`: run-state requests show empty external-result collections on
  ordinary turns two and three.
- `E-MONO-004`: the corresponding psyche semantic briefs were near-duplicates.
- `C-MONO-001` `📜`: the synthetic replay fixture lost intended external changes
  before the dialogue observation boundary.
- `C-MONO-002` `📜`: the observed pair became repetitive upstream of expression.
- `C-MONO-003` `🎲`: the same mechanism may contribute to production monotony;
  more production-shaped evidence is required.

## Corrective action

`A-MONO-001` `🚀`: keep the accepted production contract unchanged and make the
fixture express its intended changes as bounded observer-safe sensory evidence.
Project that evidence through the normal `projectObserverPerception` path, pass
it to `advanceCharacterAgents`, and assert in network-zero preparation that each
ordinary turn contains fresh external evidence linked to its exact event ID.

A new ADR is not required: this does not alter state ownership, privacy,
persistence, schema, retry, or provider behavior. It corrects the harness to use
the observation authority already required by ADR-0025 and the shared dialogue
contract.

The authoritative causal record is
`compact-v2-observation-starvation-2026-09-09.think`.

## Separate finding

Validation of this correction exposed an independent event-provenance defect in
the composed perception path. It did not cause this replay's missing phenomena,
because this replay supplied no sensory evidence to that path. Its cause,
impact, escape, and correction are recorded separately in
`compact-v2-observation-provenance-rca-2026-09-09.md` and its authoritative
`.think` pair.
