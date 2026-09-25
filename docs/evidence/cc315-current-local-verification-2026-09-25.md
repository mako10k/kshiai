# CC315 current local verification (2026-09-25)

## Scope

This evidence closes the local-readiness scope of `cc315`. It verifies that one
exact immutable V2 character generation can travel through the real local owner
HTTP upgrade route and worker, produce a strict V3 migration candidate, expose
that candidate for owner review, and be accepted and selected from a
Stage-shaped pointer in an isolated test database.

The acceptance transition is guarded by
`enableCharacterMigrationAcceptanceTrial`. The option defaults to `false` and
is not enabled by the normal backend entrypoint. Without it, review returns
`canAccept: false` with
`FOCUSED_CHARACTER_MIGRATION_ACTIVATION_DISABLED`, and confirm rejects before a
V3 generation is appended or the pointer is moved.

## Observed result

- The worker bound the exact V2 generation ID and digest and produced a strict
  V3 candidate with the required consumer set limited to `battle-mechanics@3`.
- The local trial owner review exposed the candidate without disclosing the
  frozen restricted source values.
- Local trial confirmation appended one immutable V3 generation and moved the
  isolated character pointer with compare-and-swap semantics.
- Loading that selected generation with the real generation reader returned a
  ready V3 envelope whose compiler compatibility is exactly the frozen
  `battle-mechanics@3` capability set.
- The historical V2 generation remained addressable with its original content
  digest.
- Candidate digest tampering was rejected without a V3 append or pointer move.
- Concurrent pointer drift rejected confirmation and rolled back the attempted
  V3 append.
- The ordinary runtime path, which omits the local trial option, rejected the
  transition and left the V2 pointer unchanged.

## Verification

- `node --import tsx --test backend/src/services/character-focused-authoring.test.ts`
  — 11 passed, 0 failed.
- `node --import tsx --test backend/src/repositories/character-assets-v2.test.ts backend/src/routes-structured-character-acceptance.test.ts backend/src/repositories/character-generation-reader.test.ts backend/src/services/semantic-authoring/adapters/character-v3.test.ts`
  — 42 passed, 0 failed.
- `npm run typecheck` — passed for shared, backend, frontend, and deployment.
- Independent read-only review — the normal-runtime mutation boundary finding
  was resolved; no remaining P0-P2 finding.

## Provenance

- Implementation Seal:
  `implementation/cc315-focused-v3-migration-acceptance-20260925`
  (`a6f996d4e1244368efa23ec3480178552f7cb9c4210f77b287847848605cdc94`).
- Verification Seal:
  `verification/character-focused-authoring-current-20260925`
  (`9bdcf9a80b0a061c3a99fdcc149b7d23b4b83d222db6ae3548c4d4740612209e`).
- Implementation commits: `8431cf1`, `4b7022d`.

## Boundary

No paid provider was called. No Stage or production deployment, data migration,
external pointer write, release, or product acceptance occurred. An actual
Stage candidate review and Stage identity/pointer decision remain downstream
work.
