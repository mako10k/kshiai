# Narrator input compression study

Date: 2026-08-07 (Asia/Tokyo)

Status: investigation only. This document does not change the narrator prompt,
runtime payload, provider routing, output guard, or canonical authority.

## Question and conclusion

The canonical and perspective-projected state currently reaches the narrator as
compact JSON. Converting that JSON to prose would remove visible syntax, but it
would also make fact boundaries, ownership, absence, and nesting implicit.
Japanese prose is not guaranteed to use fewer provider tokens than the existing
English field names either.

The useful part of the proposal is therefore **not free-form natural-language
conversion**. The promising form is a deterministic, schema-aware, typed text
projection:

- keep the canonical JSON and `NarrationTurnBrief` as authoritative internal
  data and retained trace;
- assign short turn-local handles such as `A`, `B`, `E1`, and `E2` to repeated
  subjects;
- render fixed, role-labelled sections in a stable order;
- put one typed fact or tuple on each indented line;
- state `none`, `unknown`, `unchanged`, and `unavailable` explicitly rather than
  relying on omission;
- keep action-owned causality, unattributed observations, canonical changes,
  current state, and static background in different sections.

This preserves the hierarchy that matters to inference while avoiding most
repeated object keys and entity labels. Indentation helps readability only after
the schema has removed repetition; merely pretty-printing JSON is substantially
larger.

## Current path

`buildNarrationTurnBrief` derives a role-labelled projection from
`NarrationTurnView`. `narrateTurn` then sends the following body as minified
JSON:

```text
{
  brief,
  focus,
  recentNarration,
  recentSpeeches,
  drama,
  innerDigests,
  characterSpeeches
}
```

The brief deliberately separates these roles:

- `turnResult`: this turn's actions, adjudicated causality, resolved events,
  unattributed observations, and canonical change receipt;
- `currentState`: the scene and participant conditions that remain true now;
- `presentation`: labels, profile anchors, reader continuity, and recognition;
- `observationBoundary`: the permitted perceptual boundary;
- `staticBackground`: stable battlefield flavor, not a turn event.

Those distinctions are valuable and must survive compression. The source of
truth should not become model-facing prose, and narrator prose must not be
parsed back into canonical state.

## Measurement

### Corpus

The measurement used the 17 narrator inputs retained for production E2E battle
`btl_fdad569f54082b7981f9704f` (release v0.12.0 observation). It read the
persisted `pipelineTrace.narrator.input.turnBrief` without changing the battle.
Sizes are UTF-8 bytes of the serialized model-visible data.

The trace does not retain provider input-token usage and the repository does
not currently include an applicable tokenizer. Byte counts are therefore a
reproducible structural proxy, **not a token-cost claim**. Token acceptance must
later use the exact primary and fallback provider models independently.

### Baseline shape

| Measurement | Result |
|---|---:|
| Full narrator input, average | 8,662 bytes |
| `turnBrief`, total over 17 turns | 102,846 bytes |
| `turnBrief`, average | 6,050 bytes |
| `turnBrief`, range | 5,289-6,981 bytes |
| `turnResult`, average | 2,328 bytes |
| `presentation`, average | 1,885 bytes |
| `currentState`, average | 975 bytes |
| `observationBoundary`, average | 523 bytes |
| `staticBackground`, average | 222 bytes |

`presentation`, `observationBoundary`, and `staticBackground` together average
2,630 bytes, or about 43% of the brief. They are almost entirely stable across
the 17 turns. `currentState` must remain current, but its complete reserve-cue
shape and scene text also repeat heavily.

Across the corpus, compact JSON bytes divide as follows:

| Contribution | Total | Share |
|---|---:|---:|
| Object keys including `:` | 48,444 bytes | 47.1% |
| Scalar values | 48,801 bytes | 47.5% |
| Braces, brackets, and separators | 5,601 bytes | 5.4% |

