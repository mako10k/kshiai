# Architecture Decision Records

This directory contains durable records of architectural and product-rule decisions. ADRs explain why a direction was selected; plans and PERT documents explain how and when it will be delivered.

## Authority

- ADR-0001 through ADR-0014 retain their historical Markdown authority until an
  accepted migration ADR says otherwise.
- ADR-0015 and later use a same-basename pair. The `.think` file is the
  authoritative causal and decision record; `.md` is its human-readable
  projection. Correct disagreements in favor of `.think`.
- sealgraph state and reports are disposable advisory caches. They are rebuilt
  from `.think` and referenced original artifacts and never become an authority.

## Lifecycle

1. Copy both `template.think` and `template.md` to the next zero-padded number and
   the same short kebab-case title.
2. Keep the ADR `Proposed` while alternatives or authority are unresolved.
3. Change it to `Accepted` only after the named owner explicitly approves the
   exact ADR and revision. Record that instruction as `OWNER_ACCEPTANCE` evidence
   and derive an `ACCEPTANCE` decision in `.think`; mirror the status in Markdown.
4. Run `npm run adr:check`. Its LLMTHINK audit is mandatory for the ADR workflow.
5. Optionally run `npm run adr:check:sealgraph -- docs/adr/NNNN-title.think`.
   This always reconstructs an isolated graph, prints advisory results, and
   discards its storage. A missing or incompatible sealgraph does not alter or
   block the canonical workflow.
6. Link implementation commits and verification evidence without rewriting the
   original rationale.
7. Replace an accepted decision with a new ADR, then mark the old ADR
   `Superseded` and link both records.

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
| [0015](0015-llmthink-canonical-adrs-and-advisory-sealgraph.md) | Accepted | Make LLMTHINK authoritative for future ADRs and use sealgraph only as a reconstructable advisory projection |
