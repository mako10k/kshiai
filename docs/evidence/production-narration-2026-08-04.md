# Production narration evidence (2026-08-04)

Source: Cloud Run logs (`kshiai-api`) + PostgreSQL `battles.state_json.log`
Window: last ~1 day on revision `kshiai-api-00017-pas` (and prior `00015-bem`)

## Cloud Run log counts (1d)

| Signal | Count |
| --- | ---: |
| `narrateTurn … ok` | 200 (sampled limit) |
| `narrateTurn … fail` / `narrateTurn fallback` | 0 |
| `advanceCharacterAgent … ok` | 152 |
| `advanceCharacterAgent … fail` | 40 |
| `llm-router … advanceCharacterAgent failed` | 36 |
| `character agents skipped timeout` | 5 |
| semantic patch rejected (various) | frequent (see raw buckets) |

Conclusion: **LLM narrator is not falling over.** Public monotony is not
explained by engine-summary dump on `narrateTurn fallback` in this window.

## Battle log content (`btl_8bc3c46764b161ab93d593d4`, finished turn 20)

- Narrator prose is present and generally scene-specific (train car, characters).
- Engine-template hit lines (`X の 技 が Y を捉えた`) almost absent from log.
- Public speeches: **36 total, 18 stock (50%)**.
  - Top lines: `（次の変化へ意識を向ける）` ×8, `（言葉を飲み、動きで応じる）` ×6, `…` ×4
- Actions: side B `wait` ×16; side A two skills dominate (9 + 8).

## Cross-battle speech stock rate (5 newest finished)

| Battle | stock rate | top stock |
| --- | ---: | --- |
| btl_8bc3c467… | 0.50 | 次の変化×8, 言葉を飲み×6 |
| btl_a60df154… | 0.38 | 言葉を飲み×9, 次の変化×7 |
| btl_47b6911c… | 0.24 | 言葉を飲み×6, 次の変化×4 |
| btl_b4714199… | 0.43 | 言葉を飲み×10, 次の変化×8 |
| btl_0b4444b5… | 0.19 | 言葉を飲み×4, 次の変化×4 |

## Root cause in code

`replaceRepeatedPublicSpeeches` in `backend/src/services/battle-service.ts`
replaced duplicate narrator speeches with exactly two server-authored stock
strings. That is **public output not authored by the narrator**.

Secondary: `normalizeNarratorSpeeches` filled missing speakers with
`coerceCharacterSpeech(undefined)` stock reactions.

## Fix direction

1. Drop duplicate speeches instead of inventing stock replacements.
2. Do not synthesize missing speaker lines after the narrator call.
3. Keep last-resort narrator composition for full-turn failure (defense in depth);
   evidence shows it is rare in production right now.
