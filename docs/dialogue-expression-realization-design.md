# Minimal Compact expression state and history design

- Status: Implementation design; ADR-0024 and requirement v3 accepted
- Date: 2026-09-08
- Requirement candidate: `docs/dialogue-expression-realization-requirement-v3.md`
- Architecture authority: `docs/adr/0024-expression-state-and-utterance-actuals.think`
- Delivery plan: `docs/dialogue-expression-realization.pert`

## 1. Design result

Keep the existing battle turn and save lifecycle. Change only the Compact
character boundary:

```text
semantic expressionState -----+
                              +--> current expression call --> nextUtterance
completed utteranceHistory ---+                              |
                                                             v
                                                existing canonical turn event
```

There is no new opportunity entity, receipt, provider-operation ID, utterance
ID, or reuse detector. The existing battle revision compare-and-save remains
the sole at-most-once commit boundary.

## 2. Proposed closed contracts

The names below are proposed API names, not implementation authority.

```ts
type CharacterExpressionStateV1 = {
  emotion: string;
  speechStyle: string;
  selfReference: string | null;
  expressionBrief: CharacterExpressionBrief;
  focus: CharacterFocusPacketV1 | null;
};

type CharacterUtteranceActualV1 = {
  sequence: number;
  turn: number;
  speaker: "self" | "counterpart";
  delivery: "spoken" | "visible_reaction";
  text: string;
};

type CharacterExpressionCompactInputV2 = {
  contextMode: "compact";
  contractVersion: 2;
  phase: "prologue" | "turn" | "aftermath";
  character: CharacterSelfProfileAnchor;
  structuredSelf?: CharacterConsciousSelfStaticProjectionV2;
  expressionState: CharacterExpressionStateV1;
  utteranceHistory: {
    recent: CharacterUtteranceActualV1[];
  };
  turnObservation: TurnObservationPacket;
  relevantMemory: string | null;
  observableManifestations: readonly CharacterObservableManifestationV2[];
  social?: BattleSocialView;
  counterpart?: CharacterCounterpartKnowledge;
  decision?: CharacterActionDecisionContext;
};

type CharacterExpressionCompactResultV2 = {
  nextUtterance: string;
  nextAction?: CharacterActionIntent;
  realizedManifestation: string | null;
};
```

The runtime input and output use closed Zod schemas. Provider JSON is decoded
directly into `CharacterExpressionCompactResultV2`; the changed path does not
cast an arbitrary record and then coerce selected properties.

## 3. Deep-psyche separation

`CharacterDeepPsycheCompactInput.previous` becomes a closed semantic-state
projection that omits `lastSpeech` and `conversationHistory`. Completed speech
is available only through its sibling `utteranceHistory` field.

The existing non-Compact contract remains unchanged for compatibility. Mock
Compact behavior must use `utteranceHistory` rather than `previous.lastSpeech`
when it needs dialogue continuity.

## 4. Expression semantics

- `expressionState` answers “what is the character's current conscious state?”
- `utteranceHistory` answers “what utterances have already occurred?”
- `nextUtterance` answers “what does the character utter now?”

History is contextual evidence, not an unconsumed candidate. The prompt does
not prohibit repetition. The server does not compare current and prior text,
classify repetition intent, or reject similarity. Every otherwise valid
`nextUtterance` follows the same acceptance path.

## 5. Existing commit lifecycle

1. Build observer-safe semantic state and completed utterance history as
   separate Compact input fields.
2. Invoke the existing expression provider once.
3. Decode the response through the closed V2 result schema.
4. Accept `nextUtterance` as the current speech source without text comparison.
5. Assemble the existing canonical turn record.
6. Save the battle with the existing expected battle revision.
7. If another worker already committed that revision, reject the stale save;
   do not add a second expression-specific ledger.

Provider failure keeps the already-defined no-expression behavior for this
phase. This design does not add a prior-line fallback, mock-text substitution,
automatic retry, or a new failure mode.

## 6. State ownership and compatibility

### New Compact contract

- `lastSpeech` is absent from deep-psyche and expression semantic-state inputs.
- `acceptCharacterAgentResult` does not write the accepted line back into
  `CharacterAgentState.lastSpeech`.
- Completed history remains an observer-relative projection of canonical
  utterance events.
- The existing immutable dialogue-pipeline snapshot's `schemaVersion` is the
  stable contract selector. A snapshot with `schemaVersion: 1` retains the
  legacy Compact contract. A snapshot with `schemaVersion: 2` selects the
  separated state/history and `nextUtterance` contract.
- Persisted V1 settings and battle snapshots remain parseable and are never
  reinterpreted as V2. The normal versioned dialogue-settings update and battle
  binding path creates and records V2; no new policy field, lifecycle entity,
  receipt, or identifier is introduced.

### Existing battles and non-Compact processing

- Existing `lastSpeech` and `conversationHistory` fields remain parseable.
- Existing battles retain their recorded dialogue contract.
- No history, identifier, or intent is reconstructed from old prose.
- No relational database migration is required.

## 7. Minimal implementation surface

| File | Change |
| --- | --- |
| `backend/src/llm/types.ts` | Define the closed V2 input/result; omit `lastSpeech` from Compact deep-psyche semantic state |
| `backend/src/llm/character-expression-prompt.ts` | Name completed `utteranceHistory` and current `nextUtterance`; add no repetition ban |
| `backend/src/llm/openai-compatible.ts` | Build separated fields and decode the closed V2 result without arbitrary records |
| `backend/src/services/battle-service.ts` | Build both Compact projections and stop writing Compact speech into `lastSpeech` |
| `backend/src/llm/mock.ts` | Remove Compact dependence on `previous.lastSpeech` |
| focused tests | Verify field separation, equal-text acceptance, privacy, closed decode, and existing stale-save behavior |

No new database table, receipt store, identifier allocator, runtime reuse
validator, quality scorer, provider call, or deployment mechanism is added.

## 8. Verification matrix

### Source correction

- Compact deep psyche and expression receive separate state and history fields.
- Neither semantic-state projection contains `lastSpeech` or
  `conversationHistory`.
- Output is `nextUtterance`, and exact repeated text is accepted normally.
- Compact acceptance does not write the text back into `lastSpeech`.

### Existing containment

- The repository stale-revision test continues to prove that two saves cannot
  commit the same battle revision.
- No expression-specific ID or idempotency store exists.
- Provider operation count is unchanged.

### Boundaries

- Provider input remains observer-relative and excludes opponent-private state.
- Narrator prose does not enter utterance history.
- The changed JSON decode contains no `any`, arbitrary record, or `z.unknown()`
  terminal contract.
- Old-policy fixtures remain compatible.

## 9. Authority boundary

The exact requirement and ADR revisions are accepted. Local implementation is
authorized by the owner's earlier implementation instruction. Paid replay,
Stage activation, and production promotion each remain separate later
decisions.
