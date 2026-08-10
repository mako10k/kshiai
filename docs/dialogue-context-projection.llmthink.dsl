domain KshiaiDialogueContextProjection:
  description "Observer-safe compact context for deep-psyche and character expression in battles"

problem PR1:
  |
    Character speech can appear to answer the wrong development even when the
    raw A/B side labels are correct. The current action-reaction string is
    selected from canonical events by actor-or-target participation rather than
    by the observer's committed perception. Non-impacting counterpart actions
    can therefore be absent from one character's fresh-result thread.

evidence EV1:
  |
    The retained v0.13.7 production observation checked 28 Site A/Site B
    deep-psyche and expression inputs: observer.side, counterpart identity, and
    self/counterpart conversation labels had no A/B mismatch. The same trace
    showed asymmetric actionReaction material: on turn 5 Site A received its
    own attack result while Site B received that attack plus its own wait.

evidence EV2:
  |
    Existing CharacterPerceptionFrame already represents observer-relative
    visibility, identity knowledge, certainty, and qualitative change without
    exposing hidden canonical state. The battle engine remains the sole owner
    of action legality, resources, outcomes, and next-turn reservation use.

decision D1 based_on PR1, EV1, EV2:
  |
    Preserve the current turn boundary: resolve the previously accepted next
    action, freeze the post-resolution observer perception, generate current
    expression and one following-turn reservation, then resolve that reservation
    on the next advance. Do not introduce action cancellation. Replace the
    actor-or-target actionReaction selector with a deterministic,
    observer-labelled TurnObservationPacket derived only from committed
    perception evidence and structured resolution facts. Its self, counterpart,
    ambient, certainty, and source-reference fields are structural facts; no
    free-form text, keyword, or model output selects mechanics.

problem PR2:
  |
    The deep-psyche and expression calls serialize overlapping complete state.
    In the retained observation the average deep-psyche input was about 8.9 KB
    and the expression/action input about 13.0 KB, while the fresh result was a
    small fraction of that payload. The expression call must rediscover the
    current conversational and emotional beat among profile, perception,
    decision, complete psyche, and history fields.

evidence EV3:
  |
    The existing character-state contract is intended to store bounded private
    conclusions rather than chain-of-thought. The existing phase authority
    contract already requires normal-turn agents to consume committed,
    observer-relative post-resolution information and only reserve the following
    action.

decision D2 based_on PR2, EV3, D1:
  |
    Keep complete private state durable but stop forwarding it wholesale to the
    expression stage. The deep-psyche call returns a validated persistent-state
    delta and a compact ExpressionBrief for this turn. ExpressionBrief records
    the chosen source thread (action result, conversation, or weave), the
    selected continuity decision, the observed social impact, the intended
    public move, and the specific compact context items it addresses. The
    expression/action call receives only its voice anchor, TurnObservationPacket,
    recent exchange, relevant retained memory, ExpressionBrief, and a compact
    validated action menu. It may author semantics and wording, but cannot alter
    the packet, legality, or durable state outside its accepted structured
    result.

problem PR3:
  |
    Long-term opponent continuity is valuable, but passing a growing raw list
    of utterances gives recency and schema noise equal priority with the current
    exchange. Conversely, an opaque summary could erase a meaningful older
    promise, injury, or relationship shift.

evidence EV4:
  |
    The current pipeline persists bounded conversationHistory and privateMemory,
    and exposes an administrator-controlled history limit. Dialogue-memory
    research supports retaining observations and reflections while retrieving
    only relevant context rather than replaying all history each turn.

decision D3 based_on PR3, EV4, D2:
  |
    Add a private DialogueThreadState containing a current topic, unresolved
    social move, and one optional anchored prior exchange. The expression context
    carries the most recent bounded exchange plus that anchored item; it does
    not carry the entire conversation history. The deep-psyche stage, not
    deterministic prose inspection, chooses the thread meaning and whether an
    older exchange is relevant. Persisted raw entries remain available for
    audited retrieval and compatibility, while mechanical code validates only
    bounded shape, side ownership, and turn references.

problem PR4:
  |
    Operators need to tune dialogue context without deployment, but changing a
    global prompt policy during a battle would make one character's continuity
    depend on an out-of-band mid-fight configuration change.

evidence EV5:
  |
    Dialogue pipeline settings are currently read on every advance. The retained
    v0.13.7 observation used one unchanged revision, so this was not its direct
    cause, but the present topology permits a mid-battle revision change.

decision D4 based_on PR4, EV5, D1, D2, D3:
  |
    Extend the administrator dialogue-pipeline settings with bounded projection
    controls: recent-exchange limit, relevant-memory limit, and an explicit
    legacy-or-compact projection mode. Snapshot the validated settings revision
    into BattleState at turn 0; administrator edits apply to newly created
    battles and remain auditable without changing an active battle's context.
    These controls influence LLM context only and never modify combat mechanics.

problem PR5:
  |
    A smaller prompt can still produce stale or repetitive dialogue if the new
    projection is not measured against actual per-side input and expression
    traces. A per-turn repair call would add unpredictable latency and cost.

evidence EV6:
  |
    The internal observation realm already retains bounded Site A and Site B
    pipeline inputs, provider results, accepted outputs, and persistent E2E
    battle observations. The established release path supports immutable staging
    and production observations.

decision D5 based_on PR5, EV6, D1, D2, D3, D4:
  |
    Add no per-turn LLM call and no phrase-ban or runtime text-matching rule.
    First dual-trace the compact projection beside the legacy prompt without
    changing visible output. Then switch only after side-swap, visibility,
    compatibility, prompt-budget, provider-schema, and privacy tests pass.
    Release through the normal PR, immutable tag, staging, protected promotion,
    and persistent E2E path. Post-release analysis may use exact-duplicate
    metrics, but those metrics are diagnostics rather than game mechanics.
