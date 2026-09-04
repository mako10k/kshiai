# Compact-dialogue Stage authorization review — 2026-09-04

Status: **not ready for owner authorization**. This is a local review packet
for `DAF_AUTHORIZE_STAGE`; it is not an authorization receipt. It does not
push or tag a commit, build an image, dispatch a workflow, call an LLM
provider, change a database, deploy, Promote, or change production traffic.

## Scope and repository identity

- Review worktree:
  `/home/katsumata-m/.codex/worktrees/dialogue-activation-authority-kshiai`
- Reviewed branch and pre-report HEAD: `codex/dialogue-activation-authority` at
  `8a45a223749bb60e79dcf094abcbcd75f34b6e08`
- Exact local implementation candidate:
  `4133445b2f144187c955f4487c209d02d895bedb`
- Candidate base: locally recorded
  `origin/main@4d446e4e4459114dab9ac87ba2589040814224b4`
- [Latest public GitHub release](https://github.com/mako10k/kshiai/releases/tag/v0.21.7)
  read on 2026-09-04: `v0.21.7`, commit
  `4d446e4e4459114dab9ac87ba2589040814224b4`, backend image
  `sha256:430891fec8dfdefcf298ecfd59ddcf257aac982418788e8589494cde700170ad`,
  Cloud Run revision `kshiai-api-00116-doz`, and Worker version
  `d76ee358-8a3d-425a-8d07-a528233f6c08`.
- A live Cloud Run readback was attempted and failed before returning service
  state because the existing local `gcloud` authentication requires
  interactive reauthentication. No login or credential change was attempted.
  The current 100% traffic target and inherited runtime LLM configuration are
  therefore unknown.

The old checkout at `/home/katsumata-m/kshiai` and its branch are outside this
review and were not modified.

## Items that can be frozen now

### Candidate behavior

The candidate binds each newly created battle to the effective dialogue mode,
activation source, setting revision and generation content identity. A Stage
override additionally binds the deployment commit and digest-qualified
artifact reference. Existing battle behavior, mechanics, provider call paths,
retry rules and public DTOs are unchanged by the implementation.

The candidate adds no PostgreSQL migration and changes no existing migration
relative to its base. This source-tree fact does not prove that the shared
database currently has zero pending migrations.

### Proposed fixed six-battle matrix

The only existing retained observer fixture is one cross-account matchup. The
smallest executable dialogue-activation cohort is therefore six independent
repetitions of that exact fixture, not six invented matchups:

| Slot | Observer | Opponent | Battlefield | Narration style | Stance | Maximum advances |
| --- | --- | --- | --- | --- | --- | ---: |
| DAF-S1 | `chr_e2e_dialogue_nagi` | `chr_e2e_dialogue_gaku` | `bfp_e2e_dialogue_rainy_alley` | `nst_e2e_dialogue_contrast` | `balanced` | 24 |
| DAF-S2 | same | same | same | same | same | 24 |
| DAF-S3 | same | same | same | same | same | 24 |
| DAF-S4 | same | same | same | same | same | 24 |
| DAF-S5 | same | same | same | same | same | 24 |
| DAF-S6 | same | same | same | same | same | 24 |

This repeated-fixture design isolates stochastic dialogue variation and is
consistent with the earlier six-battle dialogue plans. It does not establish
cross-matchup generality. That limitation must remain explicit in any later
product decision.

### Provider-operation ceiling

For 24 maximum advances, the accepted projection function yields the following
physical-attempt admission ceiling per battle:

| Layer | Ceiling per battle | Ceiling for six battles |
| --- | ---: | ---: |
| Encounter | 2 | 12 |
| Character expression | 92 | 552 |
| Deep psyche | 4 | 24 |
| Environment | 44 | 264 |
| Narration | 26 | 156 |
| Referee | 1 | 6 |
| **Total** | **169** | **1,014** |

The existing durable operation ledger atomically refuses the next observed
physical attempt after a battle reaches 169. Each battle must use a distinct,
preapproved run ID and the six runs must be sequential; any failed or stopped
slot ends the cohort without dispatching a replacement.

### Observation and stop conditions

For every completed slot, retain and reconcile the exact release commit, image
digest, Cloud Run revision, battle ID, observation run ID, activation receipt,
provider-operation ledger, advance count, latency and sanitized dialogue KPI
receipt. The activation receipt must be exactly:

- effective mode: `compact`;
- activation source: `deployment_override`;
- deployment commit: the exact release commit, not merely ancestor candidate
  `4133445b2f144187c955f4487c209d02d895bedb`; and
- deployment artifact: the exact digest-qualified backend image used by the
  tagged Cloud Run revision.

Stop before the next slot on any of the following:

- secret, private state, hidden observer input or general-character leakage;
- effective mode/source/deployment identity mismatch;
- packet ownership or compact-input cardinality mismatch;
- provider or schema failure, unclassified/reserved attempt, accounting
  mismatch, or the 169-attempt per-battle ceiling being reached;
- unbounded prompt growth or missing token/cost usage evidence;
- canonical mechanics, action, world, rating, narration authority or provider
  routing differing from the accepted candidate boundary;
- exact repeat run of four or more for one speaker, or another recurrence of
  the diagnosed dialogue loop; or
- failure to converge narration receipts, preserve ordered history, or retain
  sanitized evidence.

No result from this six-battle fixed fixture is sufficient to authorize
Promote, a persisted `compact` setting write, production observation, or a
population-wide quality claim.

## Items that prevent authorization

1. **No releasable immutable artifact exists.** The implementation commit is a
   local ancestor of the review HEAD, remains version `0.21.7`, is not on
   verified current `main`, and has no new annotated release tag, backend
   digest, Cloud Run revision or Worker version. The protected Stage workflow
   accepts only a checked release tag from `main`.
2. **The live rollback baseline is not verified.** Public release evidence
   identifies `v0.21.7`, but current Cloud Run traffic and inherited service
   configuration could not be read. A Stage authorization must bind a fresh
   live readback rather than assume that the latest release record is still the
   active service state.
3. **The release workflow is broader than the six-battle observation.** It
   builds and publishes artifacts, executes the shared forward-only migration
   job, creates a no-traffic Cloud Run revision, sends a Cloud Task, uploads a
   Cloudflare Worker preview version, and runs auth/R2 smokes. A preflight must
   prove zero pending migrations or those database changes require their own
   explicit review.
4. **The retained observer is production-only and single-battle.** It rejects
   a revision unless it is the sole 100% production target and calls only
   `https://kshiai.mk10.org`. It cannot execute this no-traffic Stage matrix
   without a separately reviewed Stage-target binding and six-run controller.
5. **Token and monetary ceilings are not enforceable.** The provider adapter
   sends battle requests without a maximum output-token parameter. The ledger
   stores only provider-reported total tokens, and monetary cost remains
   `null` when the provider does not return a reliable estimate. It has no
   atomic token or monetary reservation analogous to physical attempts. The
   active provider, engine/fast models and price snapshot are also inherited
   service state and have not been frozen. Choosing arbitrary numbers would
   state an authorization boundary that the current path cannot enforce.

## Evidence chain and next actions

| ID | Kind | Statement | Evidence or dependency |
| --- | --- | --- | --- |
| `E-STAGE-001` | evidence | Local candidate identity and no-migration diff | Git commit `4133445`; diff against `4d446e4` |
| `E-STAGE-002` | evidence | Stage workflow has broader external effects | `.github/workflows/stage-release.yml` |
| `E-STAGE-003` | evidence | Existing observer is production-only and one battle | `.github/workflows/observe-persistent-e2e.yml`; `backend/src/scripts/persistent-battle-e2e.ts` |
| `E-STAGE-004` | evidence | Physical-attempt ceiling is atomic; token/cost ceilings are not | `backend/src/llm/provider-accounting.ts`; ADR-0007 |
| `E-STAGE-005` | evidence | Live runtime readback is unavailable | non-interactive `gcloud run services describe` reauthentication failure on 2026-09-04 |
| `C-STAGE-001` | claim | Local activation wiring is a valid implementation candidate | `E-STAGE-001`; completed local task receipt in `docs/dialogue-activation-focus-recovery.pert` |
| `C-STAGE-002` | claim | `DAF_AUTHORIZE_STAGE` is not decision-ready | `E-STAGE-002` through `E-STAGE-005`; confidence: high |
| `A-STAGE-001` | action | Prepare a release-eligible exact commit/tag and read back its immutable Stage artifacts | blocked; needs integration/release authority and successful protected checks |
| `A-STAGE-002` | action | Add a Stage-bound sequential six-run observer that verifies the exact override receipt | proposed; requires repository implementation and review |
| `A-STAGE-003` | action | Freeze provider/model/pricing and implement enforceable token and monetary admission/stop controls | proposed; requires a separate architecture/owner decision because ADR-0007 leaves this policy open |
| `A-STAGE-004` | action | Re-run owner review with all fields exact | blocked by `A-STAGE-001` through `A-STAGE-003` |

The current decision is therefore **hold Stage authorization**. Completing or
reviewing this packet does not mark `DAF_AUTHORIZE_STAGE` done.
