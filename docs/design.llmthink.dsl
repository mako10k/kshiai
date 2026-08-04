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
    Mock is available only when explicitly selected for development or tests;
    it is never appended implicitly to a real-provider chain. If no configured
    provider is usable, fail explicitly instead of persisting fixed mock prose.

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
    the shared engine constructs a compact mechanical cognition plus the latest
    side-specific observable snapshot and its immediately preceding diff. Each
    agent receives only its own profile, previous private state, validated
    action context, and its observer-relative perception frame. A counterpart
    name or condition is included only when that frame says the character knows it,
    then updates its state and returns a private reaction sample for continuity.
    The narrator receives committed events plus only the inner digests allowed by
    the selected narration perspective, then authors public narration and speech
    lines. Agent state and turn records remain absent from public battle DTOs;
    step-by-step reasoning is neither requested nor stored.

problem PR17:
  |
    Battlefield image generation stores a deterministic avatar URL instead of
    creating field art, while character generation is hard-wired to xAI and
    persists a remote placeholder when generation fails.

evidence EV17:
  |
    Character and battlefield images have the same lifecycle: construct a
    domain prompt, call a server-side image model, save returned bytes, then
    update the owned record only after the file is durable.

decision D17 based_on PR17, EV17, D5:
  |
    ImageProvider is independent from LlmProvider and exposes provider name plus
    one generate request returning encoded image bytes or a downloadable URL.
    A provider-neutral image service owns prompt construction, retries, download,
    diagnostics, and atomic record-facing success. Character portraits use a
    square prompt; battlefield art uses a landscape prompt synthesized from the
    preset appearance, terrain, obstacles, conditions, and narrative summary.
    Routes update imageUrl only after local media is saved. Missing providers,
    moderation failures, and transport failures return an explicit error and
    preserve the previous record; remote placeholder URLs are never persisted.

problem PR18:
  |
    Sword-centric defaults and unconstrained policy checkboxes pull gun, science
    fiction, psychic, social, comedic, and gentle character concepts back into
    a physical fantasy duel. Some coarse structured tasks also use the slower
    engine model without requiring its extra accuracy.

decision D18 based_on PR18, D1, D2, D13, D16:
  |
    Prompts and fallback prose describe a genre-neutral fictional confrontation
    and may use physical, ranged, technological, psychic, social, comedic, cute,
    or abstract actions only when supported by character and event context.
    Policy generation returns three perspectives with exactly two contrasting
    choices each. The UI adds an explicit unspecified choice per perspective;
    the server accepts an empty selection and enforces at most one choice per
    perspective. Character generation and adjustment plus final refereeing use
    the engine model. Identity extraction, battlefield generation/adjustment/
    concretization, policy generation, agents, situation, and narration use the
    fast model because schemas and deterministic validation bound their output.

problem PR19:
  |
    Environmental changes can appear without a detected stalemate, are selected
    from a fixed category template library, and expose an internal happening
    label in user-facing narration.

decision D19 based_on PR19, D2, D14, D18:
  |
    The supervisor becomes eligible only after two consecutive resolved quiet
    turns and never from elapsed turns alone. On eligibility it asks the fast LLM
    for one field-grounded change, supplying scene, terrain, obstacles,
    conditions, setup, and the last five generated changes. The prompt requires
    a materially different cause/effect and a symmetric constraint, opportunity,
    or pressure; validation discards any direct effect not targeting both sides.
    Generated changes are stored in compact supervisor history. If generation
    fails, no change is injected and no template fallback runs. Public situation
    events contain only the in-world title and description; internal category
    labels are removed before persistence and narration.

problem PR20:
  |
    A turn can narrate that an object was picked up, a window was irreversibly
    broken, fragments were created, or a character's visible condition changed,
    while the next turn still receives the original battlefield strings. The
    missing observable state also weakens the causal chain from resolved action
    through perception to private character continuity.

evidence EV20:
  |
    BattlefieldInstance freezes terrain, obstacles, and conditions at match
    start; Situation stores only prose, tags, and coefficients; BattleTurnRecord
    has no stable action IDs or semantic patches; and external narration can skip
    character-agent advancement. Complete BattleState snapshots are already
    persisted as JSON, so a compatible structured overlay needs no first-version
    table migration.

