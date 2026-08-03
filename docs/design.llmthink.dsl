domain KshiaiBattleGame:
  description "Turn-based multi-user LLM battle game with hidden stats and narrative presentation"

problem PR1:
  |
    Users want expressive characters and dramatic battles, but exposing raw
    stats turns the product into a spreadsheet fight instead of a story fight.

evidence EV1:
  |
    Requirements forbid showing structured JSON or numeric parameters in normal UI.

evidence EV2:
  |
    Players still need fair, reproducible combat outcomes.

decision D1 based_on PR1, EV1, EV2:
  |
    Split authority: CharacterSheet and BattleState are server-side truth.
    Clients receive only public DTOs (blurb, images, narrative log, action choices
    without numeric payloads). Combat math is deterministic engine code.

problem PR2:
  |
    LLM creativity can invent illegal damage, infinite buffs, or skip defeat rules.

evidence EV3:
  |
    Requirements assign scene coefficients and narration to the LLM, but turn
    effects and win checks to the program.

decision D2 based_on PR2, EV3, D1:
  |
    Pipeline per turn: optional LLM situation proposal -> schema validate and
    clamp coefficients -> engine resolves actions and mutates state -> LLM
    narrates only the committed event list -> engine evaluates terminal conditions.
    LLM never writes HP directly.

problem PR3:
  |
    Character creation from free text must feel conversational while still
    producing a complete engine sheet.

evidence EV4:
  |
    Users adjust via natural language and must never see the raw sheet.

decision D3 based_on PR3, EV4, D1:
  |
    Generation session stores draft sheet server-side. Chat returns assistant
    prose plus optional apply-patch that merges into the draft. Confirm promotes
    draft to owned Character. Public read APIs strip parameters.

problem PR4:
  |
    Multiple users and ownership boundaries must not leak other players' drafts
    or internal sheets.

evidence EV5:
  |
    Multi-login and cross-user matches are required.

decision D4 based_on PR4, EV5:
  |
    Auth sessions identify users. Characters are owner-scoped for mutate.
    Matchmaking exposes only public opponent cards. Battle participants may read
    narrative state for that battle only.

problem PR5:
  |
    Provider choice (xAI vs Venice) and image generation must not hard-wire the
    app to one HTTP shape.

evidence EV6:
  |
    API keys must remain server-side; mock mode is required for offline UI work.

decision D5 based_on PR5, EV6:
  |
    Define LlmProvider and ImageProvider interfaces. Config selects xai, venice,
    or mock. Frontend never holds provider keys.

problem PR6:
  |
    Default Vite/Node ports collide on shared dev machines.

evidence EV7:
  |
    Requirements mandate non-default free ports.

decision D6 based_on PR6, EV7:
  |
    Frontend listens on 5188; API on 3088. Document in README and .env.example.

problem PR7:
  |
    Turn-limit endings need judgment without letting LLM override earlier HP defeat.

evidence EV8:
  |
    Irreversible incapacity or depleted sustain params end the match immediately.

decision D7 based_on PR7, EV8, D2:
  |
    Terminal evaluator runs after every engine resolve. Immediate defeat paths
    short-circuit. Only when turnLimit is reached with both still fighting does
    the referee LLM assign winner from narrative-safe summary plus hidden scores
    available only to the server prompt builder.

problem PR8:
  |
    Monorepo FE/BE with shared types must stay simple for scaffold velocity.

decision D8 based_on PR8, D1, D5:
  |
    npm workspaces: frontend (Vite React), backend (Hono), packages/shared
    (zod schemas and DTO types). SQLite for persistence in v1.

problem PR9:
  |
    Dialogue presentation rules can regress if left as freeform model text only.

evidence EV9:
  |
    Character lines must use Japanese quotation marks and named speakers.

decision D9 based_on PR9, EV9:
  |
    Narration response schema separates narrator paragraphs and speech lines
    {speaker, text}. UI renders speech as 「text」 with speaker label. A light
    server-side formatter enforces brackets if the model omits them.

problem PR10:
  |
    Costly skill kits can exhaust MP and stamina early, leaving both automatic
    fighters waiting while narration repeats until an opaque turn-limit result.

evidence EV10:
  |
    A recorded 20-turn match produced character-driven HP movement on only six
    turns and ended after a long passive sequence.

decision D10 based_on PR10, EV10, D2, D7:
  |
    Action selection falls back from an unavailable offensive skill to a cheap
    basic attack, then to resource-restoring rest. Supervisor state separately
    counts turns without character-driven damage or healing; after two such
    turns the engine forces both fighters into basic attacks, regardless of
    environmental events. The penultimate turn emits a judgment warning, and a
    dedicated persisted judgment narrative records the referee result at the
    turn limit.

