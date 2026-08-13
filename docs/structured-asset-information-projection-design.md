# Structured asset information and context projection design

- Status: Common gates accepted by ADR-0010; exact character paths await P2
- Date: 2026-08-13
- Decision owner: Product owner
- Related: [structured-asset-authoring-workflow.md](structured-asset-authoring-workflow.md),
  [proposed common envelope](structured-asset-envelope-design.md),
  [ADR-0010](adr/0010-structured-selectable-asset-envelope.md),
  [structured-domain-assets-backlog.md](structured-domain-assets-backlog.md)

## Why one public/private flag is insufficient

Whether information may be published is different from whether a participant
knows it. A character name can be mandatory on a public profile while remaining
unknown to an opponent inside a battle. Likewise, a psychological background
may be safe to publish, while the character's current latent reaction state is
not something the character consciously knows or the narrator should receive
as raw state.

Projection therefore has four independent gates:

1. **schema disclosure ceiling** — may this kind of field be published at all;
2. **value audience policy** — to which targets and channels may this value be
   projected;
3. **consumer contract** — is this field relevant and allowed for this consumer;
4. **runtime knowledge** — has this observer perceived, learned, or consciously
   accessed this particular value in the bound battle snapshot.

Passing one gate never bypasses the others.

## Schema disclosure classes

Every authorable schema element declares one class in versioned schema metadata:

- `required_public`: the management/profile projection must expose it, such as
  the asset's display name. This still does not automatically grant in-battle
  knowledge to another character.
- `public_eligible`: it may be exposed through explicitly allowed public
  channels. The asset value carries a bounded publication choice; the schema
  supplies its default and which channels are legal.
- `restricted`: it cannot enter a public profile or raw public narration input.
  Only named internal consumers may receive it, or a separately defined safe
  projection derived from it.

Schema metadata owns the maximum disclosure. An instance may narrow an eligible
field for each target/channel but cannot widen a `restricted` field or hide a
`required_public` field from the public management/profile surface.
Descriptions, examples, and extensions inherit their parent's disclosure and
consumer limits unless their schema explicitly narrows them; they can never
widen the parent.

## Target-dependent audience policy

A `public_eligible` value carries a bounded allowlist rather than one global
boolean. A rule selects both a channel and a target class, for example:

- channels: `profile`, `narrator`, `self_context`, `counterpart_context`, or a
  named internal compiler;
- targets: `public`, `owner`, `self_character`, `current_counterpart`, a stable
  logical character/asset ID, or an explicitly modeled relationship role;
- optional prerequisites: a narration perspective, authored self-awareness,
  encounter knowledge, or committed observation evidence.

The policy is stored with the immutable source generation. Specific character
targets use stable logical IDs, never display names; battle creation resolves
them into the bound manifest. Rules are allow-only, default to no projection,
and combine by intersection with the schema ceiling and consumer contract. A
target override cannot reveal a restricted value or manufacture runtime
knowledge.

For example, one relationship background can be available to the owner, the
self character, and an omniscient narrator, unavailable to unrelated
characters, and available to the related counterpart only after explicit
learning evidence. A name remains required on the public profile but still does
not enter that counterpart's battle context before identity knowledge exists.

These decisions are evaluated by server projection code before LLM invocation.
Prompts never receive the policy and decide for themselves whether to reveal a
field.

## Consumer-specific projections

There is no generic “send the whole asset to the LLM” operation. Versioned
projection compilers build bounded inputs for each consumer:

| Consumer | Receives | Must not receive |
| --- | --- | --- |
| Profile/scene/style description generator | frozen natural source inside the authoring boundary plus `required_public` and published `public_eligible` fields and their allowed descriptions | structured restricted fields and raw dynamic state; source wording never grants publication by itself |
| Battle mechanics/world initialization | exact authoritative structured fields required by the rule/compiler | public prose as a rule source |
| Deep-psyche stage | stable disposition/background allowed for psyche plus its own private battle state and observer-safe events | opponent-private state and omniscient world facts |
| Conscious character action/expression | self-known profile/background, conscious thoughts, observed events, and bounded effects/impulses projected by deep psyche | raw latent state, latent numeric traits, hidden causes, and unobserved opponent facts |
| Opponent character | only observer-relative perception, conversation actually perceived, and explicitly learned encounter knowledge | the other asset's profile/structure merely because it is publicly publishable |
| Narrator | the perspective-specific narration view plus safe rendering descriptions and observable/authorized psychological manifestations | raw latent state, mechanics-private fields, or fields outside the selected perspective |
| Owner/editor/internal observability | the fields authorized for that administrative surface | accidental reuse as a public or character-facing projection |

