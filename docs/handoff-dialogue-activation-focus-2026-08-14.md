# Dialogue activation and character-focus recovery handoff

Date: 2026-08-14 (Asia/Tokyo)

Status: ADR-0015 is accepted and implemented locally. The next dialogue
activation and focus-recovery work is registered but not started. No Stage,
Promote, production mutation, provider replay, or character-focus expression
wiring is authorized by this handoff.

## Repository checkpoint

- Repository: `mako10k/kshiai`
- Working branch: `work/sda-character-norm-receipts-20260814`
- ADR workflow checkpoint: `80a9c796250607ad13318bfa059a6725b5962962`
- Continuation checkpoint: use the independently read-back remote head of the
  working branch after this handoff is pushed.
- Working directory used for this handoff: `/home/katsumata-m/kshiai`

Do not resume from another local branch with a similar structured-asset name.
Fetch this exact remote branch and compare the checked-out SHA with
`git ls-remote` before changing files.

## Completed scope

- ADR-0015 makes same-basename `.think` authoritative for ADR-0015 and later,
  with Markdown as its human-readable projection.
- Explicit `OWNER_ACCEPTANCE` evidence and an `ACCEPTANCE` decision are required
  before a new ADR authorizes implementation.
- `npm run adr:check` performs the mandatory LLMTHINK audit and status check.
- `npm run adr:check:sealgraph -- <file.think>` rebuilds a reference-only graph
  in fresh temporary storage, prints its result, and discards the storage.
- `.sealgraph/` is ignored. Old sealgraph storage is never an authority or a
  migration prerequisite; reconstruct it from `.think` and referenced originals.

Validation completed before this handoff:

- `npm run adr:check` passed;
- current sealgraph 0.1.0-dev reconstruction reported `CLEAN`;
- missing sealgraph produced an advisory warning without changing the ADR;
- type checks, jscpd, Lizard 1.23.0, and all configured tests passed;
- `git diff --check` passed.

## Confirmed local seams and current uncertainty

- `packages/shared/src/dialogue-pipeline.ts` defaults
  `contextProjectionMode` to `legacy`.
- `backend/src/config.ts` admits a revision-local dialogue override of
  `legacy`, `compact`, or no override.
- the recent release plans select no dialogue override, so the persisted setting
  or its default decides new-battle behavior.
- character focus is currently only `off` or no-effect `shadow`; its packet is
  deliberately absent from product Expression input.
- `docs/dialogue-context-loop-fix.pert` still shows `DCL_IMPLEMENT` active even
  though multiple compact-dialogue implementation commits exist.
- `docs/character-focus-hypothesis.pert` recommends
  `CF_IMPLEMENT_OPT_IN_CANDIDATE`, but
  `docs/character-focus-replay-rca.llmthink.dsl` says not to select B, C, or D
  from the completed replay.

The last production readback in the originating session observed v0.18.1 on
Cloud Run revision `kshiai-api-00093-pof`, with a retained battle bound to
`contextProjectionMode: legacy` and no character-focus policy/state. This is a
time-sensitive observation, not authority for a later machine. Refresh it
read-only before relying on it and do not print environment or database values.

## Registered continuation plan

The scoped plan is
[`dialogue-activation-focus-recovery.pert`](dialogue-activation-focus-recovery.pert).
Its tasks are deliberately ordered:

1. `DAF_AUDIT` — read-only effective-authority and plan-drift RCA;
2. `DAF_ACCEPT_ACTIVATION_ADR` — explicit owner decision on ADR-0016;
3. `DAF_WIRE_COMPACT_LOCAL` — local immutable new-battle wiring only;
4. `DAF_AUTHORIZE_STAGE` — exact owner authorization for one Stage slice;
5. `DAF_STAGE_OBSERVE` — at most six fixed Stage battles, no Promote;
6. `DAF_REPLAN_FOCUS` — replace the stale B/C/D candidate with a revised
   causal experiment plan and audit ADR-0008 acceptance provenance.

`docs/plan.pert` still has only deferred billing at its global frontier. Do not
resume billing or reinterpret that empty runnable set as authorization for this
scoped plan. Start `DAF_AUDIT` only after the user explicitly asks to proceed.

## Secret and local-state boundary

This handoff contains no credentials, `.env` content, API keys, access tokens,
cookies, database connection strings, private keys, or secret values. Do not
copy local `.env`, SQLite/PostgreSQL data, user media, LLMTHINK storage, or
sealgraph storage between PCs.

On a new machine, restore task-relevant secrets through the configured `secdat`
domain only when a later authorized task needs them:

```sh
npm run sync:secdat
```

Do not print the generated `.env` or include it in Git. For the first read-only
audit, prefer metadata and bounded readbacks that do not require secret values
to be persisted in evidence.

## Continue on another PC

```sh
cd /path/to/kshiai
secdat exec -- git fetch origin work/sda-character-norm-receipts-20260814
git switch --track origin/work/sda-character-norm-receipts-20260814
git status --short --branch
git rev-parse HEAD
secdat exec -- git ls-remote origin refs/heads/work/sda-character-norm-receipts-20260814

npm install
python3 -m pip install -r requirements-static.txt
npm run adr:check
perttool document check docs/dialogue-activation-focus-recovery.pert
perttool dag next docs/dialogue-activation-focus-recovery.pert
```

If the local branch already exists, fetch first and use a fast-forward-only
update after confirming it has no local work. Do not reset, rebase, force-push,
or merge another branch merely to make the SHA match.

## First safe continuation

Run `DAF_AUDIT` only. It may create a Proposed LLMTHINK ADR-0016 and sanitized
read-only evidence. It must stop before owner acceptance, code wiring, Stage,
provider calls, or production changes.
