# Character V2 disclosure and consumer matrix

- Status: Accepted normative companion to ADR-0011
- Date: 2026-08-13
- Related: [character definition design](structured-character-definition-design.md),
  [common projection design](structured-asset-information-projection-design.md)

## Reading the matrix

Each path has a schema ceiling. `required_public` always appears on the public
profile/card surface. `public_eligible` appears there only when the immutable
value policy allows `profile:public`. `restricted` never appears in a public
profile or raw public narration input.

Asset/account visibility is evaluated before this matrix. `required_public`
means required on an already authorized character surface; it never makes a
private or inaccessible character discoverable.

The remaining columns do not override that ceiling:

- **Self** requires the character's authored self-awareness and the self
  consumer contract.
- **Counterpart** always requires target allowance plus committed perception or
  learned encounter evidence. A public card is not encounter knowledge.
- **Narrator** requires the selected perspective and its knowledge/rendering
  contract. `inner` below means only self-inner or omniscient access as stated.
- **Private/compiler** names the internal consumer allowed to receive the raw
  field. Owner/editor access to the complete static definition is separate and
  never reused as an LLM projection.

Descriptions inherit the row of their parent value and may narrow its consumer
tags. IDs, policies, source refs, priorities, and numeric control values are not
implicitly projected with the human-readable value.

## Immutable definition paths

