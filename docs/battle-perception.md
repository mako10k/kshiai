# Observer-relative battle perception

Status: accepted; prepare release 0.5.0
Last updated: 2026-08-04
Architecture decisions: `D23` through `D27` in [`design.llmthink.dsl`](design.llmthink.dsl)
Implementation plan: [`battle-perception.pert`](battle-perception.pert)
Handoff checkpoint: [`handoff-battle-perception-consumers-2026-08-04.md`](handoff-battle-perception-consumers-2026-08-04.md)

Implemented slice: `T_SCHEMA` defines strict shared contracts and boundary tests
for server-only evidence, character frames, bounded private contact registries,
qualitative effect/reserve cues, and ephemeral narration views.

Completed slice: `T_PROMPT_STRATEGY` has a versioned fixture matrix, independent
world/sensory scoring, billed-call evaluation CLI, and exact provider/model
decision registry. XAI remains the primary provider and
`xai/grok-4-fast-non-reasoning` is reviewed as combined using native strict JSON
Schema output. OpenAI remains fallback and is not a substitute for a failed XAI
prompt evaluation. See
[`perception-prompt-evaluation.md`](perception-prompt-evaluation.md).

Completed slice: `T_EVIDENCE` records exact server-only mechanical changes at
deterministic resolution boundaries, grounds them in committed action, event,
and semantic character references, and passes only structured qualitative cues
to the reviewed XAI combined prompt. The world patch and sensory section are
validated independently in both directions. Provider failure discards new
sensory evidence while leaving deterministic mechanical evidence available.

Completed slice: `T_QUALITATIVE_CUES` records attempted and effective deltas
separately, then derives complete absolute and target-relative bands without
event prose or LLM inference. It distinguishes no effect, immunity, incapacity,
and overkill; preserves simultaneous and environmental causes; and derives
server-only self reserve cues for HP, MP, stamina, and focus.

Completed slice: `T_PROJECT` deterministically projects committed events,
quantized changes, self reserve cues, and validated sensory evidence into frozen
observer-relative A/B frames. It coalesces modalities by server-only source,
coalesces currently indistinguishable sources into bounded group contacts,
maintains monotonic contact registries, splits newly distinguished sources
prospectively, and preserves unknown identity and location boundaries. Frame
percept IDs are observer-local opaque hashes; unknown source labels, control IDs,
and exact hidden locations are deterministically removed from observer text.

Completed slice: `T_NARRATION_VIEWS` derives perspective-specific narrator inputs
and enforces deterministic identifier containment with exact ID-to-label repair.

Completed slice: `T_CONSUMERS` wires frozen A/B frames into character agents and
the normal-turn narrator. Character agents receive only self-labelled frames,
validated actions, and optional counterpart knowledge gated by identity and
current access. Normal `narrateTurn` consumes a derived `NarrationTurnView`.
Prologue and aftermath keep their specialized contracts and are not claimed as
migrated. `NarrationTurnView` remains a TypeScript/frozen ephemeral boundary
rather than a Zod DTO because it is never deserialized from clients or storage.

Completed slice: `T_COMPAT` seeds active legacy battles with empty registries and
setup-identified counterparts, preserves registries on projection fallback and
mechanical cues on provider failure, bounds contact retention, freezes frames
before parallel A/B agent calls, and keeps frames/registries out of public DTOs,
SSE battle payloads, and the operator semantic-state CLI.

Next slice: `T_ACCEPT` runs the acceptance matrix, full validation, and release
preparation for the next minor version.

## 1. Purpose

Keep exact combat parameters hidden while giving each character enough
qualitative feedback to reason about impact, fatigue, and the world it can
actually sense. Canonical world truth, observer-relative perception, private
interpretation, and public narration remain separate authorities.

```text
canonical mechanics + canonical semantic world
                  -> validated perception evidence
                  -> A/B character perception frames
                  -> private character interpretation and next action
                  -> perspective-specific narration view
                  -> public prose with ID redaction
```

