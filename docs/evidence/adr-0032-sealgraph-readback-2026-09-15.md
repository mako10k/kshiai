# ADR-0032 acceptance Sealgraph readback

- Date: 2026-09-15
- CLI: `sealgraph 0.1.0-dev`
- Store: retained worktree-local format-5 `.sealgraph`
- Authority boundary: source ADRs and LLMThink audits remain authoritative; Sealgraph
  records immutable material, Cause Links, revision assertions and stale review state.

## Before mutation

`sealgraph impact --all-paths acceptance/adr-0031 --format json` resolved the prior
ADR-0031 acceptance Seal
`1d185fac50117ae5f5806094cd8ee5f9fe13b4ac04c106527f20ecb4bc641b68`
and reported 47 impacted current refs. The set included the implementation design,
design acceptance, ADR index, migration plan, implementation slices and verification
records. This is structural reachability, not a conclusion that all 47 files need edits.

## Recorded revision chain

- `acceptance/adr-0031`:
  `fbc10a6010b6b0b050bf5ff6f9d2edf38a93ad75454bf138f848316d53161c23`
- `review/adr-0032`:
  `e255fe91831529317bef260c8a3c3451835af070f9e6b5578323aa7bdab2a788`
- `acceptance/adr-0032`:
  `af8a8e79b5287a4b969621c772cbe7d38c3fe912ec052ca99b26dca87eb6456f`
- `verification/adr-0032-design-consistency`:
  `5e4e9fdc7bf1e3afc633156ba90f896d9a60e0827ae02c891a8053791297514c`
- `projection/adr-0032`:
  `e465c2adceb019c4d3bf43b32be75c25bd035f4eeba011e779c3574b88146065`
- `index/adr`:
  `378f2c4bbd4fa85004a26263618b6a64a4149c6c3bc6f3d7440bd2a9d1c77b61`
- `plan/character-semantic-migration`:
  `a10046dc6b998819c754b465eb96571b6c8d4d6b76155ae80bfc9813f981d556`

Each listed ref had no remaining candidate and its bound source matched the current
workfile after sealing. The ADR-0032 review and acceptance refs were clean after the
ADR-0031 old-to-new revision assertion was recorded.

## Stale disposition

The post-change frontier contained five refs. The relevant intentional frontier is
`design/structured-semantic-authoring-kernel-v1`: it still targets the former ADR-0031
acceptance Seal and is correctly retained as stale because its time-policy clauses are
not consistent with accepted ADR-0032. The consistency verification intentionally
retains this path as evidence rather than resealing the unchanged design as conforming.

Other frontier entries were historical or previously stale records:
`evidence/adr-0031-acceptance`, `projection/adr-0031-ja-accepted`,
`reasoning/adr-0030-b5-action-plan`, and
`verification/semantic-authoring-kernel-slice5-integration-review-2026-09-12`.
They were not automatically relinked or resealed.

The migration plan also retains a direct stale target Seal
`2d6de55ffe0ee42e057d538450e140a794dac52f70d341c75169a41baefbbe17`
with no current REF. This predates the ADR-0032 acceptance and was not rewritten in
this bounded change.

## Integrity readback

`sealgraph fsck --format json` returned `result: ok` with 2,618 blobs, 837 Seals,
508 materials, 765 provenances, 354 refs and 638 active Seals. A clean fsck proves
store integrity, not semantic consistency or owner acceptance.
