# Observation replay v2 outcome

The owner-approved run completed successfully from 2026-09-09T10:38:48.116Z
to 2026-09-09T10:39:11.491Z. Contract digest:
`af6158962f818c3611525ec23840d28cc1af87be62606cae4bee1fa3af130cae`.

E-V2-001: Retained `run-state.json` and `run-receipt.json` in the v2 evidence
directory show six accepted turns, six psyche calls and six expression calls.
There were zero repair calls, 24,502 tokens (22,188 input and 2,314 output),
and USD 0.03352 estimated cost under the frozen price snapshot. Reserved cost
was USD 0.1596625, within the USD 0.50 cap.

| Turn | Ordinary | Repeat-capable |
| --- | --- | --- |
| 1 | 水面が揺れたね。 | ここは譲らない |
| 2 | ミナトが半歩下がって、手元を見てるね。 | ここは譲らない |
| 3 | 鐘の音が聞こえたね。 | ここは譲らない |

C-V2-001 (high confidence, based on E-V2-001): This synthetic run demonstrates
turn-specific observation uptake and acceptance of intentional exact repetition.
It does not establish statistical or production conversation-quality improvement.
The ordinary lines remain simple observation statements rather than evidence of
richer social interaction.

C-V2-002 (high confidence, based on E-V2-001): The corrected repair prompt was
not exercised by the live model because all first responses were accepted.
Successful completion must not be reported as live validation of repair efficacy.

A-V2-001 (verification, executed; based on the explicit v2 owner approval and
the frozen contract): Execute v2 once and retain results. No resend occurred.
The historical failed v1 evidence is unchanged. No deployment was performed.
