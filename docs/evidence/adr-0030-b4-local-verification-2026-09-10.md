# ADR-0030 B4 local verification — 2026-09-10

## Outcome

B4's local persistence boundary is implemented and verified. Migration attempts,
provider requests, events, terminal receipts, and preservation capsules now have
separate durable identities. No provider, activation, deployment, or production
migration action was performed.

## Implemented scope

- Strict JSON-only frozen attempt and request contracts
- Registered natural-source disclosure contracts with exact path/fragment matching
- Immutable attempt and provider-request records
- Append-only attempt events and one terminal receipt per provider request
- Six-request ceiling and exact replay/drift rejection
- 256 KiB content-digested preservation capsule, separate from character truth
- Owner check and registered future-remigration consumer check for capsule reads
- Source schema/content/current-pointer recheck before new or replayed provider work
- PostgreSQL forward migration plus the equivalent SQLite bootstrap schema
- PostgreSQL smoke isolation for both qualified and unqualified migration objects
- Blank optional PostgreSQL CA override normalization to the bundled verified CA
- Combat-ready PostgreSQL smoke fixtures at the strict persistence boundary

## Verification

- Focused SQLite repository tests: 6 passed
- Focused PostgreSQL CA-path tests: 4 passed
- Isolated live PostgreSQL runtime smoke: passed through repository-scoped
  `secdat` injection; every migration, including `0024`, was applied to the
  temporary schema
- Post-smoke readback: zero `kshiai_smoke_*` schemas remained; neither B4 table
  existed in `public`
- Full tests: shared 334, backend 363, frontend 20, deployment 3, release 5
- All workspace typechecks: passed
- Production build: passed; the existing Vite chunk-size advisory remains
- Duplicate detection and `git diff --check`: passed
- ADR-0030 targeted check: passed
- Lizard 1.23.0: 191 files / 3314 functions; all unchanged thresholds passed

## RCA encountered while closing PostgreSQL verification

- Root cause of the earlier false limitation: verification checked only the
  ambient environment and did not discover the repository `secdat` domain.
- Root cause of the first database failure: this WSL host cannot reach the IPv6
  route selected by `DIRECT_URL`. For this isolated verification only,
  `DATABASE_URL` was also supplied as the administrator URL after confirming the
  project binding and database `CREATE` privilege. Product configuration was not
  changed.
- Root cause of the migration failure: the smoke redirected explicit `public.`
  names but left unqualified migration objects on the default `search_path`,
  splitting one migration sequence across schemas. The smoke now fixes its
  session `search_path` to the temporary schema.
- Root cause of the empty-path failure: blank `POSTGRES_CA_CERT_PATH` was treated
  as a real path. Blank and whitespace values now select the bundled CA, with
  focused regression coverage.
- Root cause of the `basicAttack` failure: the 2026-08-03 smoke fixture still
  used the legacy-compatible `CharacterSheet` shape at a current strict save
  boundary. It now constructs a `CombatReadyCharacterSheet` explicitly.

Each causal conclusion above passed a command-line LLMTHINK audit with no fatal,
error, or warning findings.

## Boundary and remaining unknown

The PostgreSQL result proves isolated live application and repository behavior;
it does not apply migration `0024` to `public` or prove a production rollout.
B5 semantic operations and repair, provider quality, candidate review, owner
acceptance, activation, policy cutover, deployment, and production character
migration are not established by B4.
