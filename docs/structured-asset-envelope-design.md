# Structured selectable-asset envelope and activation contract

- Status: Accepted by ADR-0010; asset-family implementation remains separately gated
- Date: 2026-08-13
- Decision owner: Product owner
- PERT task: `SDA_ENVELOPE_DESIGN`
- Related: [current-state inventory](structured-domain-assets-current-inventory.md),
  [authoring workflow](structured-asset-authoring-workflow.md),
  [information projection](structured-asset-information-projection-design.md),
  [ADR-0010](adr/0010-structured-selectable-asset-envelope.md)

## Scope and non-goals

This design freezes the common contract for user-selectable characters,
battlefield presets, and narration styles. It defines identity, immutable
generation contents, disclosure metadata, authoring attempts, compatibility,
selection, projection, activation, and battle binding.

It intentionally does not freeze the complete character, battlefield, or
narration definition schemas. Those belong to P2, P3, and P4. ADR-0010 accepts
this common direction, but database, endpoint, model-prompt, and UI work remains
gated by the accepted ADR for each asset-family implementation slice.

## Invariants

1. One stable logical asset ID owns zero or more immutable generations and at
   most one current-generation pointer.
2. A selectable generation contains both the validated structured definition
   and the validated derived public description.
3. The structured definition is authoritative. Public prose is never parsed to
   make battle, knowledge, perspective, or rendering-policy decisions.
4. Creating or upgrading an asset is the only normal operation that can move its
   current pointer. Selection and battle creation are read-only for selectable
   assets.
5. A generation is activated only when every required schema, disclosure,
   description, compiler, and digest validation succeeds.
6. Publication is determined by server projection code. An LLM never receives
   an audience policy and decides what it is allowed to reveal.
7. A battle binds exact immutable asset generations and compiler versions.
   Later edits or upgrades cannot change that battle.
8. Management visibility and battle eligibility are separate. An owner can
   manage an unsupported asset that no match path can select.

## Logical contracts

The names below are proposed shared contract names. Asset-specific schemas plug
typed values into their generic slots.

```ts
type SelectableAssetType =
  | "character"
  | "battlefield-preset"
  | "narration-style";

type DefinitionSchemaRef = {
  family: SelectableAssetType;
  version: number;
};

type CompilerRequirement = {
  consumer: string;       // stable registered consumer ID
  version: number;
};

type AssetGenerationEnvelopeV2<Definition> = {
  envelopeVersion: 2;
  definitionSchema: DefinitionSchemaRef;
  definition: Definition;
  disclosurePolicy: AssetDisclosurePolicyV1;
  publicPresentation: {
    description: string;
    projectionContractVersion: number;
    projectionDigest: string;
    descriptionInputDigest: string;
  };
  provenance: {
    sourceKind: "create_instruction" | "revision_instruction" |
      "upgrade_description" | "import";
    sourceDigest: string;
    attemptId: string;
    structureGeneratorContract: string;
    descriptionGeneratorContract: string;
  };
  compilerCompatibility: CompilerRequirement[];
};

type AssetGenerationRecordV2<Definition> = {
  assetType: SelectableAssetType;
  assetId: string;
  generationId: string;
  generation: number;
  envelope: AssetGenerationEnvelopeV2<Definition>;
  contentDigest: string;
  createdAt: string;
};
```

The actual generation ID remains server generated from the stable asset identity,
monotonic generation number, and canonical envelope digest. `contentDigest`
covers the canonical `envelope` value. Database-assigned generation identity and
clocks are record metadata outside that digest, avoiding a circular identity.

### Natural source privacy

The frozen source text is owner/internal authoring data. It is stored as a
restricted value on the authoring attempt, not returned in ordinary generation,
management, selection, or public DTOs. After the terminal attempt and its
idempotency/debug retention window expire, the raw text is redacted while its
digest, source kind, validation receipt, and generation linkage remain. The
immutable generation records only that bounded provenance, so source prose
cannot become a general runtime input.

The public-description stage is the only later authoring stage permitted to see
the frozen source text. It also receives the display-safe structured projection
and a strict output contract. Because source prose can itself mention restricted
facts, server validation must reject a description containing material factual
claims not supported by the display projection. The source may supply tone,
word choice, emphasis, and non-authoritative flavor; it is not an independent
publication allowlist.

