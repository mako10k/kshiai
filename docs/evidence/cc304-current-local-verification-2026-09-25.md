# cc304 current local verification — 2026-09-25

## Scope and result

This record closes the implementation work of PERT task `cc304` against
`origin/main` revision `c526972d289d46146b02d37a31d15e35efcccc80`.
The existing implementation carries one clear Japanese appearance revision
request through the normal owner HTTP command, provider-assisted bounded scope
resolution, durable worker, common kernel, character V3 adapter, persistence,
and owner-visible semantic diff. The resulting candidate remains non-current.

No feature-code change was required in this closure slice. The required route,
scope resolver, adapter, worker path, and regression were already present on the
target revision. The missing current evidence was repaired by binding the exact
sources to current, non-draft, non-stale Seals:

- `implementation/character-revision-scope-current-20260925`
  (`3876d51b894a8abba151da704d76efb5c092c1dddb2e609b5ef9d4a45bbd9986`)
- `implementation/character-v3-adapter-current-20260925`
  (`bfa742a7c40087467d93bc881794b8852173975eeddb9292fa0694fd495c4307`)
- `implementation/cc304-focused-revise-route-current-20260925`
  (`714fcabc08db2375c192b3e46b9a8c842897f7eeb63401d9bb0295e3f195cecf`)
- `verification/character-focused-authoring-current-20260925`
  (`9e4037b7ff12bb1a42d202cf279ee69c8875250df1f53b3a013061bfa5f15dc0`)

The verification Seal also preserves the already-current CS316 migration
Causes exercised by the same test file. The test-authority inventory now maps
that file to the combined current verification REF. The revised
`implementation/test-authority-inventory-v2` head is
`8903c34cd976b58afc723ba9f12dbdaab921930293c71ecfb72a8c00841de1e5`;
its bound source matches the sealed head.

## Observed behavior

The controlled loopback test entered through
`POST /api/characters/:id/chat` with `外套を青に変更`. It observed one
server-validated `appearance` scope, counted the scope request in the same
attempt, retained the frozen scope before generation, repaired one invalid
provider response, changed only the appearance claim, exposed the old and new
appearance values in owner review, and left the current generation and pointer
unchanged. Ambiguous, multi-area, and invalid scope responses produced no
candidate.

The loopback provider is local test infrastructure. No paid or external
provider was called.

## Verification

- Direct focused-authoring test: 9 passed, 0 failed.
- Seal-based inventory: `character-focused-authoring.test.ts` is
  `active` with reason `current`.
- Current-authority unit suite: 112 passed, 0 failed
  (90 backend, 13 shared, 9 selector tests).
- `npm run typecheck`: passed.
- `npm run build`: passed; Vite retained its existing large-chunk warning.
- `sealgraph fsck --format json`: `result=ok`.
- `perttool document check docs/character-semantic-migration.pert`: `ok=true`
  after task closure, with existing reached-milestone advance warnings.
- `llmthink dsl audit /tmp/cc304-execution-decision.think`: fatal 0, error 0,
  warning 0.
- `npm run adr:check`: ADR-0035 audited clean, but the repository-wide command
  remains non-zero on pre-existing legacy DSL failures in ADR-0015, ADR-0016,
  ADR-0017, and ADR-0019. No ADR file changed in this slice.

## Boundary and remaining owner gate

This is local implementation and verification evidence. It does not accept the
candidate, move a current pointer, call a paid provider, deploy, enable the
trial in the ordinary runtime, or establish user acceptance. Milestone
criterion `CS_REVISE_SCOPE/NATURAL_SCOPE` remains an owner-evidence gate after
the `cc304` implementation task is marked done.