problem PR11:
  |
    A single HP-damage fallback and permanent stat edits cannot express attacks
    that exhaust, disrupt, or temporarily reshape a fighter without runaway buffs.

evidence EV11:
  |
    Character concepts include mental pressure, fatigue, sacrifice, equipment
    drawbacks, and maximum-resource changes that should matter mechanically.

decision D11 based_on PR11, EV11, D1, D2:
  |
    CharacterSheet stores a typed basic-attack profile and bounded parameter
    deltas on skills and equipment. A basic attack may reduce any parameter and
    uses explicit scaling and resistance parameters. BattleState snapshots the
    unequipped sheet parameters as baseParameters; equipment applies temporary
    opening deltas, and every live parameter moves twenty percent of its remaining
    gap, at least one point, toward base before each turn after the first. This
    includes MP, stamina, and all maxima, but excludes current HP so accumulated
    damage still drives the match to a finish. Balancing clamps deltas and adds
    resource cost to free status skills and a negative tradeoff to positive gear.

problem PR12:
  |
    A single display name cannot distinguish legal names, common names,
    self-reference, and epithets, while relationship-based generation needs
    context from a user's existing characters without crossing account boundaries.

evidence EV12:
  |
    Users want to create relatives and similar-but-distinct characters from an
    existing owned profile, while age and gender remain optional UI details.

decision D12 based_on PR12, EV12, D1, D4:
  |
    CharacterSheet stores a private identity object with realName, nicknames,
    selfNames, epithets, gender, and age; displayName remains an independent
    public field. Character generation receives search and detail tools whose
    repository callbacks are bound to the authenticated owner id. Reference
    results contain descriptive profile context but no combat parameters. The
    server always supplies the same compact owned-character index and tools;
    the LLM decides their relevance without keyword or regex routing.
    Existing sheets are backfilled once and all later saves persist defaults.

problem PR13:
  |
    A single hosted LLM can exhaust credits or hit a rate limit, causing all
    structured generation to fall directly to repetitive mock content.

evidence EV13:
  |
    xAI reached its monthly spending limit while valid OpenAI and VeniceAI
    credentials remained available.

decision D13 based_on PR13, EV13, D5:
  |
    Route every LlmProvider operation through a configurable ordered chain.
    On quota, credit, spending-limit, or rate-limit errors, mark only that
    provider unavailable in memory for one hour and immediately try the next.
    Other failures fall through for the current request without a long cooldown.
    Mock remains the final provider so user flows still complete offline.

problem PR14:
  |
    Keyword and regex checks against free-form character, battlefield, or user
    prose create hidden semantic rules that disagree with the LLM and are hard
    to extend across wording and languages.

evidence EV14:
  |
    Earlier mock adjustment, balance, and battlefield happening code inferred
    attack, defense, weather, power, and weakness from Japanese word lists.

decision D14 based_on PR14, EV14, D1, D2:
  |
    Semantic interpretation of free-form prose belongs to an LLM structured
    response. Deterministic code may branch only on validated schema fields,
    enums, numeric values, ownership, and engine state. Literal matching remains
    limited to explicit search, safety redaction, protocol/error classification,
    file validation, and output-format repair; none may select combat mechanics.

problem PR15:
  |
    Character generation can repeat the same balance caveat across traits,
    public blurbs, and skill or equipment descriptions, making profiles read as
    several prompt fragments appended together.

decision D15 based_on PR15, D3, D14:
  |
    Character generation and adjustment produce one synthesized profile. Each
    fact has one canonical home: visible details in appearance.summary, local
    mechanics in the relevant description, short personality facts in traits,
    and a cohesive identity/background overview in narrativeBlurb.
    The LLM must not repeat or paraphrase the same tradeoff across those fields;
    deterministic balancing never edits prose.

problem PR16:
  |
    A stateless narrator that writes dialogue for both fighters forgets
    non-parameter state and can drift away from a character's first-person voice.

decision D16 based_on PR16, D1, D2, D9, D12:
  |
    Each battle owns two isolated private character-agent states containing only
    compact continuity conclusions, goal, emotion, beliefs, observations,
    speech style, self-reference, and last speech. After deterministic resolution,
    the shared engine persists structured before/after changes and constructs a
    perspective-aware cognition snapshot for each character. Each agent receives
    only its own profile, previous private state, opponent name, and that snapshot,
    then updates its state and authors its own line. The narrator receives committed
    events and agent-owned lines but writes only narrator prose. Agent state and
    turn records remain absent from public battle DTOs; step-by-step reasoning is
    neither requested nor stored.
