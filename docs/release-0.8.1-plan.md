# Release 0.8.1 plan — persistent E2E authentication hotfix

Date: 2026-08-07
Target: `v0.8.1`

## Scope

Release one bounded correction discovered by the first production observation:

1. generate a strong 44-byte rotating password instead of the rejected 81-byte
   value;
2. retain and reuse the dedicated authentication identities and application
   fixtures without cleanup; and
3. rerun the same revision-bound cross-account observation through completion.

## Evidence before release

- Observation run 31151432357 passed tag, required-check, guarded-mode,
  administrator, image-digest, and active-revision binding before its Cloud Run
  Job failed.
- Execution `kshiai-persistent-e2e-6njlq` returned
  `Supabase admin create failed: 500 unexpected_failure` and created no
  application account or fixture.
- The fixed observer email succeeded with the same request at 44 bytes, and its
  authentication identity is intentionally retained.
- Focused backend tests, full tests, typecheck, and build pass with the bound and
  its regression test.

## Release gates

- [ ] Release PR passes `validate`, `security`, `backend-image`, and `worker`.
- [ ] The release PR merges to `main`, and annotated `v0.8.1` resolves to that
  exact merge commit.
- [ ] Stage creates a digest-pinned no-traffic revision with guarded narration
  and `ADMIN_EMAILS=mako10k@mk10.org`, then passes all smokes.
- [ ] Promote sends 100% traffic to that exact revision and Worker and publishes
  the GitHub Release.
- [ ] The protected observer completes one cross-account battle and retains the
  accounts, fixed assets, battle, and sanitized artifact.

## Operational boundary

- No schema or data migration is required.
- No account, character, battlefield, narrator, battle, or rating is deleted.
- Production stays on `v0.8.0` until the protected Promote workflow verifies
  the exact staged `v0.8.1` artifacts.
