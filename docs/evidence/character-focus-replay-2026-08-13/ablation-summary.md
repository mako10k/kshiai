# Character-focus blinded ablation result

Reviewers: two independent owner-authorized LLM sub-agents. Agreement: 757/816 (92.8%); disagreements: 59.

| Arm | Fresh grounding | Semantic response | Unsupported novelty | Character consistency | No-change restraint | Worst-speaker exact unique | Longest exact repeat |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 91.7% (22/24) | 79.2% (19/24) | 27.8% (10/36) | 100.0% (36/36) | 58.3% (7/12) | 83.3% (10/12, tomori) | 3 |
| B | 87.5% (21/24) | 79.2% (19/24) | 38.9% (14/36) | 100.0% (36/36) | 66.7% (8/12) | 75.0% (9/12, hibana) | 3 |
| C | 91.7% (22/24) | 87.5% (21/24) | 36.1% (13/36) | 100.0% (36/36) | 58.3% (7/12) | 100.0% (12/12, hibana) | 1 |
| D | 95.8% (23/24) | 87.5% (21/24) | 27.8% (10/36) | 100.0% (36/36) | 75.0% (9/12) | 91.7% (11/12, hibana) | 2 |

Focus calibration:

- weak cue sharp - strained: 0.0%
- strong cue strained - sharp: 16.7%
- strained D joint prose - matched C: 5.6%

Threshold results:

- observerSafetyZeroEveryArm: PASS
- cFreshEvidenceGrounding: PASS
- cFreshEvidenceDeltaFromA: FAIL
- cSemanticResponse: PASS
- cSemanticResponseDeltaFromA: FAIL
- cUnsupportedNovelty: FAIL
- cCharacterConsistency: PASS
- cNoChangeRestraint: FAIL
- worstSpeakerExactUnique: PASS
- longestExactRepeatRun: FAIL
- weakCueFocusCalibration: FAIL
- strongCueNonInferiority: PASS
- lowFocusProseNonInferiority: PASS

Fixed-fixture evidence only. Passing does not authorize an opt-in candidate, staging, release, or production use; the owner must decide the supported component separately.
