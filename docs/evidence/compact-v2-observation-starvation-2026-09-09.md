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

During the network-zero correction check, a second existing defect became
visible. The projected phenomena reached the packet, but their event provenance
did not: projection hashes observer percept IDs, while packet construction tried
to match the unhashed evidence ID. Thus `sourceEventIds` was empty even on the
normal composed path.

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
- `E-MONO-005`: after normal perception projection was added, all expected
  phenomena arrived but every event-source link was empty because projection
  and packet construction used incompatible percept-ID forms.
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

`A-MONO-002` `🚀`: make perception projection's opaque percept-ID derivation the
single implementation source for packet evidence lookup, and cover the composed
projection-to-packet path. This restores provenance used by reaction receipts
and focus salience without placing server-only entity identity in the observer
frame.

A new ADR is not required: this does not alter state ownership, privacy,
persistence, schema, retry, or provider behavior. It corrects the harness to use
the observation authority already required by ADR-0025 and the shared dialogue
contract.

The authoritative causal record is
`compact-v2-observation-starvation-2026-09-09.think`.