## 2. Turn pipeline and LLM topology

### 2.1 Preferred combined topology

This path adds no LLM call to the current normal turn.

1. The deterministic engine commits actions, parameter changes, terminal state,
   and stable events.
2. Server code derives mechanical evidence and absolute/relative qualitative
   bands from the committed before/after state.
3. The existing semantic-reconciler call returns two independent sections:
   `worldPatch` and `sensoryEvidence`. It receives qualitative mechanical
   evidence, never raw parameters.
4. The server validates the two sections independently. A valid patch may commit
   when sensory evidence is invalid; invalid sensory evidence cannot mutate world
   state.
5. The server normalizes engine and LLM evidence, updates both private contact
   registries serially under the battle lease, and freezes A/B frames.
6. Existing A/B character-agent calls run in parallel with their own frames.
7. The existing fluid-focus call runs only when the configured narration style
   already requires it.
8. The server derives a narration view from the resolved perspective/focus.
9. The existing narrator call produces public prose. A deterministic exact-ID
   replacement pass guarantees that known internal IDs do not reach the user.

### 2.2 Accuracy-gated split topology

One prompt must not retain multiple responsibilities merely to save a call.
Provider/model fixtures compare the combined response with:

1. a world-reconciliation prompt producing only `worldPatch`;
2. a sensory prompt receiving the same committed actions/events, pre-turn world,
   and qualitative engine evidence, producing only `sensoryEvidence`.

The two calls run in parallel and neither receives the other LLM response. Split
therefore separates responsibilities without adding an LLM-to-LLM iteration.

The release configuration selects the split topology when combined mode lowers
the accepted schema-valid rate, world-patch correctness, sensory coverage, or
attribution/privacy accuracy. The choice is fixed per reviewed provider/model
configuration. Runtime does not silently add a second call as a repair retry.
Topology evaluation is scoped inside the configured provider; it cannot promote
OpenAI from fallback to primary. An unresolved XAI failure blocks this slice.

## 3. Evidence contract

```ts
type SensoryModality =
  | "vision"
  | "sound"
  | "smell"
  | "touch"
  | "proprioception"
  | "atmosphere"
  | "other";

type PerceptionEvidence = {
  evidenceId: string;
  basisEventIds: string[];
  modality: SensoryModality;
  phenomenon: string;
  source: ServerOnlySourceRef | { kind: "ambient" };
  accessBySide: {
    a: PerceptionAccess;
    b: PerceptionAccess;
  };
  publicAccess: PerceptionAccess;
};
```

Engine evidence owns committed effect, resource, contact, and terminal results.
The semantic reconciler may propose bounded genre-specific sensory realization
such as a dull impact sound, smoke, a smell, vibration, or an oppressive change
in atmosphere. It cannot change magnitude, mechanics, identity knowledge, or
action legality. Every entity or event reference must resolve against committed
state before evidence is accepted.

The current runtime stores exact `attemptedDelta`, `beforeValue`, `afterValue`,
effective `delta`, and relative references only in the transient server-side
evidence set. The reviewed v10 XAI payload receives only the quantized bands and
outcome. A cue is attached to XAI input only when a committed event structurally
matches its target, parameter, and direction. Pure costs without such an event
remain deterministic projection evidence instead of being attributed through
event prose.

## 4. Character perception frame

```ts
type CurrentAccess = "none" | "trace" | "coarse" | "clear";
type IdentityKnowledge = "unknown" | "suspected" | "identified";

type PerceivedSubject =
  | { kind: "self" }
  | { kind: "counterpart" }
  | { kind: "identified"; perceptionRef: string }
  | { kind: "contact"; contactId: string }
  | { kind: "ambient" };

type PerceptionSlot = {
  subject: PerceivedSubject;
  currentAccess: CurrentAccess;
  identityKnowledge: IdentityKnowledge;
  perceivedAs: string;
  percepts: Percept[];
};

type CharacterPerceptionFrame = {
  observer: { side: "a" | "b"; self: "self" };
  revision: number;
  self: PerceptionSlot;
  counterpart: PerceptionSlot;
  others: PerceptionSlot[];
  qualitativeChanges: QuantizedChange[];
  latestDiff: PerceptionDiff;
};
```