P2-P4 must specify bounded validation for each asset family. A failed validation
keeps the attempt non-selectable and does not activate its candidate.

## Disclosure policy

Schema metadata assigns every authorable path one maximum disclosure class:

```ts
type DisclosureCeiling =
  | "required_public"
  | "public_eligible"
  | "restricted";
```

The ceiling is versioned with the definition schema, not authored freely on each
asset. Only `public_eligible` values can carry an instance policy:

```ts
type AssetDisclosurePolicyV1 = {
  version: 1;
  rules: Array<{
    valuePath: string;       // registered schema path, not an arbitrary JSONPath
    channel: ProjectionChannel;
    target: ProjectionTarget;
    prerequisites?: ProjectionPrerequisite[];
  }>;
};
```

Rules are allow-only and default-deny. They can narrow, but never widen, schema
metadata. Target-specific rules use stable logical IDs or registered relationship
roles, never display names. Element descriptions and expression notes inherit
the parent ceiling and consumer set, can be narrowed, and cannot override
structured mechanics.

## Projection context and compilers

Every projection call names its consumer and the facts that may affect access:

```ts
type ProjectionContextV1 = {
  version: 1;
  consumer: RegisteredAssetConsumer;
  channel: ProjectionChannel;
  subjectAssetId: string;
  target: ProjectionTarget;
  battleBinding?: {
    battleId: string;
    manifestGenerationIds: string[];
    perspective: string;
    knowledgeEvidenceIds: string[];
    observerId?: string;
  };
  budget: { maxItems: number; maxCharacters: number };
};
```

Projection is the intersection of four server-owned gates:

```text
schema ceiling
  AND value target/channel allowlist
  AND registered consumer contract
  AND runtime knowledge/self-awareness/perspective evidence
```

The result contains selected values, bounded descriptions, their stable source
paths, and a projection digest. It never contains policy instructions for a model
to interpret. The registered consumer controls which compiler is used. Initial
consumer families are:

- public profile/scene/style description;
- management detail;
- mechanics and world initialization;
- deep psyche;
- conscious character action/expression;
- observer-relative counterpart context;
- perspective-specific narrator context;
- phase-specific narration-style rendering policy.

Each compiler has a stable ID and version. A definition declares which compiler
versions it passed when activated; a selection request supplies the currently
required set. Descriptions are selected under the declared budget and retain
their element paths. Free-form concatenation of the whole asset is prohibited.

## Compatibility and management state

Compatibility is mutable operational state associated with the logical asset's
current pointer; it is not rewritten into an older immutable generation.

```ts
type AssetCompatibilityState =
  | {
      status: "unsupported";
      currentGenerationId: string | null;
      reasonCode: "legacy_shape" | "schema_unsupported" |
        "compiler_unsupported" | "missing_generation";
      canUpgrade: boolean;
    }
  | {
      status: "upgrading";
      currentGenerationId: string | null;
      attemptId: string;
      canUpgrade: false;
    }
  | {
      status: "upgrade_failed";
      currentGenerationId: string | null;
      attemptId: string;
      reasonCode: string;
      canUpgrade: true;
    }
  | {
      status: "ready";
      currentGenerationId: string;
      definitionSchema: DefinitionSchemaRef;
      compilerCompatibility: CompilerRequirement[];
      canUpgrade: false;
    };
```

`upgrade_failed` is the exact persisted status represented to owners as a failed
upgrade; generic `failed` is not used because ordinary initial creation has no
logical asset until activation succeeds. For a creation failure, the attempt is
visible in the creation workflow but no selectable asset is created.

These four states describe compatibility migration, not every authoring job. A
normal revision attempt against an already `ready` asset leaves the old current
generation ready and selectable until atomic activation succeeds. Its pending or
failed attempt is a separate management overlay. By contrast, a legacy/latest-
schema upgrade starts from an ineligible asset, so `upgrading` and
`upgrade_failed` remain ineligible as required.

