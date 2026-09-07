domain KshiaiFallbackPush:
  description "Commit and synchronize the locally accepted fallback-remediation branch without crossing the pull-request boundary."

problem P1:
  "Can the reviewed local verification evidence be committed and the exact codex/monotony-log-rca branch be safely pushed and read back under the user's current authorization?"

premise AUTHORITY:
  "The user explicitly instructed Codex to commit the reported uncommitted local-verification files and push, after being told that codex/monotony-log-rca was eight commits ahead and that FPR_APPROVE_PUSH was the next owner gate."

premise BOUNDARY:
  "The instruction authorizes local commits and synchronization of the current task branch. It does not authorize pull-request creation, merge, release, deployment, asset revision, or production action."

premise READBACK:
  "A successful local commit or push process is insufficient; synchronization requires an independent remote-ref readback equal to the exact local commit."

evidence E1:
  "Repository-start selected the existing linked worktree at /home/katsumata-m/.codex/worktrees/monotony-log-rca-kshiai, branch codex/monotony-log-rca, with three expected uncommitted verification files and no unrelated worktree mutation."

evidence E2:
  "A fresh authorized fetch through the confirmed /home/katsumata-m/kshiai secdat domain read origin/main at a4184d4188e050d8db63aea5aac004d1b6496d07; the local branch remains zero behind and eight commits ahead."

evidence E3:
  "The secdat dry-run is ok, the secret layer contributes GH_TOKEN, no required key is missing, and GitHub HTTPS has a gh auth git-credential helper configured."

evidence E4:
  "FPR_LOCAL_VERIFY reconciled all twenty-one points, passed focused 210 tests and full shared 304, backend 294, frontend 20, deployment 3 suites, typecheck, build, diff checks, type-boundary scans, and branch reasoning audits."

evidence E5:
  "The uncommitted set is limited to the verification report, its command-line LLMThink record, and the PERT transition that completes FPR_LOCAL_VERIFY."

evidence REMOTE_BRANCH:
  "The authorized non-force push created refs/heads/codex/monotony-log-rca, and an independent git ls-remote readback returned d70778c7c16862b4fb2fd4a7030d1c4b3a1ffaa7, equal to local HEAD."

decision D1 based_on P1, AUTHORITY, E1, E2, E4, E5:
  "Record the user's exact push approval in PERT, start FPR_PUSH_BRANCH, commit only the expected verification and lifecycle records, and do not include unrelated changes."

decision D2 based_on E2, E3, D1, BOUNDARY:
  "Push HEAD to refs/heads/codex/monotony-log-rca through the confirmed secdat route without force, then read the exact remote ref through the same route."

decision D3 based_on READBACK, REMOTE_BRANCH, BOUNDARY:
  "Only after local and remote commit IDs match, complete the PERT synchronization task; commit and push that completion receipt separately so the branch remains fully resumable, then read back the final remote ID."

decision RESULT based_on P1, AUTHORITY, E1, E2, E3, E4, E5, REMOTE_BRANCH, D3, BOUNDARY:
  "The reviewed branch is synchronized through d70778c; record FPR_PUSH_BRANCH completion in a final focused commit, push that commit without force, verify the final remote ref, and stop before the separate pull-request approval task."
