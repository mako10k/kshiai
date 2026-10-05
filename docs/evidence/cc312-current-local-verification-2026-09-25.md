# cc312 current local verification — 2026-09-25

## Scope and result

PERT task `cc312` extends the verified focused character path to V2-to-V3
migration. The current implementation already routes an exact ready V2 source
through `POST /api/characters/:id/upgrade`, the durable worker, common semantic
authoring kernel, bounded character V3 migration adapter, persistence, and
owner review. No feature-code or Seal change was required for this task.

The current implementation and verification authority is:

- `implementation/character-focused-migration-route-capability-freeze-20260925`
  (`e1a72ab3792b59fc9c09b8709b0a9afffb6edaae576bc2faa123c8ea05193826`)
- `implementation/character-focused-migration-capability-contract-20260925`
  (`5be02d342e25be4ee9d95f09566508af272c6a9f8fa6bfbbb7fa0e1296b6832a`)
- `implementation/character-v3-migrate-adapter-slice-current-20260918`
  (`822a40242c36b5f5ec247d83000bbca8c0b87a67ba2ffeea34d2e8d819cf5141`)
- `verification/character-focused-migration-route-current-20260925`
  (`0669e240682f08392d6aafc6cbf93aebe21c62ecd87cc204984a4cbdc82d4b22`)
- `verification/character-v3-migrate-preservation-bound-current-20260925`
  (`e4afab6edcf241f8446fe488bf67331cd200691c4103401ae3d501a4f09ca48c`)

All listed REFs are non-draft, non-stale, and clean. The verification sources
match their sealed heads.

## Observed migration behavior

The controlled HTTP test freezes exactly the `battle-mechanics@3` capability
set, retains the exact V2 source, runs focused migration work, resolves required
obligations, and persists a strict V3 candidate for owner review. Restricted
original values are omitted from the review response. The source generation
remains current and the candidate remains non-current. Optional registered
legacy meaning may defer; unregistered deferral and over-256-KiB pending
preservation are rejected.

The provider is local test infrastructure. No paid or external provider was
called.

## Verification

- Focused owner-route and worker tests: 9 passed, 0 failed.
- Character V3 adapter tests: 18 passed, 0 failed.
- Seal-based inventory: passed.
- SealGraph fsck: `result=ok`, no unreferenced blobs.

## Forward measurement

- Start: `2026-09-25T20:09:30+09:00`, planned value `1p`.
- Finish: `2026-09-25T20:12:28+09:00`.
- Active time: `89/1800h` (178 seconds).
- Effort: `89/1800ph`.
- This task sample is approximately `20.225p` per active hour. It records only
  the current verification and closure work; it is not a reconstruction of
  earlier implementation work.

## Boundary

This evidence does not accept the migration candidate, append a V3 generation,
move a current pointer, call a paid provider, deploy, or activate policy. It
covers only the local `cc312` migration-path extension.
