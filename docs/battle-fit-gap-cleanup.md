# バトル Fit/Gap repository整理記録

作成日: 2026-08-05
対象: `T_CLEANUP`

削除は、保存先のremote SHAまたはmerged PRを読み戻し、対象の再利用可能な差分が
統合済みか別artifactへ保存済みと確認できたものに限定する。stashはbranchとは別の
未確定差分なので、類似実装が存在するだけでは削除しない。

## 受入れ後inventory

| artifact | inventory時点 | 判定 |
|---|---|---|
| `feature/battle-fit-gap-v051-20260805` | `a5b2338`、`origin/main@206a1b0`から13 commit | release対象。PR mergeとremote SHA確認までは保持 |
| `feature/battle-fit-gap-20260805` | `4759789`、誤った旧baseline上のnarrator先行実装 | narrator差分は現branchの`af7b5f6`以降へ再統合。release PR merge後に削除可 |
| `wip/perception-consumers-20260804` | `cf8e534`、remote refは既にgone | reusable実装はPR #19 (`115e2e0`) と現branchへ統合済み。main読戻し後に削除可 |
| local `main` | `51afb9a`、`origin/main@206a1b0`に対しbehind | 独自未統合commitはなく、feature merge後にfast-forwardする |
| stash: perception continuity | `stash@{2026-08-05 10:07:14 +0900}`、3 files / 112 insertions | 現実的初期・継続認知としてより厳密な実装へ再利用済みだが、exact patchは未統合。明示確認なしには削除しない |
| stash: temporal rules draft | `stash@{2026-08-05 10:07:10 +0900}`、4 files / 22 insertions | `initiative-window-v1`へ再利用済みだが旧PERT event等を含む。明示確認なしには削除しない |
| linked worktree | `/home/katsumata-m/kshiai` の1件のみ | orphanなし |
| remote refs | `origin/main`, `origin/ops/cicd` | fetch/prune済み。stale refなし、既存ops branchは対象外 |

二つのstashは削除候補ではなく、出所付きで保持する。release対象外のremote branchや
worktreeへの書込みは行わない。feature PRとrelease PRがmergeされた後、local mainを
exact `origin/main`へ合わせ、削除可能と証明済みのlocal branchだけを除去する。

## 完了時readback

- feature PR #24は4必須check成功後にmergeされ、squash SHAは
  `45684d3674c4261277fd0d0c158f945f7ce6e410`。
- `origin/main` とlocal `main` は同じ `45684d3674c4261277fd0d0c158f945f7ce6e410`。
- local `feature/battle-fit-gap-20260805@4759789` と
  `wip/perception-consumers-20260804@cf8e534` を削除した。両commitは保持stashの
  基底から到達可能で、再利用済み成果はPR #19とPR #24に存在する。
- remote feature branchはPR merge時のrepository設定により削除済み。
- 二つのstashは出所付きで保持した。削除していない。
- linked worktreeは1件だけでorphanなし。release作業はcleanな
  `release/0.6.0` をexact `origin/main`から作成して引き継ぐ。

release PR、tag、staging、productionのSHA・artifact readbackは、この整理タスクでは
先取りせず、後続のrelease記録へ分離する。
