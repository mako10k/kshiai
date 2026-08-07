# v0.7.2 causal narration staging evidence

Date: 2026-08-07 (Asia/Tokyo)

## Immutable artifact and deployment

| Item | Evidence |
|---|---|
| Source tag | annotated `v0.7.2`, tag object `e778107c60041eca3c307263d4a714e75a83f020` |
| Source commit | `11d5beff1d358d931b34ac32ed220d1c2074fc2b` |
| Stage workflow | [run 31143398998](https://github.com/mako10k/kshiai/actions/runs/31143398998), success in 5m45s |
| Backend image | `asia-northeast1-docker.pkg.dev/kshiai/kshiai/backend@sha256:4ea40238183dbb0b7078abfd85f8ed0eb2c80f1258ff21911ec599dadf951fca` |
| Guarded revision | `kshiai-api-00029-gub`, tag `release-v0-7-2`, `BATTLE_CAUSAL_NARRATION_MODE=narration_guarded`, 0% traffic |
| Exact-image baseline | `kshiai-api-00030-fun`, tag `trial-v0-7-2-off`, `BATTLE_CAUSAL_NARRATION_MODE=off`, 0% traffic |
| Worker version | `ea366035-e7b5-44f6-8ce4-109900f70f5a` |
| Worker preview | `https://ea366035-kshiai-web.mako10k.workers.dev` |
| Production during trial | `kshiai-api-00027-bix` (`v0.7.1`) remained at 100% traffic |

The stage workflow passed release-tag and required-check verification, immutable
image build, no-traffic Cloud Run deployment, forward-only migrations, Worker
version upload, protected-origin and preview smoke, disposable Supabase JWT and
SSE smoke, and read-only R2 smoke. The second baseline revision uses the exact
same image digest and differs only in the causal-narration mode.

## Bounded comparison

One disposable Supabase user and one deterministic fixture character were used
against the same public opponent, `情熱直撃ジゴロ・レイジ`, and the same system
battlefield, `放課後の学校`. Each revision received one battle creation, one
prologue advance, and one combat-turn advance. The requests used distinct
idempotency keys and were not retried.

Both combat turns committed the same action and event shape:

- the fixture's accepted skill grazed the opponent for minor HP loss;
- the opponent's accepted `耳元の囁き` caused moderate HP loss and minor
  stamina loss to the fixture; and
- neither semantic transition added an operation.

The exact damage numbers differed slightly between the two separately generated
battles, so this sample does not support a mechanics-equivalence claim.

### Narration result

The `off` narration said that the whisper's aftermath disturbed the fixture's
breathing. It did not identify the committed stamina change or explain its
future combat relevance.

The guarded narration explicitly linked the whisper to the qualitative stamina
loss and then to pressure on the fixture to respond:

> レイジの耳元での囁きが静かに響き、因果検証役の持久力がわずかに削られる。
> 囁きの余波が流れを作り、因果検証役に応答を促す。

This is a concrete improvement for `OBS-20260807-01`: the public narration now
states both a source action and a carry-forward resource consequence without
showing raw values. It emitted no control identifiers or uncommitted causal
claim, and the guarded turn's dialogue came from the committed side-B
utterance.

The result is still incomplete. The same canonical whisper event also caused
moderate HP loss, but the guarded narration did not explain that loss or why a
whisper plausibly produces it. The receipt can preserve and present a committed
link; it does not make the underlying action-to-effect pairing logically valid.
`OBS-20260807-01` therefore remains open as partially improved, while
`OBS-20260807-02` was not exercised by this sample.

## Calls, latency, fallback, and cleanup

The two revisions had the same causal-pipeline call topology: one
`reconcileTurnSemanticState`, one `narratePrologue`, and one `narrateTurn` for
the observed path, with no narrator call added by guarded mode. Both trials also
encountered character-agent provider fallback; Venice returned HTTP 402, while
the routed XAI/OpenAI calls completed the battles. No narrator fallback occurred.

| Mode | Create | Prologue advance | Combat-turn advance | `narrateTurn` provider time |
|---|---:|---:|---:|---:|
| `off` | 17.944s | 14.539s | 21.748s | 3.376s |
| `narration_guarded` | 19.241s | 12.015s | 28.184s | 2.747s |

The guarded combat request was slower in this one sample, but its narrator call
was faster. Most of the difference was in semantic reconciliation (13.516s vs
7.149s), so it cannot be attributed to the local causal projection. Token and
cost telemetry was unavailable; no cost comparison is claimed.

Cleanup readback returned zero disposable users, characters, and battles, and
the temporary Supabase auth user was deleted.

## Trial disposition

No bounded code revision is selected from this single sample. The axial concept
worked: explicit committed causality reached the existing narrator and improved
the stated consequence without extra authority or calls. The residual logical
validity and completeness observations stay in the observation backlog rather
than interrupting the hypothesis sequence. Production promotion remains a
separate owner decision.
