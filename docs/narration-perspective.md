# Narration perspective (B + gated digests)

## Goals

- Character **agents** keep private continuity (emotion, goal, memory). They do **not** own public dialogue.
- The **narrator** writes ground text **and** structured `speeches[]` (for colored UI).
- **Perspective** controls which inner digests the narrator may see.

## Perspectives (`NarrationStyle.perspective`)

| Id | Meaning | Digests to narrator |
|----|---------|---------------------|
| `self` | First-person / player side | Side A detail only |
| `foe` | Opponent-limited | Side B detail only |
| `external` | Third-person limited | None (events only) |
| `omniscient` | All-knowing | A + B detail |
| `fluid` | Camera may move each turn | Phase 1: both **summary**; after focus: only allowed **detail** |

## Per-turn pipeline

1. Engine resolves the turn.
2. Agents advance in parallel (private state; optional private reaction, not UI speech).
3. Build summary digests (A/B) and detail digests (A/B).
4. **Focus**
   - Locked styles: map perspective → focus (`self`/`foe`/`external`/`both`).
   - `fluid`: light LLM call with **summaries only** → `{ focus }`.
5. **Narrate** with events + `selectDigestsForFocus` (disallowed detail **physically omitted**).
6. Log = `{ narrator, speeches }` from narrator JSON.

## Security note

Never put full detail for both sides into the same narrate prompt under a limited focus.
Summaries in the focus-choice step must stay thin (emotion, short goal, condition labels).