decision D20 based_on PR20, EV20, D1, D2, D14, D16, D19:
  |
    Each battle owns a versioned semantic snapshot with a strict outer envelope,
    stable keyed entities, symmetric observable character entities, and shallow
    flexible facts. Battlefield concretization creates the initial snapshot;
    existing battles receive a deterministic revision-zero seed from already
    structured fields. After deterministic action resolution, a fast LLM may
    propose JSON Pointer operations grounded in stable action and event IDs.
    Server code validates revision, paths, references, size, and protected
    namespaces, then applies the complete patch atomically or not at all.
    Mechanical state and private agent state are never patchable. The server uses
    each side-filtered observation and latest diff as world evidence when building
    an observer-relative character perception frame; agents do not receive the
    raw canonical projection as if every visible root were identified. Required
    character roots remain symmetric in canonical state and in required perception
    slots, but a slot may explicitly say that the character is not currently
    perceived or cannot be identified. Entity visibility is structured
    (`visibleTo`) and deterministic projection never interprets prose. The narrator
    renders a perspective-specific view of committed state without mutation
    authority. The battle persists only the latest canonical snapshot, latest
    transition, latest A/B/public observations, latest A/B perception frames, and
    bounded current contact registries; it does not duplicate subjective history
    in turn records. Semantic wording never selects mechanics.

problem PR21:
  |
    Result-only narration makes actions feel thin, recent public dialogue is not
    fed into normal turns, and HP-only stagnation detection misses repeated
    skills, unchanged locations, and mechanically active but monotonous turns.
    At the same time, safe per-hit caps can extend a flat exchange to the turn
    limit without a rising climax.

decision D21 based_on PR21, D1, D2, D14, D19, D20:
  |
    The server derives compact action beats only from resolved structured
    actions, character skill/basic-action descriptions, selected policy fields,
    and committed event outcomes. The narrator receives those beats, the last
    two public turn blocks, the committed semantic observation, and a bounded
    DramaState containing only action signatures, repetition counters,
    location/environment cadence, public last speech, and phase. It must render
    initiation, movement or contact, and consequence while avoiding recent
    wording. Exact repeated public speech is replaced by a nonverbal reaction.
    A semantic-only environment beat may be requested after repeated actions or
    prolonged unchanged location; mechanical environment effects remain behind
    D19's measured-stagnation and symmetric-target gate. Special skills remain
    unavailable before turn ten. From turn ten to turn twenty, the selected
    finishing skill multiplier rises from 1x to 2x and deterministic critical
    opportunity rises from zero to forty percent. Deterministic code still owns
    action legality, multipliers, damage caps, and outcomes.

problem PR22:
  |
    Merely prioritizing every special skill after turn ten makes the same move
    repeat while resources remain. Characters cannot judge whether to spend or
    hold a finisher because they do not receive unlock timing, current growth,
    remaining uses, or available actions, and their private update does not plan
    the next action.

decision D22 based_on PR22, D1, D2, D20, D21:
  |
    Battle start deterministically fixes one finisher per side: the strongest
    explicit special, otherwise the strongest existing attack or magic skill.
    It never invents a new skill. The finisher has one use per battle; global
    post-turn-ten critical pressure remains separate. Every character agent,
    regardless of narration perspective, receives a bounded structured window
    for the next turn with qualitative conditions, available actions, unlock
    countdown, current and maximum multiplier, turns to maximum, critical
    opportunity, and remaining uses. Its validated structured response reserves
    one next-turn action without an extra LLM call. Deterministic code consumes
    the reservation once, validates skill identity, resources, unlock, and use
    count, and falls back to selected battle policies on invalid or failed plans.

problem PR23:
  |
    A character currently receives only broad own/opponent condition bands,
    its own parameter deltas, shared resolved events, and a semantic snapshot
    whose observer and self entity are implicit. This is enough for action
    legality but too coarse for the character to judge how effective its action
    felt, how much strain it is under, or which observed entity is itself without
    relying on names and side conventions. Passing raw HP, stamina, or other
    hidden totals would solve the ambiguity by weakening the story-first hidden-
    stat boundary.

evidence EV23:
  |
    Deterministic turn records already distinguish side A and side B parameter
    changes, and action selection already checks current resources before
    presenting available actions. Semantic patches are prohibited from changing
    combat parameters. The missing layer is therefore a deterministic,
    observer-labelled qualitative projection rather than a richer mechanical
    payload or LLM-authored arithmetic.

