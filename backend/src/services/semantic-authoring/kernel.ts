export type KernelCandidateStateV1<Candidate, Obligation, Finding> = Readonly<{
  candidateRevision: number;
  candidate: Candidate;
  obligations: ReadonlyMap<string, Obligation>;
  findings: ReadonlyMap<string, Finding>;
}>;

export type KernelTransactionIssueV1<Finding> = Readonly<{
  key: string;
  finding: Finding;
}>;

export type KernelStageResultV1<Candidate, Obligation, Finding> =
  | Readonly<{
      accepted: true;
      candidate: Candidate;
      obligations: ReadonlyMap<string, Obligation>;
      findings: ReadonlyMap<string, Finding>;
    }>
  | Readonly<{
      accepted: false;
      issue: KernelTransactionIssueV1<Finding>;
    }>;

export type KernelTransactionResultV1<Candidate, Obligation, Finding> =
  | Readonly<{
      accepted: true;
      state: KernelCandidateStateV1<Candidate, Obligation, Finding>;
    }>
  | Readonly<{
      accepted: false;
      reason: "base_candidate_revision_mismatch" | "stage_rejected" | "hard_check_failed";
      state: KernelCandidateStateV1<Candidate, Obligation, Finding>;
    }>;

function withDeduplicatedIssues<Candidate, Obligation, Finding>(
  state: KernelCandidateStateV1<Candidate, Obligation, Finding>,
  issues: readonly KernelTransactionIssueV1<Finding>[],
): KernelCandidateStateV1<Candidate, Obligation, Finding> {
  if (issues.length === 0) {
    return state;
  }
  const findings = new Map(state.findings);
  for (const issue of issues) {
    findings.set(issue.key, issue.finding);
  }
  return { ...state, findings };
}

export function applyProposalTransactionV1<Candidate, Obligation, Proposal, Finding>(
  state: KernelCandidateStateV1<Candidate, Obligation, Finding>,
  baseCandidateRevision: number,
  proposal: Proposal,
  stage: (
    candidate: Candidate,
    obligations: ReadonlyMap<string, Obligation>,
    findings: ReadonlyMap<string, Finding>,
    proposal: Proposal,
  ) => KernelStageResultV1<Candidate, Obligation, Finding>,
  hardChecks: readonly ((
    candidate: Candidate,
    obligations: ReadonlyMap<string, Obligation>,
    findings: ReadonlyMap<string, Finding>,
  ) => KernelTransactionIssueV1<Finding> | null)[],
  revisionMismatchIssue: KernelTransactionIssueV1<Finding>,
): KernelTransactionResultV1<Candidate, Obligation, Finding> {
  if (baseCandidateRevision !== state.candidateRevision) {
    return {
      accepted: false,
      reason: "base_candidate_revision_mismatch",
      state: withDeduplicatedIssues(state, [revisionMismatchIssue]),
    };
  }

  const isolatedObligations = new Map(state.obligations);
  const isolatedFindings = new Map(state.findings);
  const staged = stage(state.candidate, isolatedObligations, isolatedFindings, proposal);
  if (!staged.accepted) {
    return {
      accepted: false,
      reason: "stage_rejected",
      state: withDeduplicatedIssues(state, [staged.issue]),
    };
  }

  const issues = hardChecks.flatMap((check) => {
    const issue = check(staged.candidate, staged.obligations, staged.findings);
    return issue === null ? [] : [issue];
  });
  if (issues.length > 0) {
    return {
      accepted: false,
      reason: "hard_check_failed",
      state: withDeduplicatedIssues(state, issues),
    };
  }

  return {
    accepted: true,
    state: {
      candidateRevision: state.candidateRevision + 1,
      candidate: staged.candidate,
      obligations: new Map(staged.obligations),
      findings: new Map(staged.findings),
    },
  };
}
