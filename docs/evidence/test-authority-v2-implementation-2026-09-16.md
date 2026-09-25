# Test authority v2 implementation evidence — 2026-09-16

## Scope and authority

- Governing decision: Accepted ADR-0034, `acceptance/adr-0034` at Seal `5e0e2c6339e1aa17306f57963d3f32437cec1a22903e129ece02cc90bffe368a`.
- Authorized implementation: enforce Seal-based current test selection, update delivery plan revision 8, and verify that bounded slice.
- Excluded: resume `cc304`, implement the focused revise path, bulk reseal old tests, run paid providers, deploy, commit, or push.

## Implemented selector

`scripts/test-authority.mjs` now disables a discovered test unless all of the following hold:

1. the test is mapped to a verification REF;
2. the REF resolves to a head Seal;
3. that Seal has at least one explicit Cause Link;
4. the bound source path is the discovered test path;
5. the workfile exactly matches the sealed source; and
6. the verification is neither directly nor transitively stale.

The inventory and selection output use schema v2. Unmapped tests are reported as `unsealed` and disabled, rather than executed as ungoverned tests.

## Seal chain for this selector

- Selector implementation: `implementation/test-authority-selector-v2` at `ddac6d91a3948f9a51433f53f9f88603aa5792133dfb42ba99157ed71121a8cc`.
- Inventory implementation: `implementation/test-authority-inventory-v2` at `c110daddffb613da6e3307f388a0e30648e78c376a36d6c031cb93a93b2d666f`.
- Selector verification: `verification/test-authority-selector-v2` at `2a8040407b12cc9c36bd604cc2bfd3088e01c70081f425ae36b50e0451c70a51`.
- The verification Seal has both implementation Seals as Causes, matches `scripts/test-authority.test.mjs`, and was observed non-draft and non-stale.

## Current selection readback

Unit/deployment/release discovery:

- discovered: 156
- active: 4
- disabled: 152
- mapped to a verification REF: 20
- unsealed: 136
- disabled because stale: 13
- disabled because source-diverged: 3

The four current test files are:

- `backend/src/llm/character-definition-response-schema.test.ts`
- `backend/src/llm/character-migration-ollama-provider.test.ts`
- `backend/src/repositories/character-semantic-migration.test.ts`
- `scripts/test-authority.test.mjs`

E2E discovery found two files: one stale and one unsealed. Both are disabled, so no E2E test was run.

`npm test` ran only the four current files. The three TypeScript files passed 13 tests, and the selector file passed 5 tests. This is evidence for those exact current Seals and Causes, not full-repository coverage.

## Delivery plan readback

- Revision 8 was accepted and recorded in `docs/character-semantic-migration-plan-revision-8-proposal.md` and `docs/character-semantic-migration.pert`.
- `cc310` is done.
- `cc304` remains suspended; no resume event was added.
- The functional sequence is `cc304` focused revise, then `cc311` create, `cc312` migration, and `cc313` remaining recovery/owner interaction.
- `perttool document check` passed with 35 milestones, 32 tasks, and 6 gates. Reported milestone-closure and missing-acceptance-criterion warnings predate this bounded change and remain unresolved.
- The refreshed plan Seal is `plan/character-semantic-migration` at `f693229312588a8caebb7e8b70e26fb0c01e048b81d40b95e78d648d9a581d31`; its source matches the PERT file.
- The plan remains deliberately `DRAFT` and `STALE_DIRECT` because an existing direct Cause target, `2d6de55ffe0ee42e057d538450e140a794dac52f70d341c75169a41baefbbe17`, has progressed. This slice did not repair or conceal that older provenance issue.

## Other verification and limits

- `node --check scripts/test-authority.mjs`: passed.
- `git diff --check`: passed.
- `sealgraph fsck --format json`: `result=ok`.
- Repository-wide `npm run adr:check` still reports pre-existing malformed/acceptance issues in ADR-0015 through ADR-0017 and ADR-0019; ADR-0034 itself was checked separately and accepted.
- Existing unsealed revision-scope/Ollama WIP remains preserved but supplies no current test evidence.
- No commit, push, paid provider call, deployment, candidate acceptance, or `cc304` functional implementation was performed.
