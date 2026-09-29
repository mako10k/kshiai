# vt101 local V3 registration evidence (2026-09-29)

## Scope and authority

The vt101 child task covers the local registration and selection prerequisite for the Neva-versus-Rio Stage trial. The owner requested execution on the existing `codex/cc304-focused-revise` branch. Accepted V3 authoring requirement revision 5 and ADR-0010 govern V3 structure, immutable generations, compatibility, and pointer activation. This exercise uses fixed local trial content and a synthetic local SQLite owner. It is not owner acceptance of the exact character content, general provider-backed V3 creation, battle binding, Stage activation, or release.

## Local database readback

The explicit local SQLite file is `data/vt101-trial.db` in this worktree. It is gitignored. The registration command requires an existing owner and explicit absolute database path:

```sh
node --import tsx backend/src/scripts/register-v3-stage-trial.ts \
  --db "$PWD/data/vt101-trial.db" --owner vt101-local-owner
```

Both invocations returned the same IDs and digests. Independent SQLite readback found two ready current generations at schema version 3, generation 1, with exactly two generation rows:

| Character | Logical ID | Generation ID | Full content digest |
| --- | --- | --- | --- |
| Neva | `stage-trial-neva-0ae8841e73555ed1` | `character:stage-trial-neva-0ae8841e73555ed1:g1:50edf23389df2537` | `50edf23389df253762378ba622537cff3d86722f613693b6a92796a7624d307f` |
| Rio | `stage-trial-rio-0ae8841e73555ed1` | `character:stage-trial-rio-0ae8841e73555ed1:g1:a9ee9fda59bb0bdb` | `a9ee9fda59bb0bdb1b8d77bbff300dac57ef372dfb41e1786e67691635c38252` |

## Verification

- Direct local test: `node --import tsx --test backend/src/repositories/local-v3-trial-characters.test.ts` passed. It verifies generation identity/digest, ready compatibility, idempotent registration, no overwrite of a different generation, owner selection list, and `/api/characters?selectable=true` plus `/api/match/candidates` route reads.
- Related V2 authoring and character route tests passed with the new test in one targeted run (28 tests).
- `npm run typecheck` passed. `npm test` passed its SealGraph-selected set (the new test is unsealed and disabled there; the direct run above verifies it).

## Remaining boundary

This is local trial-data registration. The product's ordinary V3 create flow still needs an owner-review-to-activation implementation and exact content acceptance before real Stage registration. vt102 owns V3 battle binding and V3-only creation enforcement. vt103 owns the integrated local battle. Stage data writes remain under vt106 and vt108 with separate authority.
