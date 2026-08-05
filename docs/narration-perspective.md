# Narration perspective and character-authored speech

## Goals

- Character **agents** keep private continuity and own the actual utterance or
  stage reaction produced from their own perception.
- The **narrator** writes ground text and chooses where accepted character speech
  appears. It may apply validated surface styling but cannot invent, omit, or
  change the speech's facts, intent, speaker, or dialogue/reaction kind.
- Actual speech and its public rendering are separate. Public rendering never
  updates character memory, action, mechanics, or results.
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
2. Agents advance in parallel from isolated perception and produce private state,
   next action, and actual speech.
3. Build summary digests (A/B) and detail digests (A/B).
4. **Focus**
   - Locked styles: map perspective → focus (`self`/`foe`/`external`/`both`).
   - `fluid`: light LLM call with **summaries only** → `{ focus }`.
5. Derive the narration view and the character-speech sources permitted by that
   presentation perspective.
6. **Narrate** with events + `selectDigestsForFocus` + immutable speech sources
   (disallowed detail **physically omitted**).
7. Server reconstructs `speeches[]` from the sources, accepting only bounded
   placement and fact-preserving surface changes. Missing, extra, or changed
   lines fall back to the source or are discarded.
8. Log = `{ narrator, speeches }`; agent `lastSpeech` remains the actual source.

## Security note

Never put full detail for both sides into the same narrate prompt under a limited focus.
Summaries in the focus-choice step must stay thin (emotion, short goal, condition labels).

Narrator output is presentation-only. Do not feed narrator paragraphs or rendered
speech into character continuity, perception, action selection, battle mechanics,
turn-limit adjudication, or rating. Historical narrative blocks without source
metadata remain display-compatible but are not new character cognition.

Presentation filtering is not in-world speech perception. Character observations
are derived from the committed actual utterance event through hearing, distance,
occlusion, noise, consciousness, and language state, never from the public
rendered line. In character-limited narration, another side's public speech is
included only when that utterance or visible reaction is accessible in the
selected observer's projection.

Turn-limit judgment uses a separate two-stage path. The adjudicator first returns
a raw winner and fact-based reason from committed actions, structured effects,
state changes, world-operation kinds, and coarse final reserve bands without
public prose, event summaries, or rendered speech. The server validates and
persists that result as `adjudication` before any presentation call. A failed
adjudicator uses the engine result as a deterministic fallback.
Only then may the narrator receive that immutable judgment together with recent
user-facing narration to add stylistic framing. The recent narration never flows
back into adjudication, the server inserts the canonical verdict line itself,
and rating settlement reads the already-persisted canonical winner.

The same authority applies at phase boundaries. Prologue character agents read
the initial turn-0 perception before choosing the first action. After a terminal
turn, an aftermath character phase may author a reaction but receives no action
decision and cannot schedule another turn. The aftermath narrator returns only
before/after framing and placement proposals; the server inserts the canonical
outcome line and drops framing that attempts to state or reverse the result.
