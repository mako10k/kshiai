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