The main overhead is repeated schema vocabulary, not braces and commas. For
example, the two participant display names occur 364 times across 17 briefs,
while four opaque reader references occur 136 times. Fields such as
`parameterKey`, `absoluteBand`, `relativeBand`, `subjectRef`, `relation`,
`continuity`, and `identityKnowledge` also recur for every typed record.

### Representation probes

These probes were computed in memory from the retained briefs; no candidate
encoder was added to production code.

| Representation | Average | Change from compact JSON | Interpretation |
|---|---:|---:|---|
| Current compact JSON | 6,050 bytes | baseline | Explicit and self-describing |
| Pretty JSON, two-space indentation | 9,183 bytes | +51.8% | Nesting is clearer but cost is much worse |
| Generic indented outline retaining every key | 7,486 bytes | +23.7% | Removing punctuation does not offset whitespace while keys remain |
| Compact JSON with `A`/`B`/`E*` aliases and duplicate label maps removed | 5,245 bytes | -13.3% | A low-risk semantic compaction direction |
| Positional fixed-schema arrays | 3,200 bytes | -47.1% | Approximate structural lower bound, but too opaque for the narrator |

The alias probe included one entity-label table, replaced repeated labels and
reader references with handles, and removed duplicate participant-label maps
and profile display names. An internal inverse map would be required to turn a
recognition update handle back into its canonical reader reference.

The positional probe retained scalar values and nesting but removed object keys
by assuming a fixed field order. It shows the available compression headroom;
it is not recommended because a model must remember positions and optional
field layouts, increasing inference risk.

## Recommended model-facing form

Use a versioned `NarrationBriefText` projection that looks natural enough to
scan, but remains a constrained protocol rather than prose. The following is a
shape sketch, not a frozen grammar:

```text
NARRATION-BRIEF v1
ENTITIES
  A = "因果観測者コーデックス"
  B = "対照剣士アイアン"
  E1 = "鉄製非常階段"
  E2 = "錆びた赤い軽ワゴン"

TURN 8
RESULT
  ACTION A "観測姿勢"
    description = "足場と呼吸を整え、次の変化を捉えやすくする。"
    resolution = accepted; requested=skill; effective=skill; executed=yes
    caused
      defend A
      focus A gain minor
    mechanics
      mp A loss solid
      focus A gain heavy
  ACTION B "機をうかがう"
    resolution = accepted; requested=wait; effective=wait; executed=yes
    caused
      wait B
    mechanics = none
  RESOLVED-EVENTS
    - "..."
  UNATTRIBUTED-CONSEQUENCES
    - target=identified; source=unknown; mp gain trace
  CANONICAL-CHANGE
    semantic = applied unchanged
    world = applied unchanged; operations=none

CURRENT-STATE
  scene = "..."
  scene-facts = none
  A = can-fight yes; defending yes; hp ready/full; ...
  B = can-fight yes; defending no; hp taxed/ready; ...

OBSERVATION
  mode = external; viewpoint = none; resolved-from-fluid = no
  A = self; identity=identified; continuity=same-entity
  B = opponent; identity=identified; continuity=same-entity
  E1 = environment; identity=identified; continuity=same-entity
  E2 = environment; identity=identified; continuity=same-entity

PRESENTATION
  A = appearance "..."; self-name "私"; age unknown; gender unknown
  B = appearance "..."; self-name "俺"; age unknown; gender unknown
  disclosed = "..."

STATIC-BACKGROUND
  battlefield = "霧雨と赤いワゴンの路地"
  terrain = "..."
  obstacles = E1, E2
```

The renderer should quote and JSON-escape unconstrained text values. Fixed
headers and indentation carry the hierarchy; punctuation inside a description
cannot create a new field. Collections have an explicit `none` marker when
empty. Optional fields need a schema-defined absence rule rather than ad hoc
omission.

This form is preferable to full Japanese sentences for three reasons:

1. A sentence such as "AがBを弱らせた" silently commits an actor-to-effect
   relationship. The current input correctly keeps some consequences
   unattributed.
2. Prose tends to collapse `false`, empty, unknown, rejected, skipped, and
   unavailable into the same absence. Those states have different authority.