The required character entities remain present in canonical state and the frame
always has both required slots. This does not imply that the counterpart is
perceived or identified.

| Current access | Identity | Example `perceivedAs` |
|---|---|---|
| `none` | `unknown` | 知覚できない |
| `trace` | `unknown` | どこからともなく聞こえる足音 |
| `coarse` | `unknown` | 暗がりに浮かぶ人影 |
| `none` | `identified` | 名前は知っているが、現在の姿は捉えられない相手 |
| `clear` | `identified` | 観測者が知っている表示名 |

Self is always explicitly identified through proprioception even if no visual
self-image is available. A descriptor is evidence-grounded; when no sensory
evidence exists the server uses `知覚できない` instead of inventing a cue.

## 5. Absolute and relative qualitative values

Every committed change is quantized internally along two independent axes.

```ts
type MagnitudeBand =
  | "none"
  | "trace"
  | "light"
  | "solid"
  | "heavy"
  | "extreme";

type QuantizedChange = {
  parameterKey: string;
  parameterClass: "vitality" | "stamina" | "focus" | "other";
  direction: "loss" | "gain" | "unchanged";
  absoluteBand: MagnitudeBand;
  relativeBand: MagnitudeBand | "not_applicable";
  sourceKnowledge: "self" | "identified" | "contact" | "ambient" | "unknown";
  targetKnowledge: "self" | "identified" | "contact" | "unknown";
  outcome: "none" | "effective" | "immune" | "incapacitated" | "overkill";
};
```

`absoluteRatio = abs(delta) / parameterClassReference`

`relativeRatio = abs(delta) / max(1, applicableMaxBefore, applicableMaxAfter)`

The server-owned initial bands are:

| Ratio | Band |
|---:|---|
| `0` | `none` |
| `> 0` through `0.03` | `trace` |
| `> 0.03` through `0.08` | `light` |
| `> 0.08` through `0.18` | `solid` |
| `> 0.18` through `0.35` | `heavy` |
| `> 0.35` | `extreme` |

Absolute references are fixed server configuration per parameter key and do
not depend on either combatant. The initial table mirrors current balance soft
centers:

| Parameter | Absolute reference |
|---|---:|
| `hp`, `maxHp` | `110` |
| `mp`, `maxMp` | `45` |
| `stamina`, `maxStamina` | `50` |
| `atk` | `14` |
| `def`, `spd`, `mag`, `res` | `13` |
| `focus`, `luck` | `12` |

Relative denominators use applicable maxima and
remain stable across same-turn maximum changes by taking the greater of before
and after. HP, MP, and stamina use their paired maximum; maximum parameters and
non-resource stats use the greater magnitude of that target parameter before and
after. Ratios, references, and thresholds are never placed in LLM inputs or
public DTOs.

Current self reserve is separate from turn change:

| Remaining ratio | Reserve band |
|---:|---|
| `0` | `empty` |
| `> 0` through `0.15` | `critical` |
| `> 0.15` through `0.35` | `low` |
| `> 0.35` through `0.60` | `taxed` |
| `> 0.60` through `0.85` | `ready` |
| `> 0.85` | `full` |

Thus a character can receive both “the absolute impact was heavy” and “it was a
light fraction of whatever was struck”, or “the exertion was light in absolute
terms but consumed a major fraction of my remaining stamina”. Opponent reserve
is never derived from hidden mechanics for that observer; it appears only when
validated sensory evidence supports a qualitative inference.

