# Structured narration definition design

- Status: Accepted implementation design
- Date: 2026-08-14
- Authority: ADR-0010 and ADR-0013
- PERT task: `SDA_NARRATION`

## Authority split

```text
owner source
  -> NarrationDefinitionV2 (immutable style authority)
  -> NarrationPublicPresentationV2 (stored derived style card)
  -> ready style generation
       -> NarrationPromptCompilerV2
       -> frozen phase policy in BattleState and BattleAssetManifest
       -> phase narrator input (presentation only)
```

Committed battle facts, perspective projections, and phase result contracts
flow directly to narrators. Style compilation is a lower-priority presentation
input and never a source of those facts.

## Definition contract

All operational enums are closed. Free-form tags are display/search labels
only. Every rhetoric entry and example has a stable key unique in its section.

### Identity and information rights

- `identity`: display name, language, public tags, and a bounded persona
  descriptor.
- `perspective`: one of `self`, `foe`, `external`, `omniscient`, or `fluid`.
  This requests a projection; it cannot cause unprojected inputs to be exposed.
- Voice controls use closed register, audience-distance, subjectivity, and
  address-mode vocabularies.

### Cadence and phases

- Cadence uses closed sentence-length and dialogue-placement modes plus bounded
  paragraph and line budgets.
- The phase registry is exactly `prologue`, `action`, `impact`, `release`,
  `judgment`, and `aftermath`.
- Every phase has enabled/emphasis, energy, explanation, imagery, and dialogue
  density controls. Global safety-facing intensity ceilings remain effective
  even if a phase requests a stronger presentation.

### Dimensions, rhetoric, and examples

- Global dimensions bound explanation, imagery, metaphor, humor, violence, and
  explicitness on small integer scales. They describe rendering intensity, not
  event severity or permission.
- Preferred rhetoric entries identify a bounded technique and guidance.
  Forbidden entries identify a bounded pattern and avoidance guidance.
- Examples and counterexamples carry a stable ID, one or more phase tags, and
  bounded text. They cannot contain template variables or authority markers.
  Their text is not admitted to character, scene, action, result, or continuity
  evidence.

## Public style projection

The display projection contains identity, requested perspective label, voice,
cadence summary, phase emphasis, and audience-visible dimension summaries. It
omits example and counterexample text, forbidden rhetoric, compiler wording,
source provenance, and precedence controls.

The public description is generated from the frozen natural source plus this
projection. Each factual segment carries exact projection support references.
Unsupported facts, example quotations, private control descriptions, or
unknown proper nouns block activation.

## Authoring and compatibility

Creation has no visible logical row before owner confirmation. Revision and
upgrade freeze the expected current generation ID and content digest.
Confirmation rechecks both, appends schema 2, updates the read model, and moves
the current pointer in one transaction.

Legacy upgrade is bounded:

- ID, ownership, display name, tags, and timestamps remain stable;
- the legacy perspective is copied exactly into the structure generator base;
- legacy instruction plus description is the frozen upgrade source;
- missing perspective becomes `external`;
- no sentence, phase, intensity, rhetoric, or example structure is inferred by
  the server from prose; the validated structure candidate supplies it; and
- public description is regenerated from source plus safe projection.

System seed import is deterministic. It maps the maintained seed perspective,
known prose markers, and preset ID to a complete definition with fixed stable
keys. User rows are never imported automatically.

## Deterministic prompt compiler

`narration-prompt-v2` performs no provider call. For each phase it:

1. validates the ready envelope and required compiler versions;
2. emits the fixed precedence and no-fact/no-authority clauses;
3. renders voice, cadence, global dimensions, and that phase policy in a fixed
   field order;
4. renders preferred and forbidden rhetoric in stable definition order;
5. selects the first two matching examples and first matching counterexample;
6. truncates the example block to its contract budget and emits an explicit
   no-copy/no-fact clause; and
7. records compiler version and selected stable IDs in the compiled snapshot.

Public description and source text are not compiler inputs. Equal definition
content therefore produces byte-equivalent compiled policy.

The battle snapshot retains the legacy `instruction` field for old save
compatibility, but new schema-2 bindings populate it with a generic compiled
fallback and carry all six phase instructions. Consumers select the exact phase
instruction. Combat action, impact, and release phases use their corresponding
compiled entry; judgment, prologue, and aftermath use theirs directly.

## Conflict matrix

| Conflict | Effective authority |
| --- | --- |
| Style asks for hidden thoughts | Server perspective projection |
| Example contradicts committed action/result | Committed battle facts |
| Style asks judgment narrator to change winner | Judgment phase contract |
| Style requests disallowed explicitness | Provider and product safety ceiling |
| Public card claims a mechanic | Claim validation blocks activation |
| Current style changes during battle | Frozen generation and compiled snapshot |

## Cutover matrix

| Surface | Unsupported | Ready V2 |
| --- | --- | --- |
| Management list/delete | allowed when accessible | allowed |
| Explicit upgrade | allowed for owner/operator | `already_current` |
| Create/revision | candidate and confirmation only | candidate and confirmation only |
| Match selector | excluded | included |
| Direct battle ID | rejected | exact generation read |
| Battle creation | rejected | read-only bind and compile |
| Historical battle replay | frozen legacy snapshot | frozen V2 snapshot |

## Acceptance boundary

Local acceptance requires schema/compiler tests, repository transaction tests,
actual HTTP/persistence tests, selector/direct-ID gates, read-only battle
binding, all phase consumer checks, frontend review/confirm/upgrade behavior,
full workspace tests, typecheck, build, and PERT validation. Release, Stage,
production Promote, and bulk migration remain separately gated.