3. Provider tokenization is model-specific. Short English section vocabulary
   and repeated handles may tokenize better than newly generated Japanese
   connective prose, but this must be measured rather than assumed.

## What to compact, and what not to compact

### Compact first

- Replace repeated participant, environment, and reader references with stable
  handles declared once per brief.
- Merge duplicate label directories into the handle table.
- Express repeated typed records as schema-labelled tuples, for example reserve
  cues and mechanical consequences.
- State common empty/default groups once (`mechanics=none`,
  `operations=none`) instead of repeating several null and empty properties.
- Order stable battle context before turn-varying content if a provider's exact
  prompt-cache behavior is later confirmed. This may reduce billed uncached
  input even when logical context remains unchanged.

### Preserve explicitly

- requested versus effective action kind, execution, resolution outcome and
  reason;
- the owner of each causal statement;
- unattributed observed consequences and semantic change kinds as a separate
  group;
- semantic and world transition status, `changed`, and operation kinds;
- current state in full enough form for a stateless request;
- perception access, relation, identity knowledge, and continuity;
- the distinction between `none`, `unknown`, `unchanged`, `rejected`,
  `skipped`, and `unavailable`;
- presentation facts that affect naming or continuity;
- stable background as background, never as a newly resolved event.

### Do not use as compression

- Do not summarize canonical facts with another LLM.
- Do not mine narrator prose to recover omitted facts or causes.
- Do not send only a delta while calls are stateless; recent narration is not a
  state store.
- Do not merge `resolvedEvents` with `canonicalChange` while their owners can
  still disagree. Label the disagreement instead of resolving it in the
  serializer.
- Do not replace structured uncertainty with a fluent guessed explanation.
- Do not add an output validator, rejection guard, repair loop, or narrator
  authority as part of this input-only change.

## Regression contract for a future implementation

A later implementation should not be accepted on byte reduction alone.

### Structural and authority regression

- Rendering is deterministic for identical `NarrationTurnBrief` input and uses
  a stable field and collection order.
- Every model-visible source fact has a declared destination in the text schema
  or an explicit, reviewed reason for exclusion.
- Property tests cover delimiter characters, quotes, newlines, empty arrays,
  nulls, false values, unknown identity, inaccessible subjects, and unmatched
  causality.
- A/B swapping changes handles and labels consistently without changing
  authority or leaking canonical IDs.
- Raw reader references remain in the internal inverse map and retained JSON
  trace; the model sees only handles and can return only declared handles.
- Canonical JSON, semantic/world transitions, adjudication, character-agent
  state, and narrator freedom remain unchanged.

### Cost regression

- Record exact input tokens reported by each configured provider/model; do not
  extrapolate one provider's tokenizer to another.
- Compare p50 and p95 tokens for the same retained/sanitized corpus against the
  compact-JSON baseline.
- Treat no token regression as a hard condition. Use 20% median brief-token
  reduction as an initial engineering target, not as a frozen product
  requirement; revise it after the first exact-token measurement.
- Report cached and uncached input tokens separately when provider prefix
  caching is used.

### Narration-value regression

- Compare the same turns with the same model, temperature, prompt, and recent
  narration; change only the brief representation.
- Review whether action, cause, concrete result, next-exchange condition,
  identity uncertainty, and canonical-change status remain recoverable in the
  output.
- Retain examples where `resolvedEvents` and `canonicalChange` disagree; a
  fluent answer that hides the disagreement is a failure.
- Record latency and timeout distribution separately from token usage. Smaller
  input may help latency, but it must not be presented as the cause without an
  observed comparison.

## Decision boundary

No runtime patch is selected by this study. If this axis is selected after the
current pipeline work, the smallest useful experiment is:

1. add a deterministic typed-text renderer beside the existing brief;
2. retain canonical JSON plus both serialized forms in internal observation;
3. compare exact tokens and narration value on the same corpus;
4. switch the narrator input only after the structural regression contract
   passes.

The current compact JSON remains the production input until that separate task
is explicitly started.
