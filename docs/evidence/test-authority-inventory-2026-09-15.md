# Structured authoring test authority inventory — 2026-09-15

## Scope and authority

This inventory covers the 20 existing test files for the common structured-authoring
kernel and character semantic migration selected from the accepted implementation
design and successor plan. It does not claim that the other repository tests are
semantically governed by this inventory.

Each scoped test maps to one `verification/*` REF in
`scripts/test-authority-inventory.json`. The verification Seal is downstream of its
governing design and/or implementation Seal. A test result never changes those Causes.

## Baseline

- Repository test files before this control: 155 total: backend 92, shared 52,
  frontend 6, e2e 2, release scripts 2, deployment 1.
- Scoped files: 20.
- Directly source-bound before inventory: 9.
- Existing named verification REFs without source bindings: 7.
- Missing verification REFs: 4.
- Existing root `npm test` and `test:e2e-gui` scripts did not consult SealGraph.

## Applied inventory

All 20 scoped files now have one manifest mapping and a source-bound verification REF.
The seven existing unbound REFs retained their prior Cause Links. Four new draft REFs
link to accepted structured-authoring design revision six and the nearest existing
implementation Seal. Changed test content was recorded only as draft verification;
it does not assert conformance or acceptance.

The execution selector disables a governed test before execution when:

1. its verification REF is absent;
2. its source binding is absent or points elsewhere;
3. the workfile differs from the sealed test content; or
4. the verification REF is direct or transitively stale.

Unmapped tests outside this bounded scope keep their former execution behavior and are
reported as `ungoverned`; they are not silently presented as SealGraph-governed.

## Readback after connection

| Suite | Discovered | Governed | Active | Disabled | Ungoverned |
| --- | ---: | ---: | ---: | ---: | ---: |
| ordinary unit/deployment/release | 154 | 19 | 138 | 16 | 135 |
| Playwright e2e | 2 | 1 | 1 | 1 | 1 |

Within the 20-file scope, 3 unit tests are current and active. Thirteen unit tests and
the focused-authoring e2e test are stale; three additional unit tests have workfiles
that differ from their sealed verification content. All 17 invalid scoped tests are
excluded from execution. The live machine-readable list is produced by
`npm run test:inventory` and `npm run test:e2e-inventory`.

This exclusion means a passing aggregate run no longer cites stale scoped tests as
current evidence. It does not mean the excluded behavior is correct, tested, removed,
or accepted. Re-enabling requires review of the changed upstream state or test bytes,
an updated downstream Cause chain, and a new verification Seal.