Reserve absolute bands compare the remaining value with the same fixed
parameter reference. Relative HP, MP, and stamina reserves use their paired
maximum; relative focus reserve uses the character's battle-start base focus.
Both sides are computed server-side, but projection may give a character only
its own exact reserve cues.

## 6. Contacts and identification

Each observer has a server-private current registry:

- at most 64 entries per side and 32 percepts in the latest frame;
- monotonically increasing side-scoped contact IDs, never reused;
- current access, identity knowledge, safe descriptor, salience, last-observed
  turn, and server-only source set;
- no prose history and no copies of past frames.

Current access may rise or fall independently from identity knowledge. Once an
identity is established it is not erased merely because the source moves into
darkness. That retained identity does not automatically attribute a currently
unknown sound or impact to the known subject: the new cue remains an anonymous
contact unless current evidence supports the attribution. A suspicion is not an
identity. One canonical source is coalesced across modalities. Indistinguishable
sources may occupy one group contact; later evidence can split it into new
contacts without rewriting past observations.

When full, the registry evicts the oldest low-salience lost unknown contact.
Identified current knowledge is preferred over unknown lost contacts. If no safe
entry can be allocated, the cue remains an untracked ambient perception rather
than reusing an ID or inventing continuity.

## 7. Narration views and identifier safety

Narration views are ephemeral and are not additional LLM calls.

| Perspective/focus | Narrator input |
|---|---|
| Player first-person | Side A frame; A marked `self`; unknowns remain contacts |
| Opponent-limited | Side B frame; B marked viewpoint character and opponent to player |
| Omniscient | All committed IDs and labels may be supplied |
| External third-person | Render labels and observable surface facts only; no IDs |
| Fluid | Existing focus call first; then use the matching row above |

Every structured reference supplied to narration has a `renderLabel`. The
narrator prompt states that IDs are control metadata, must never be quoted,
spoken, parenthesized, or used as names, and that prose must use `renderLabel`.
After the existing single narrator call, the server replaces exact occurrences
of every supplied canonical/contact ID in narrator paragraphs and speeches using
the same ID-to-label catalog. This is output repair, not semantic inference, and
does not add an LLM retry.

## 8. Failure and compatibility

- Semantic patch invalid: reject the patch atomically; independently valid engine
  and sensory evidence remains usable.
- Sensory evidence invalid or provider unavailable: discard that evidence as a
  unit; do not fabricate replacement sensory facts.
- Projection failure: emit a minimal frame with explicit self, engine cues, and
  counterpart `currentAccess=none`; keep the previous registry unchanged.
- Character-agent failure: retain prior private state and use the existing action
  fallback.
- Narrator failure: use existing committed-event fallback and run ID replacement
  over fallback output as well.
- Legacy battle: seed both registries empty but mark the configured counterpart
  identity as known from setup, preserving the previous unconditional-name
  behavior instead of suddenly making an established opponent unknown.
- Parallelism: update ledgers and freeze frames serially under the battle lease;
  only then start A/B agent calls in parallel.

## 9. Required tests

1. A/B side-swapped fixtures produce side-swapped frames and bands.
2. Boundaries for every absolute, relative, and reserve band are monotonic.
3. Damage, healing, stamina, focus, no-effect, immunity, incapacity, overkill,
   multi-target, simultaneous, and environmental effects retain causal identity.
4. An impact in darkness can be strong while its target remains unidentified.
5. Source-less footsteps, smell, and atmosphere do not require a world entity.
6. Current access can fall without erasing established identity.
7. Group contacts split prospectively; past frames are not rewritten.
8. Contact capacity never reuses IDs or leaks server-only source sets.
9. Combined and split prompt fixtures are scored separately for world and sensory
   accuracy before a topology is selected.
10. All narration perspectives receive only the specified view, and no supplied
    canonical/contact ID survives in narrator or speech output.
11. Provider and projection failures retain engine feedback and do not fabricate
    knowledge.
