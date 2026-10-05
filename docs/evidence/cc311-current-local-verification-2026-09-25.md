# cc311 current local verification — 2026-09-25

## Scope and result

PERT task `cc311` extends the verified focused character path to one create
candidate. The required implementation already exists on the current branch:
`POST /api/characters/generate` registers a focused `create` source, the durable
worker runs the common semantic-authoring kernel and character V3 adapter, and
the owner reads the persisted semantic candidate review. No feature-code change
was required for this task.

The current create-route authority is recorded by:

- `implementation/cc311-focused-create-route-current-20260925`
  (`bdc9b6e9c40e6ffa3653b4d56c699a1a9f1d3a7cd1be6bbac8261b76f04184c4`)
- `verification/character-focused-authoring-current-20260925`
  (`9249863341089e859fbcfbbbb82b3eb6679ebe9b91bcbb298521ce10bbbbe1f3`)

Both REFs are non-draft, non-stale, clean, and match their bound sources.

## Observed create behavior

The controlled test sends `火を守る旅人` through the normal owner create HTTP
entrypoint. The worker produces and persists a structured V3 candidate, the
owner review exposes the generated identity field, and latest-review lookup
returns the same attempt. The result remains separate from final acceptance:
`canAccept` is false, forced confirmation is rejected, and no current character
generation or pointer is created. The bounded failure case persists terminal
failure and replays idempotently without another provider call.

The provider is local test infrastructure. No paid or external provider was
called.

## Verification

- Focused-authoring test file: 9 passed, 0 failed.
- Create success path: owner review persisted and no current generation.
- Create failure path: bounded failure persisted and terminal replay made no
  additional provider call.
- Seal-based inventory and repository integrity checks are recorded in the task
  completion readback.

## Forward measurement

- Start: `2026-09-25T19:51:27+09:00`, planned value `1p`.
- Finish: `2026-09-25T20:02:42+09:00`.
- Active time: `0.1875h` (11 minutes 15 seconds).
- Effort: `0.1875ph`.
- This task sample is `5.333p` per active hour. It is retained as the first
  forward sample and is not a reconstruction of earlier work.
- `perttool project observe-velocity` did not consume the sample because its
  Git-history reader reported `unsupported_source_version`; the explicit PERT
  start/finish actuals remain the measurement record.

## Boundary

This evidence does not accept the candidate, create a current character
generation, move a pointer, call a paid provider, deploy, or activate policy.
It covers only the local `cc311` create-path extension.