decision D23 based_on PR23, EV23, D1, D2, D16, D20, D22:
  |
    Keep BattleSemanticState as canonical observable-world truth and add a
    separate bounded CharacterPerceptionFrame after deterministic resolution.
    Every character frame identifies its observer side and self reference explicitly and
    labels self perceptions separately from all external perceptions. Server
    code derives ordinal, genre-neutral cues from committed post-mitigation
    outcomes: delivered effect, received effect, current strain, and resource
    trend. Bands convey values such as negligible, light, solid, heavy, or
    decisive and fresh, taxed, strained, or exhausted without transmitting raw
    totals, percentages, or threshold constants. Cues remain causally attributed
    to an action or environment effect when the engine can prove that relation;
    otherwise attribution is unknown. The LLM may render these validated cues in
    character-appropriate language but cannot change magnitude, source knowledge,
    resource truth, or action legality. Engine-authored cues remain available
    when semantic reconciliation or another provider call fails.

problem PR24:
  |
    Treating every non-self observation as an identified opponent or visible
    entity cannot represent partial and cross-modal perception. A shot into
    darkness may produce a convincing impact without identifying what was hit;
    footsteps, smell, pressure, or atmosphere may be perceived without a known
    source or exact position. Revealing canonical entity IDs, opponent condition,
    or names in those cases turns server truth into character omniscience.

evidence EV24:
  |
    The current semantic schema keeps both character roots observable to both
    sides, visibility applies to whole entities rather than individual percepts,
    both cognition records receive the same event list, and each agent call
    receives an opponent name and condition unconditionally. Those guarantees
    are safe for symmetric projection but cannot express identity uncertainty.

decision D24 based_on PR24, EV24, D1, D4, D16, D20, D23:
  |
    Perception is modelled as observer-relative evidence, not as a copy of every
    world entity. A perception records modality (vision, sound, smell, touch,
    proprioception, atmosphere, or other), a bounded phenomenon, optional coarse
    direction and distance, salience, occurrence certainty, and attribution
    certainty. Its subject is a discriminated union of self, an identified known
    entity, an observer-local unknown contact, or an ambient event with no entity.
    Unknown contacts use opaque IDs scoped to one observer. A bounded private
    server ledger may map those contacts to canonical sources for continuity, but
    canonical IDs, real labels, exact hidden locations, and candidate IDs never
    enter a character prompt when the observer has not identified them.
    Later identification links a contact prospectively and never rewrites earlier
    uncertainty. Side-specific perceived events redact unobserved actors, targets,
    and outcomes; opponent identity and condition become optional knowledge rather
    than unconditional foeName or foeCondition fields. Narration receives a
    perspective-specific reference catalog: first-person and opponent-limited
    views mark their viewpoint character explicitly, omniscient view may receive
    all canonical IDs and labels, and external view receives labels without IDs.
    IDs are control metadata only and are deterministically removed from public
    narrator output. A narrator using a subjective frame must preserve its
    uncertainty. Deterministic tests cover self anchoring,
    anonymous impact, source-less footsteps, multi-modal cues, contact continuity,
    later identification, side swapping, and absence of hidden-ID or numeric leaks.

problem PR25:
  |
    Adding sensory evidence, character frames, public or subjective narration
    views, and contact continuity can either add latency through another LLM call
    or overload the semantic reconciler with unrelated responsibilities. A hard
    one-call rule risks lower structured accuracy, while per-turn adaptive retries
    make latency, cost, and failure behavior unpredictable.

evidence EV25:
  |
    The current normal-turn pipeline already calls one semantic reconciler, both
    character agents in parallel, an optional pre-existing fluid-focus selector,
    and one narrator. Mechanical evidence and observer projection require no LLM.
    Non-mechanical sensory wording is closely related to semantic reconciliation,
    but must be independently measurable and validatable.

decision D25 based_on PR25, EV25, D2, D13, D14, D20, D23, D24:
  |
    Prefer a no-additional-call pipeline: deterministic resolution first emits
    mechanical perception evidence; the existing semantic-reconciler response
    contains two independently validated sections, the world patch and bounded
    non-mechanical sensory evidence; the server commits the patch, normalizes both
    evidence sources, updates A/B contact registries, and freezes A/B character
    frames before the existing parallel agent calls. The existing fluid-focus
    call, when configured, still chooses focus from thin summaries. The server
    then derives the matching narration view and performs the existing narrator
    call. No narrator or agent may mutate evidence.
    Before selecting this combined topology for a provider/model, fixtures compare
    it with two separated prompts run in parallel from the same committed actions,
    events, pre-turn world, and engine evidence. Neither separated call consumes
    the other LLM response. Compare schema-valid rate, world-
    patch correctness, sensory coverage, attribution errors, identity leakage,
    latency, and token cost. If either structured responsibility falls below its
    accepted quality floor, use the separated topology despite its extra call.
    The selected topology is fixed by reviewed provider/model configuration; the
    server does not add a surprise second call as a per-turn repair or retry.
    The two response sections remain independently validatable in either topology,
    so invalid sensory evidence cannot roll back a valid world patch and a failed
    sensory call falls back to engine evidence without another attempt.
    This topology evaluation never selects or promotes a provider. XAI remains the
    primary provider and OpenAI remains its configured operational fallback. A
    failed XAI prompt evaluation is a blocking diagnosis for this slice, not
    authority to satisfy the local quality gate with the fallback provider.

