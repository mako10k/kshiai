# Architecture Decision Records

This directory contains durable records of architectural and product-rule decisions. ADRs explain why a direction was selected; plans and PERT documents explain how and when it will be delivered.

## Lifecycle

1. Copy `template.md` to the next zero-padded number and a short kebab-case title.
2. Keep the ADR `Proposed` while alternatives or authority are unresolved.
3. Change it to `Accepted` only when the named decision owner approves the decision.
4. Link implementation commits and verification evidence without rewriting the original rationale.
5. Replace an accepted decision with a new ADR, then mark the old ADR `Superseded` and link both records.

## Index

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-turn-initiative-and-simultaneous-resolution.md) | Accepted | Ordinary turns are sequential; equal initiative reuses prior order or performs one persisted draw |
| [0002](0002-separate-advance-and-narration-apis.md) | Accepted | Advance commits gameplay and creates an independent asynchronous narration job |
| [0003](0003-revision-editable-assets-and-bind-battles.md) | Accepted | Battles bind immutable revisions of every editable source asset |
| [0004](0004-versioned-lightweight-psyche-dynamics.md) | Accepted | Private psyche uses explicit parameters first, then a bounded lightweight neural dynamics model conditioned only on psyche-trait embeddings |
| [0005](0005-battle-scoped-ordered-narration-stream.md) | Superseded | Battle-scoped ordered narration stream with reconnectable delivery |
| [0006](0006-terminal-snapshot-narration-delivery.md) | Accepted | Terminal-snapshot narration delivery with durable phase receipts and fenced workers |
| [0007](0007-provider-operation-ledger-and-observation-ceilings.md) | Accepted | Durable physical provider-attempt accounting and observation ceilings |
| [0008](0008-battle-private-character-focus-state.md) | Accepted | Battle-private character focus state selected from perceived deltas and modulated by existing focus bands |
| [0009](0009-separate-adjudication-from-judgment-presentation.md) | Accepted | Adjudication commits mechanically; judgment presentation is a derived read model |
| [0010](0010-structured-selectable-asset-envelope.md) | Accepted | Selectable assets share one immutable envelope and persisted authoring attempts |
| [0011](0011-structured-character-definition.md) | Accepted | Character truth is a structured definition with derived audience projections |
| [0012](0012-structured-battlefield-definition.md) | Accepted | Battlefield presets, compiled instances, and live world state stay separate |
| [0013](0013-structured-narration-definition.md) | Accepted | Narration styles compile into phase-specific policy |
| [0014](0014-queue-asset-authoring.md) | Accepted | Queue asset authoring; accept on dedicated review screens |
