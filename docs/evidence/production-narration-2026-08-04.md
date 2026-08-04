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

## Turn-to-turn monotony (follow-up evidence)

Same three finished battles show **mechanical loops that the narrator then softens**:

### `btl_8bc3c467…` (metro / social)

- B: `wait` almost every turn (16×).
- A: alternates two skills; event summaries are the same block each time
  (`ワードローブサボタージュ` ×36, `様子をうかがった`).
- Narrator: ambient train props + soft finger gesture + soft reaction every turn.
- `balance.maxTurnDamageRatio* ≈ 0.03`, `turnsSinceLocationChange: 20`.

### `btl_a60df154…` (hotel room)

- A: single skill streak **15** (`環境操作` then `誘惑の視線`).
- B: same luck skill every turn (`幸せよ来い…！` ×57 event hits).
- Narrator: neon/bed/sweat/mirror loop; little leverage change sentence-to-sentence.
- `drama.repeatedActionA: 15`, fingerprints identical three deep.

### `btl_47b6911c…` (arena, soft characters)

- A: `守ってあげたいオーラ` streak **10**; B: `wait`.
- Narrator: sand + soft aura + “様子をうかがう” every turn; not fight-like.
- Even climax phase still reads as gentle stalemate.

### Interpretation

Monotony is not only stock speech. **Same action signatures + soft status events**
give the (working) narrator the same beat recipe every turn. Fix requires:

1. Engine/policy/agent variety pressure after repeated actions (especially wait).
2. Narrator `progressionHint` so 地の文 must advance leverage, not restate ambience.
