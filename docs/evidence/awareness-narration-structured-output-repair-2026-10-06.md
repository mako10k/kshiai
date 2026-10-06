# Narration structured output conformance after rc.10

Date:2026-10-06. PERT:awareness-public-deploy. Public completion remains planned.

## Verified observation

- [Stage37411570366](https://github.com/mako10k/kshiai/actions/runs/37411570366), main `6e4922976312fc0e846122d59912e6c99bc0d897`; immutable `v0.23.0-rc.10` object `2e05c958a3c67adfc19e2c4193bd97a3d60029b1`.
- Revision `kshiai-api-00175-did` Ready; image `asia-northeast1-docker.pkg.dev/kshiai/kshiai/backend@sha256:484a4bdd1186a63430247c19a8511884fd21ae50b2cd32c411585fc4e7151dd1`. Public traffic remained100% `kshiai-api-speech-9ce565d`; no Promote.
- All boot, migration, durable narration, usage accounting, OIDC tasks, Worker/edge, auth and SSE checks passed. Observer `kshiai-persistent-e2e-cvvv2` failed04:11:44Z with `Awareness public completion requires successful narration for every receipt`.
- Exact battle `btl_98ca7fc420b939fcbe4f080edf62487b` runtime terminal, tick34, incompleteReason null. The wider38 observation allowance allowed normal terminal progress, but successful narration was not achieved.
- Narration:14 completed entries;2 failed in one batch with `receipts[1].narrator` minimum2 violation;20 subsequent failures `awareness_narration_incomplete`. Earlier progress sample had18 subsequent failures.28 prephysical budget-lease-busy deferrals recovered; no pending head remained. This supports the delivery-generation repair, not full completion.
- All117 SDK records completed; none started remained. Every reported total is known; all14 narration responses reported finishReason stop. Raw generated prose was not retained. A completed SDK row indicates physical response completion, not application-schema acceptance.

| Role | Calls | Input tokens | Output tokens | Reported total tokens |
|---|---:|---:|---:|---:|
| creation |1|1467|159|2642|
| conscious |19|87061|5914|115586|
| subconscious |70|407706|18915|426621|
| narration |14|123724|4559|128283|
| adjudication |13|100626|717|106152|

SDK-reported total779284. Provider categories may differ; retain reported totals rather than inventing their decomposition. Cost remains unknown without pricing. Readback used verified CA, explicit BEGIN READ ONLY and rollback; no battle/queue data was changed.

## Cause boundary and selected repair

Direct producing condition: a combat receipt's narrator array violated its cardinality. Batch rejection detected this and prevented partial publication. The provider's reason for producing it remains unknown. The current prompt already states2–4 nonempty strings per combat receipt and supplies a two-line example; missing guidance is not established.

The JSON-object request constrains JSON syntax rather than the full DTO. Use the existing provider's strict structured response for the same accepted schema, retaining server validation of identity, order, speech text and recognition sources. Independent authority review found no Accepted fixed-json_object requirement; ADR0055/0056 require the current validated DTO. [Existing prompt inspection's bounded design](../battle-awareness-prompt-inspection-2026-10-05.md) now records this compatibility work.

Current review: typed response-format union, one authoritative Zod receipt shape, generated all-phase grammar, exact phase/batch size, unchanged admission digest/accounting and one SDK call. Successor: actual model acceptance, immutable Stage and fresh public normal completion. Repeated unchanged paid observations, extra repair/retry calls, invented narrator lines, DTO relaxation or changes to budgets/policy/model are excluded from this repair.

[CLI reasoning](awareness-narration-structured-output-repair-2026-10-06.think), including final readback, audited fatal0/error0/warning0. Implementation uses the existing SDK Zod helper without a new dependency. The generated format is a validated plain typed strict-schema option; no type escapes were added. Caller-side narration admission is distinct from the adjudication-only ALS guard and is tested on the exact request forwarded to the SDK.

Independent final implementation review found no INSIDE findings. Local full build/workspace-and-deployment typecheck/static checks passed; governed suite201/201; required awareness303 tests,301 passed,2 explicit native-PostgreSQL skips,0 failed; related direct tests28/28. CI with actual PostgreSQL, model schema acceptance, Stage and public normal completion remain subsequent gates. Existing prompt content and output-v1 remain unchanged; the provider wire constraint implements that same contract.
