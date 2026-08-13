# Narrator presentation-focus pilot analyst notes

- Date: 2026-08-13
- Role: implementation-side inspection, not a blinded judge
- Acceptance authority: none

## Deterministic observations

- All 16 logical calls completed in 16 physical attempts with `grok-4.3` and
  `reasoning_effort: none`.
- Observed usage was 40,996 tokens and the price-snapshot estimate was
  USD 0.053289, below both frozen ceilings.
- Candidate narration averaged 66.63 characters versus 80.00 for control, a
  16.7% reduction.
- Both arms hit the frozen lexical target heuristic in 6 of 7 eligible cases.
- Neither arm returned character speech, and every opening was unique within
  its arm.
- NPF08 had no structured focus candidate. Its control and candidate request
  digests are identical, so differences between N005 and N009 are sampling
  noise rather than a candidate intervention.

## Output-level inspection

These are qualitative hypotheses for a later frozen review, not scores.

- NPF03: candidate N014 explicitly says that vitality returns to Rem, while
  control N012 mostly depicts breathing and atmosphere. This is the clearest
  favorable example for impact legibility.
- NPF04: candidate N008 makes the failed reach visible with `届かず`; control
  N010 shows the shadow unraveling but leaves the failure less explicit.
- NPF05: both outputs convey the switch to defense. Candidate N007 is tighter;
  control N015 adds Nagi watching and a spreading ripple that are not needed to
  establish the committed result.
- NPF01: control N006 explicitly states that Rem cannot continue fighting.
  Candidate N011 stops at a dropped knee. This is a material counterexample:
  the selected primary result was present in the prompt but not fully verbalized.
- NPF02 and NPF06: both arms make the main result legible. The candidate is
  shorter, but this single sample does not establish a quality gain.
- NPF07: both arms add unsupported activity for Rem even though only Nagi's
  quiet reflection was committed. Candidate N002 says Rem measures the
  distance; control N003 says Rem looks at the stone floor. Presentation focus
  did not by itself solve release-context invention.

## Interim interpretation

The first pilot supports a narrow claim: presentation focus tends to compress
the narration and can make some recovery/failure results easier to read. It
does not support the stronger claim that a single focus reliably preserves the
most decisive consequence. The incapacitation miss and the release-scene
invention are explicit counterexamples.

Do not adopt or tune thresholds from this run. A follow-up should first decide
whether the prompt must require an explicit natural-language realization of
terminal outcomes and whether release should forbid unsupplied counterpart
activity. Freeze that revision and reviewer contract before generating another
sample.