Management DTOs expose the state, a safe reason label, and the player-facing
upgrade action when permitted. Selection DTOs do not expose ineligible objects
at all. Administrative diagnostics may additionally show schema/compiler
versions and internal reason codes.

## Authoring attempt state machine

One persisted attempt owns a frozen source, idempotency identity, target asset,
expected-current token, provider accounting, intermediate candidates, and error
receipt.

```ts
type AssetExpectedCurrentToken =
  | { generationId: string; contentDigest: string }
  | { generationId: null; legacySourceDigest: string }
  | { generationId: null; createReservation: string };
```

The legacy digest covers all mapped source fields and the displayed description,
so a concurrent legacy edit cannot be overwritten merely because it has no
generation ID.

```text
pending_structure
  -> generating_structure
  -> validating_structure
  -> generating_description
  -> validating_description
  -> committing
  -> succeeded

any pre-commit state -> failed
committing -> succeeded | failed
```

The attempt is terminal after `succeeded` or `failed`. A retry with the same
owner, scope, idempotency key, and request digest returns that attempt and never
starts another provider operation. A different request digest using the same key
is a conflict. A new key may retry a failed upgrade.

At most one nonterminal attempt may target a logical asset. Creation reserves a
new logical ID with its attempt but does not expose the asset to management or
selection until success. Upgrade records the current generation ID and digest as
`expectedCurrentToken` before the first provider call.

Provider timeouts and validation failures are explicit terminal receipts. There
is no attempt state that makes a partially generated definition current.

## Logical command and query boundary

Family-specific HTTP paths may remain for UI clarity, but they invoke these
shared commands. `Idempotency-Key` is mandatory on both start commands.

```ts
type StartAssetCreation = {
  assetType: SelectableAssetType;
  source: string;
};

type StartAssetUpgrade = {
  assetType: SelectableAssetType;
  assetId: string;
  expectedCurrent: AssetExpectedCurrentToken;
};

type AssetAuthoringAccepted = {
  attemptId: string;
  status: AssetAuthoringAttemptStatus;
  assetId: string;
};
```

Start returns the existing attempt for an identical idempotency identity or
accepts exactly one attempt for asynchronous/synchronous execution. Attempt
status is owner-readable by `attemptId`; it exposes safe stage, terminal result,
validation labels, and activated generation ID, but not provider chain-of-thought
or restricted values in a public DTO.

Management collection/detail queries return the public/owner projection plus
`AssetCompatibilityState`. Selection collection queries accept the registered
battle compiler requirement set on the server (not from an untrusted client)
and return only ready public cards with their logical ID and opaque selection
token. Battle creation resolves that token/ID again and never trusts readiness
asserted by a client.

Transport maps validation to 422, idempotency/request-digest conflict and stale
current token to 409, inaccessible assets to the existing non-disclosing 404
surface, and provider unavailability to a retryable safe error without moving
the pointer. The exact family route names are fixed in P2-P4 alongside their UI
cutovers; these command semantics cannot diverge by family.

## Atomic activation

Activation uses this transaction:

1. acquire the per-asset database lock;
2. re-read the current pointer and compatibility state;
3. compare them to the attempt's expected-current token (or verify no current
   pointer for creation);
4. validate the final envelope and recompute all canonical digests;
5. append exactly one immutable generation;
6. move the current pointer to that generation;
7. set compatibility to `ready` and mark the attempt `succeeded`;
8. update any temporary legacy read-model row in the same transaction.

Pointer drift produces a terminal conflict and activates nothing. An envelope
with an existing attempt ID returns the recorded successful generation. The
repository API must therefore separate candidate construction from `append` and
`activate`; the existing write-and-activate helper cannot remain the battle
binding interface.

No external model call runs while holding the database transaction or asset
lock.

## Create and explicit upgrade

Both operations use the accepted common workflow:

```text
frozen natural source
  -> typed structure generation
  -> deterministic validation/normalization
  -> display projection
  -> public description generation
  -> factual-support and output validation
  -> atomic immutable activation
```

Create uses the owner's natural instruction. Upgrade uses the current displayed
description as the primary natural source and may add only explicitly defined,
deterministic mappings of separately stored legacy values. It must not infer a
missing fact and claim that the legacy asset always contained it.