| Definition path | Ceiling | Public profile/card | Self | Counterpart | Narrator | Private/compiler notes |
| --- | --- | --- | --- | --- | --- | --- |
| `identity.displayName` | required_public | always | own name | only after identified/name-learned evidence | use perspective-safe label; canonical only when allowed | selection/manifest identity |
| `identity.names[*].id/kind` | restricted metadata | never raw | used to select own references | never | never raw | self/profile compiler |
| `identity.names[*].value` | public_eligible | if profile policy allows | if authored as own known name | only after target-specific learning/identity evidence | perspective and identity-knowledge gated | value policy can target exact character ID |
| `identity.names[*].description` | inherits name value | only with published name | if self-known | only with the learned name and budget | only with authorized name | style support, not a new alias |
| `identity.presentation.form` | public_eligible | if published | if self-known | observed/apparent form only | rendering perspective | canonical form never replaces perception |
| `identity.presentation.gender` | public_eligible | off by default unless published | if self-known | only explicit learned/observed projection | only permitted perspective | null remains unknown, not neutral |
| `identity.presentation.ageDescription` | public_eligible | off by default unless published | if self-known | apparent/learned only | permitted perspective | no inferred numeric age |
| `identity.presentation.pronouns` | public_eligible | if published | own usage | only learned usage | label/rendering gate | max bounded list |
| `identity.tags[*]` | public_eligible | if published | if meaningful to self | never as canonical tag; only observed facts | rendering only when policy permits | search indexes only published tags |
| `appearance.publicSummary` | public_eligible | normally published by policy | own visible/proprioceptive baseline | observed traits only | external/omniscient rendering as permitted | current battle override outranks baseline |
| `appearance.details[*].region/description` | public_eligible | selected published details | own visible baseline | only perceived details | perspective and budget gated | element IDs remain internal |
| `appearance.visualPrompt` | restricted | never | never | never | never | `character-image-brief-v2` only |
| `appearance.portrait.mediaId/revisionId` | public_eligible reference | selected portrait URL projection | available | public card only, not cognition | presentation surface only | exact revision retained by generation |
| `profileBackground[*].kind` | restricted metadata | never raw | never raw | never | never raw | compiler dispatch only |
| `profileBackground[*].summary/description` | public_eligible | if published | aware=full, partial=bounded effect, unaware=none | only target policy plus learned evidence | self-inner/omniscient or externally established fact | deep psyche receives own stable background |
| `profileBackground[*].selfAwareness` | restricted | never | controls projection; never shown as score | never | never raw | projection policy/deep psyche |
| `psycheDisposition.dynamicsVersion` | restricted | never | never | never | never | psyche compiler/manifest |
| `psycheDisposition.dynamics.*` | restricted | never | never raw | never | never | deterministic psyche input only; numeric 0..1000 |
| `psycheDisposition.coreNeeds[*].description` | public_eligible | only if explicitly published | aware=full, partial=bounded conscious effect, unaware=none | never as hidden need; only spoken/acted manifestations | self-inner/omniscient cue when allowed | deep psyche receives raw own need |
| `psycheDisposition.coreNeeds[*].selfAwareness` | restricted | never | projection control only | never | never raw | deep psyche/projector |
| `psycheDisposition.tendencies[*].label` | restricted | never raw control label | only aware human description, not internal label | never | never raw | deep psyche/owner diagnostics |
| `psycheDisposition.tendencies[*].backgroundRefs` | restricted metadata | referenced published background may render | according to awareness | never raw | never raw | deep psyche/support validation |
| `psycheDisposition.tendencies[*].triggerKinds` | restricted | never | bounded felt pattern only if aware | never | no raw trigger list | psyche compiler; avoids publishing exploitable hidden controls |
| `psycheDisposition.tendencies[*].tendencyDescription` | public_eligible | if published | awareness-gated | learned behavior only, not canonical tendency | self-inner/omniscient when permitted | deep psyche always receives own accepted description |
| `psycheDisposition.tendencies[*].manifestationDescription` | public_eligible | if published | awareness-gated | only after a manifestation becomes committed/perceived | external observable cue or inner perspective | proposal cannot itself become observation |
| `psycheDisposition.description` | public_eligible | if published and within profile budget | awareness-filtered selection | never wholesale | perspective-filtered selection | deep psyche; no all-description concatenation |
| `actionNorms[*].id` | restricted metadata | never | never raw | never | never | deterministic rule receipt/reference |
| `actionNorms[*].when/response.actionRefs/actionKinds/tacticTags` | restricted | never raw | compiler may provide applicable human meaning | never | never raw | action norm evaluator only |
| `actionNorms[*].response.statement` | public_eligible | if author publishes behavioral principle | if self-aware/applicable | learned from behavior only | inner perspective or observed pattern | conscious action receives applicable bounded statements |
| `actionNorms[*].priority/force/fallbackActionRef` | restricted | never | never raw number/control | never | never | deterministic action-rank compiler |
| `actionNorms[*].selfAwareness` | restricted | never | controls full/partial/no conscious norm meaning | never | never raw | action/deep-psyche projector |
| `actionNorms[*].exceptions` | restricted by default | only a separately published description | applicable self-known exception meaning | never as rule | inner perspective only if authored/allowed | deterministic predicate evaluation |
| `actionNorms[*].description` | public_eligible | if published | self-aware and relevant | learned pattern only | perspective-gated | action/deep-psyche budgeted guidance |
| `speechPolicy.selfAwareness` | restricted | never | controls conscious description of speaking habits | never | never raw | expression projector |
| `speechPolicy.frequency/phasePolicy/reactTo` | public_eligible | if published as speaking tendency | awareness-filtered own tendency without control labels | inferred only from actual speech | rendering guidance only | expression compiler; cannot create a speech event |
| `speechPolicy.silenceRules[*].clauses/priority` | restricted | never | applicable bounded silence tendency | never | never | expression opportunity selector |
| `speechPolicy.silenceRules[*].description` | public_eligible | if published | when applicable/self-aware | observed silence only | perspective-gated | expression guidance |
| `speechPolicy.register/cadence/sentenceLength` | public_eligible | if published | available | only through heard speech; never canonical fields | authorized speech rendering | expression compiler |
| `speechPolicy.vocabularyHabits` | public_eligible | if published | available | learned/heard vocabulary only | authorized rendering | expression compiler, bounded selection |
| `speechPolicy.addressRules[*].target/priority` | restricted metadata | never | resolved rule only | never | never raw | social/address compiler |
| `speechPolicy.addressRules[*].address` | public_eligible | only if explicitly published | when target rule matches | heard address becomes conversation evidence | narrator may render committed utterance | exact-target rules use logical IDs |
| `speechPolicy.selfReferenceNameId` | restricted reference | projected name may be public | resolved own self reference | learned only when heard | utterance rendering | self/social compiler |
| `speechPolicy.examples[*].text` | public_eligible | normally omitted; optional style sample | max two relevant examples | never as facts; heard output only | never copied as event | expression guidance with anti-copy instruction |
| `speechPolicy.counterexamples[*]` | restricted | never | never raw | never | never | expression validator only |
| `speechPolicy.description` | public_eligible | if published | available | learned style only | rendering guidance | expression compiler |
| `relationshipSeeds[*].id/target` | restricted metadata | never raw asset ID | resolved relation where awareness permits | never as disclosure grant | never raw | relationship resolver; exact asset ID beats role |
| `relationshipSeeds[*].relationKinds` | public_eligible | if target-safe policy publishes | awareness-gated | only if counterpart-specific policy plus learned evidence | self-inner/omniscient when permitted | deep psyche/social compiler |
| `relationshipSeeds[*].historySummary` | public_eligible | if both value and target are publishable | awareness-gated | exact target policy plus learned history | perspective-gated | deep psyche; does not create shared memory |
| `relationshipSeeds[*].defaultAddress` | public_eligible | if published | resolved for matching target | heard address only | committed speech rendering | social/address compiler |
| `relationshipSeeds[*].selfAwareness` | restricted | never | projection control | never | never raw | deep psyche/projector |
| `relationshipSeeds[*].dynamics.*` | restricted | never | never raw | never | never | deterministic psyche relationship input, -1000..1000 |
| `relationshipSeeds[*].priority` | restricted | never | never | never | never | deterministic resolver |
| `combat.parameters.*` | restricted | never raw | qualitative self state only through battle perception | qualitative observation only | mechanics-safe presentation projection only | mechanics; `focus` does not enable expression focus in P2 |
| `combat.flags.*` | restricted | never raw | battle-state projection | observable condition only | result/state rendering only | mechanics and eligibility |
| `capabilities.basicAction/skills[*].id/kind/tacticTags` | restricted metadata | never raw IDs/tags | resolved own actions | learned affordance only | safe action rendering | mechanics/action compiler |
| `capabilities.*.name/description` | public_eligible | if published | own known capability | only target policy plus observation/learning | action rendering when manifest/perspective permits | descriptions never change mechanics |
| `capabilities.*.mechanics.power/scaling/resistance/cost/effects` | restricted | never | legal choices and qualitative cost, not hidden formulas | observed result only | never raw | mechanics compiler |
| `capabilities.*.mechanics.constraints` | restricted | optional derived human capability summary only | legal-action explanation | observed affordance only | action rendering | feasibility validator |
| `capabilities.*.expressionNotes` | public_eligible | if published | relevant action expression | never before observed use | action rendering | expression compiler, bounded |
| `inventory[*].id/kind` | restricted metadata | never raw ID; safe kind may be derived | known inventory | perceived object kind only | perspective-safe rendering | mechanics/world seed |
| `inventory[*].name/description` | public_eligible | if published | own known item | observed/learned item only | rendering if visible/known | profile and world rendering |
| `inventory[*].equipmentBonuses/battleStartEffects` | restricted | never | qualitative effect only | observed outcome only | never raw | mechanics compiler |
| `inventory[*].affordance.portable/usable/useDescriptions` | public_eligible | optional derived item summary | own known uses | perceived/learned affordances | visible use rendering | free-action affordance compiler |
| `inventory[*].affordance.causalEnvelope` | restricted | never | legal opportunity projection only | observed causal result only | never raw | free-action/world validator |
| `initialLoadout[*].itemId/quantity/placement` | public_eligible | only published carried/equipped projection | own initial state | perception decides current state | perspective-safe current state | battle world seed; mutable placement supersedes baseline |
| `expressionNotes` | public_eligible | only if explicitly selected for profile | selected under consumer budget | never wholesale; observed style only | perspective/consumer gated | deep psyche/conscious/narrator compilers as tagged |

