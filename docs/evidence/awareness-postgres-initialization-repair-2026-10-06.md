# Awareness runtime initialization PostgreSQL repair

## Authority and scope

The owner-approved awareness implementation and public completion goal require the supported PostgreSQL storage path to initialize a fenced runtime. This correction preserves schema, lease rules, immutable initialization, provider choices, deadlines, budgets, and the held old cutover trial. Canonical delivery task: `awareness-public-deploy` in `docs/speech-continuity-and-fade-recovery.pert`.

PR158 was merged to `7b68493211f01ea46021193e7162c4884880f833`. Its source tree equals the previous working branch tree. A branch preflight explicitly records why `codex/awareness-postgres-init` starts from that verified main commit while unrelated dirty files and current PERT actuals remain preserved.

## Observed failure and producing condition

Stage run [37397433691](https://github.com/mako10k/kshiai/actions/runs/37397433691), tag `v0.23.0-rc.6`, successfully deployed revision `kshiai-api-00171-nuw` at zero public traffic and passed health, authentication and SSE checks. The exact-revision battle `btl_82bc6bdedf39a77e9033f188c15ba50f` was created after Grok encounter preparation completed in 26,010 ms. Its first advance failed in 118 ms with PostgreSQL `inconsistent types deduced for parameter $3`. Public promotion was not performed.

The initialization INSERT reused parameter 3 for the runtime INTEGER fencing token and the lease BIGINT fencing token. It also reused parameter 5 for the runtime TEXT update timestamp and the lease TIMESTAMPTZ expiry comparison. Verified-CA database probes used `BEGIN READ ONLY`, checked `transaction_read_only=on`, and executed plain `EXPLAIN` without ANALYZE. The original INSERT reproduced SQLSTATE 42P08, bigint versus integer. Casting only parameter 3 exposed the timestamp conflict; forcing a text timestamp produced an unsupported timestamptz/text comparison. Separate lease bindings with the identical values planned successfully. The existing UPDATE also planned successfully and remains unchanged.

The producing condition is conflicting parameter inference in the INSERT. SQLite tests did not expose PostgreSQL type inference; that is a detection gap, separate from the producing condition. This failure occurred before subconscious execution, and is not evidence of an LLM timeout.

## Correction and verification

A pure query builder owns only the initialization SQL bindings. Runtime and fencing validation remain in the repository. Lease comparisons receive separate parameters 6 and 7 containing the same validated fencing token and timestamp. No schema migration, type escape or implicit retry is introduced.

The actual new source builder passed a further verified-CA, read-only EXPLAIN against the existing PostgreSQL schema. Native PostgreSQL integration tests use an explicitly configured loopback test database and temporary tables with the observed column types. They check accepted current leases, rejected wrong-owner/stale/expired leases and preservation of an existing snapshot. The normal CI validate job supplies the dedicated service; no production database URL is used for test writes.

CLI reasoning audit: fatal 0, error 0, warning 0. Local verification: sealed normal suites 201 passing (153 + 19 + 29), awareness 279 passing and the two native PostgreSQL cases explicitly skipped because no dedicated local server was configured. Build, full workspace/deployment typecheck and static checks passed. Native PostgreSQL CI and corrected release evidence remain pending and will be appended after observation. A new immutable release tag is required; rc6 is retained without movement. Successful staging remains a prerequisite for promotion and a fresh public complete-battle observation.