Narration perspective remains an additional gate. An omniscient narrator may
receive a deliberately authored safe psychological cue when its schema permits
that channel, but never the raw latent-state record or numeric reaction vector.
A character-limited narrator receives only what that viewpoint may know or
observe.

## Psyche separation

Stable authored disposition and live latent state are different objects:

- `psycheDisposition`: immutable character-generation definition. It includes
  structured tendencies, the experiences/background that explain them, and
  bounded descriptions of how they tend to manifest.
- `battlePsycheState`: mutable, battle-scoped internal state such as current
  activation, hidden emotion, appraisal, impulse, inhibition, or relationship
  tension.

The background and tendency descriptions may be `public_eligible` and can feed
the profile generator when published. The raw `battlePsycheState` is
`restricted` and never feeds profile generation.

The deep-psyche component can translate latent state into separate projections:

- a `consciousEffect` such as a felt concern or impulse that the character may
  recognize without seeing its hidden state or causal vector;
- an `observableManifestation` such as a pause, tightened grip, or change in
  voice, which still reaches an opponent only through committed world/action
  evidence and observer-relative perception;
- a `narrativeCue` that an authorized narration perspective may render without
  exposing internal labels, scores, or hidden reasoning.

This keeps subconscious influence expressive without making the character,
opponent, or narrator omniscient. In the character pipeline, the deep-psyche
stage owns raw latent state; conscious action/expression consumes only its
bounded projection. The current expression input that can carry full
`interior` state must be audited and narrowed in the character slice.

## Description fields preserve expression

Structured enums, IDs, numbers, and rules are not expected to carry all useful
creative nuance. Each meaningful structured element may therefore include a
bounded `description` and, where useful, examples/counterexamples:

- the description explains this element, not the entire asset;
- it is valid LLM context for the element's named consumers;
- it can guide characterization, imagery, rhythm, and interpretation, but does
  not create a mechanic or override structured constraints;
- it carries provenance and inherits disclosure/access rules;
- compilers select relevant descriptions under a context budget instead of
  concatenating every description into every prompt.

Useful distinctions include `backgroundDescription`,
`manifestationDescription`, `speechDescription`, `terrainDescription`,
`effectDescription`, and `renderingDescription`. A bounded asset-level
`description` or `expressionNotes` may retain cross-cutting nuance that does not
fit a narrower element, but it must declare allowed consumers and remain
non-authoritative for mechanics.

## Initial character policy examples

| Element | Disclosure | Profile | Self-conscious | Opponent | Narrator |
| --- | --- | --- | --- | --- | --- |
| display name | required public | required | known as self | only when encounter knowledge permits | perspective/knowledge-gated label |
| appearance description | public eligible | if published | available | only observed traits | view-safe rendering anchor |
| disposition background | public eligible | if published | according to authored self-awareness | only learned/observed manifestation | safe cue when perspective permits |
| latent trait weights | restricted | never | never raw | never | never raw |
| current latent state | restricted dynamic | never | conscious-effect projection only | observable manifestation through perception only | narrative cue only when authorized |
| conscious thought | restricted dynamic | never by default | available to self | never unless spoken/acted | only an inner-access narration perspective |
| skill/equipment facts | schema-specific required/eligible | according to policy | own known capability | observed/learned affordance only | perspective-safe rendering facts |

P2 will replace examples with a complete path-by-path policy table and tests.
Every projection test must include non-leakage, required-field presence,
optional-field choice, two different target characters receiving different
authorized projections, observer symmetry, perspective gating, and a
description that preserves nuance without changing mechanics.