problem PR26:
  |
    One qualitative condition label cannot distinguish a large absolute effect
    that is small for its target from a small absolute effect that consumes a
    large share of a fragile target. It also conflates current reserve, this-turn
    exertion, damage, recovery, and non-HP resource pressure.

decision D26 based_on PR26, D1, D2, D11, D23, D25:
  |
    Every committed numeric change first becomes a server-only QuantizedChange
    with parameter key and class, direction, absolute band, target-relative band, causal
    action or environment reference, and terminal outcome. Absolute magnitude is
    abs(delta) divided by a fixed server-owned reference for that parameter key
    (the initial balance soft centers: hp/maxHp 110, mp/maxMp 45,
    stamina/maxStamina 50, atk 14, def/spd/mag/res 13, focus/luck 12);
    relative magnitude is abs(delta) divided by max(1, the applicable maximum
    before the change, the applicable maximum after the change). HP, MP, and
    stamina use their paired maximum; maximum parameters and other stats use the
    greater magnitude of that target parameter before and after. Both ratios use
    the same initial bands: none=0, trace<=0.03, light<=0.08, solid<=0.18,
    heavy<=0.35, and extreme>0.35. Threshold constants and ratios never enter an
    LLM or public response. HP-like loss, healing, stamina expenditure or recovery,
    and MP/focus expenditure or recovery remain distinct parameter classes.
    Current self reserve is separately banded on absolute and relative axes as
    empty=0, critical<=0.15, low<=0.35, taxed<=0.60, ready<=0.85, and full>0.85.
    Absolute reserve uses the fixed parameter reference. Relative HP, MP, and
    stamina use their paired maximum, while focus uses the battle-start base
    focus because it has no separate maximum parameter.
    Character frames may include both absolute and relative ordinal bands for
    direct proprioception and justified hand-feel, but an external target receives
    no reserve band unless perception evidence supports it. No-effect, immunity,
    overkill, incapacity, and multi-target effects are explicit outcomes rather
    than inferred from magnitude prose. Tests require monotonic bands, boundary
    behavior, A/B side-swap symmetry, and causal separation of simultaneous and
    environmental changes.

problem PR27:
  |
    Unknown contacts need stable continuity without becoming unbounded private
    history. Identification can improve while current access worsens, one unknown
    source may produce several modalities, several sources may initially look like
    one presence, and provider or projection failure must not fabricate knowledge.

decision D27 based_on PR27, D4, D14, D16, D23, D24, D25:
  |
    Every character frame always contains a self slot and a counterpart slot with
    independent currentAccess (none, trace, coarse, clear) and identityKnowledge
    (unknown, suspected, identified). perceivedAs is a safe observer-facing label:
    for example not perceived, an unidentified footstep, a figure in darkness, or
    a known counterpart whose current position is lost. Self remains identified
    through proprioception even when not visually available. Required canonical
    characters therefore remain structurally symmetric without granting awareness.
    Each side has a current server-private contact registry of at most 64 entries
    and a latest frame of at most 32 percepts. Contact IDs use a monotonic per-side
    sequence and are never reused. The registry stores current identity knowledge,
    access, salience, last-observed turn, and a server-only source set, not prose or
    past frame history. Evidence for one source is coalesced across modalities;
    indistinguishable multiple sources may use one group contact and split into new
    contacts when committed evidence distinguishes them. Identification is
    prospective; access may decrease, but prior established identity is not erased.
    On capacity pressure, the oldest low-salience lost unknown contacts are evicted;
    an untracked low-salience cue remains ambient rather than reusing an ID.
    Semantic or sensory-provider failure creates no new non-mechanical evidence.
    Projection failure emits a minimal frame with explicit self, engine cues, and
    an unknown or not-perceived counterpart while retaining the previous registry.
    Ledger update and frame freezing occur serially under the battle lease before
    A/B agents run in parallel. Legacy battles seed the counterpart as identified
    from setup to preserve their prior unconditional-name continuity. Narrator
    prompts declare IDs non-linguistic control fields and require renderLabel in
    prose; after the single narrator call, an exact server-owned ID-to-label map
    replaces any leaked known ID in narrator paragraphs and speeches without an
    LLM retry.
