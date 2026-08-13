# Character focus blinded expression rubric

Status: frozen deterministic-slice rubric candidate. Provider, model,
temperature support, call ceilings, token ceiling, monetary ceiling, and actual
replay authorization remain owner decisions.

## Review unit and blinding

One review unit is one synthetic scenario output with the frozen character and
observer-relative input shown to the reviewer. The reviewer sees the permitted
evidence, forbidden evidence, expected no-change behavior, and generated public
line, but not arm A/B/C/D, sample order, focus band, provider, or another
reviewer's scores.

Randomize stable opaque output IDs before review. Two reviewers independently
score every unit. Freeze both score sets before revealing arms. A third named
adjudicator resolves only disagreements that affect a binary metric; retain all
original scores and disagreement counts.

## Per-output fields

| Field | Values | Rule |
| --- | --- | --- |
| Observer safety | pass / fail | Fail if the line relies on any forbidden, hidden, or opponent-private fact |
| Fresh-evidence grounding | yes / no / not eligible | Yes only when the line materially uses the newest selected perceived evidence; lexical mention alone is insufficient |
| Semantic response | yes / no / not eligible | Yes when the line answers or repositions against a new counterpart move, speech, or committed result |
| Unsupported novelty | yes / no | Yes when the line invents a new event, intention, perception, or state to appear responsive |
| No-change restraint | yes / no / not eligible | In no-evidence cases, yes only when the line does not fabricate situational development |
| Character consistency | 0 / 1 / 2 | 0 contradiction, 1 plausible but weak/generic, 2 clearly consistent with frozen identity and speech style |
| Naturalness | 0 / 1 / 2 | 0 incoherent, 1 understandable but awkward, 2 coherent natural expression |
| Weak-cue uptake | yes / no / not eligible | For weak-cue scenarios, yes when the line reacts to that cue without overstating certainty |
| Strong-cue uptake | yes / no / not eligible | For strong-cue scenarios, yes when the line remains grounded in the strong cue |

Reviewers also copy the normalized exact public line and speaker ID into the
sequence sheet. Exact uniqueness and longest same-speaker run are computed, not
judged.

## Aggregation

- Compute each binary rate per scenario from eligible outputs, then macro-average
  scenarios. Never let a three-sample easy scenario dominate another scenario.
- Character consistency and naturalness are normalized to `[0, 1]` by dividing
  the mean ordinal score by two.
- `Low-focus prose non-inferiority` is the larger loss across normalized
  character consistency and naturalness for strained D versus steady C.
- `Weak-cue focus calibration` compares weak-cue uptake for sharp D versus
  strained D.
- `Strong-cue non-inferiority` compares strong-cue uptake for strained D versus
  sharp D.
- Report raw yes/no/eligible counts, reviewer-specific values, adjudicated
  values, percent agreement, and Cohen's kappa where both labels vary. Do not
  replace raw counts with kappa.
- Apply the thresholds in `docs/character-focus-hypothesis-plan.md` without
  rounding a failing value into a pass.

## Reviewer stop conditions

Stop and invalidate the affected frozen set if arm identity becomes visible,
an input contains forbidden evidence, a sample is missing without an accounting
status, output IDs collide, the provider configuration changes, or reviewers
receive different fixture revisions. Do not repair, regenerate, or adapt a
prompt after viewing scores.
