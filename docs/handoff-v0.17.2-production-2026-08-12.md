# v0.17.2 production handoff — 2026-08-12

## Current state

- Release PR #104 merged to `main` as
  `a9f93a775053a99619bf01c1c573a79c53ee6406`.
- Annotated tag `v0.17.2` resolves to that exact commit and is pushed.
- Required CI on the release commit passed.
- Narration Cloud Tasks queue `kshiai-narration` is `RUNNING` as explicitly
  requested. It had zero Cloud Tasks before resume.
- Production remains on `kshiai-api-00085-juz` (`release-v0-17-1`) at 100%.
- Stage created no-traffic revision `kshiai-api-00087-vek`
  (`release-v0-17-2`), but Stage did not complete and production was not
  promoted.

## Stage evidence and blocker

- Initial Stage run `31599155911` stopped before cloud changes because the
  squash-main `validate` check had not yet become visible. The subsequent main
  CI run `31599091153` passed.
- Second Stage run `31599232543` correctly stopped because the queue was still
  paused.
- After confirming the queue contained zero tasks, it was resumed.
- Third Stage run `31599360284` built the backend image, applied migrations,
  and created revision `kshiai-api-00087-vek`, then failed at the new LLM-free
  lifecycle fixture.
- Root cause is deterministic and local to the workflow: the Stage runner calls
  the backend test before building `@kshiai/shared`, so imports of
  `node_modules/@kshiai/shared/dist/index.js` fail with
  `ERR_MODULE_NOT_FOUND`. No provider or LLM call occurred in this fixture.
- Because Stage did not produce a verified Worker version, protected Promote
  was not dispatched. Do not bypass this gate or promote the backend revision
  alone.

## Exact restart order

1. From current `main`, change the Stage fixture step to build shared first,
   then run only the exact narration receipt test. Validate the workflow test.
2. Release that workflow correction as a new immutable patch version; do not
   move `v0.17.2`.
3. Run Stage with `narration_guarded`, projection override `none`, and
   `candidate-12-v2`.
4. On Stage success, dispatch protected Promote using the exact staged Cloud
   Run revision and Worker version and confirmation `DEPLOY <new-tag>`.
5. Read back 100% Cloud Run traffic, Worker version, health, release record,
   and queue state. Do not run a new observation battle in this handoff scope.

## Local validation already completed

- `npm run typecheck` passed.
- `npm run build` passed with only the existing Vite chunk-size warning.
- `npm test` passed: shared 215, backend 180, frontend 15, deployment 3.

## Scope conclusion

Queue resume is complete. Production deployment is not complete because the
protected Stage acceptance failed before Worker creation; bypassing it would
ship mismatched backend and frontend artifacts.