## Envelope and operational paths

| Path | Ceiling/surface | Rule |
| --- | --- | --- |
| `publicPresentation.description` | required public for a ready character | stored derived profile; never parsed for mechanics/cognition |
| `publicPresentation.*Digest/contractVersion` | public-safe opaque version label or internal diagnostics | no private source content |
| `provenance.sourceDigest/attemptId/generatorContracts` | restricted | owner/admin audit only; never LLM battle input |
| raw authoring source | restricted temporary attempt data | description authoring only, then retention-window redaction |
| `disclosurePolicy.rules` | restricted control metadata | evaluated server-side; prompts never decide publication |
| owner ID and match visibility | operational | owner/public DTO as current product rules allow; not character cognition |
| records/ratings | operational presentation | never definition, psyche, or action grounding |
| improvement memo | owner-private operational | may form a new owner instruction but never silently mutates definition |
| learned opponent memory | owner-private durable relation state | exact counterpart only; separate from immutable relationship seed |
| soft delete/current pointer/compatibility/attempt | operational | management and selection control only |

## Dynamic battle projections

| Dynamic path | Public profile | Self | Counterpart | Narrator | Owner |
| --- | --- | --- | --- | --- | --- |
| raw `battlePsycheState` / `interior` | never | never raw in conscious action/expression | never | never raw | not a live authoring field |
| deterministic psyche trait/state numbers and receipts | never | bounded conscious effect only | never | never | internal diagnostics only |
| `CharacterConsciousEffectV2` | never | yes, evidence/self-awareness gated | never directly | self-inner/omniscient cue only if separately projected | history only under explicit private observability |
| `CharacterObservableManifestationV2` proposal | never | own proposed expression/action input | never until committed and perceived | external rendering only after commit | internal trace |
| committed manifestation event | battle public surface if otherwise visible | perceived self event | observer-relative perception | perspective-safe narration | battle history |
| `CharacterNarrativeCueV2` | never as raw field | not automatically | never | matching perspective only | internal trace |
| conscious thought | never | yes | only after spoken/acted evidence | self-inner/omniscient perspective only | private history policy, not profile |
| focus state/receipt/raw effectiveness | never | no new P2 projection | never | never | shadow/internal diagnostics only |

## Mandatory matrix tests

1. `displayName` is present on a public card but absent from an unidentified
   opponent context.
2. A published disposition background enters the profile, while its dynamics,
   trigger list, and live activation do not.
3. The same relationship value projects to target character X after knowledge
   evidence and not to unrelated character Y.
4. Exact-character and role relationship seeds resolve deterministically and do
   not match by display name.
5. `unaware`, `partial`, and `aware` produce distinct self projections without
   changing public policy.
6. An observable manifestation proposal is invisible to the counterpart until
   it becomes a committed event and the counterpart perception contains it.
7. External, self-inner, and omniscient narrator perspectives receive different
   authorized inputs; none receives raw dynamics or `interior`.
8. Public skill/item descriptions never expose power, effect magnitudes, causal
   envelopes, or current held state.
9. Description consumer tags can narrow a parent but cannot widen it.
10. Source prose containing a restricted fact cannot make that fact appear in a
    profile unless the display projection contains an authorized support ref.
11. A/B observer swap preserves structural symmetry while knowledge evidence
    produces the intended value differences.
12. Owner/editor projection contains the complete static definition but no
    unrelated live battle-private state.