There is no automatic upgrade during login, list, selection, random matching, or
battle creation. The owner/operator invokes the asset-specific latest-version
action. The UI label may remain `このキャラを最新版に更新`; the API records the
exact target schema and compiler contracts.

## Management, selection, and battle creation

Management and selection use different repository/API contracts:

| Operation | Includes unsupported | May move current pointer | Required check |
| --- | ---: | ---: | --- |
| Owner management/detail | yes | no | ownership/access |
| Explicit create/upgrade activation | target only | yes | attempt ownership, validation, expected-current token |
| Player selector/search | no | no | access + `ready` + required compilers |
| Opponent/random pool | no | no | access/visibility + `ready` + required compilers |
| Battle create by direct ID | no | no | repeat access + `ready` + required compilers |

Battle creation resolves every selectable asset to its exact ready current
generation, compiles the required battle snapshots from that envelope, and
records generation IDs, content/projection digests, and compiler versions in the
battle manifest. It does not call selectable-asset append or activation APIs.

An explicitly named inaccessible or incompatible asset fails with a typed
`ASSET_NOT_SELECTABLE` result whose private diagnostic distinguishes not found,
access denied, unsupported schema, and unsupported compiler without leaking
existence across accounts. If a narration style is omitted, the server may choose
an eligible default; if a style ID was supplied, it cannot silently substitute
another style.

Battle-owned concretization remains allowed:

- a ready battlefield-preset generation is bound read-only;
- its versioned compiler creates a concrete battlefield instance;
- that instance is saved as a battle-owned immutable generation and embedded in
  the manifest;
- it never becomes or moves the preset's current generation.

## Editing model

After cutover, direct mutation of activated structured fields, public prose, or a
raw narration prompt is not an authoring operation. Natural-language adjustment
starts a new authoring attempt against the current generation and repeats
structure, projection, and description stages. A later structured editor may be
designed, but it must still validate a complete new definition and regenerate
the derived public description before activation.

This means the current narration-style `instruction` becomes compiler output or
an internal compiled artifact, not an externally authoritative field. The
displayed style description remains presentation only.

## Pre-public migration and cutover

Legacy current rows are classified `unsupported` unless they already contain a
complete validated version-2 envelope and required compiler set. They remain
manageable and can be deleted or explicitly upgraded, but are absent from every
battle-selection path.

There is no permanent legacy selection runtime and no eager bulk inference. Seed
and system assets must be rebuilt or deterministically imported through the same
activation contract before integrated cutover. Existing battles retain their
version-1 manifests and embedded snapshots; they are not rebound.

The temporary mutable `characters`, `battlefields`, and `narration_styles` rows
may remain as read models during P2-P4, but the activated envelope/current pointer
is authoritative for eligibility and new battle binding. P5 removes or freezes
the remaining direct-write paths before public launch.

## Required verification after acceptance

- creation calls structure before description and never activates a partial;
- description generation sees only the frozen source plus display projection,
  and unsupported material claims fail closed;
- same idempotency key never duplicates provider operations or generations;
- concurrent edit/upgrade pointer drift activates neither stale result;
- unsupported/upgrading/upgrade-failed assets appear in management but not in
  any selector, search, matchmaking, random pool, or direct battle creation;
- two targets receive different valid projections when policy permits, while a
  restricted field never crosses its ceiling;
- conscious character input never receives raw latent state; narrator input
  obeys perspective; opponent input requires observation/knowledge evidence;
- battle creation performs zero selectable-asset generation writes and binds
  the exact generations checked for readiness;
- editing an asset after battle creation leaves retry, resume, narration, and
  replay inputs byte-stable;
- system seeds and pre-public user assets cannot bypass activation readiness;
- failure diagnostics are owner-safe and provider/accounting receipts remain
  auditable without exposing private source in public DTOs.

## Accepted boundary and next gate

ADR-0010 closes the P1 design milestone and authorizes this common direction.
The first persistence/API/binding implementation is scheduled inside the P2
character slice so it has a real typed consumer; P2 still requires its own
accepted character-schema ADR before implementation. This decision does not
pre-accept any asset-family field schema.
