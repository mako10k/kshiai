# ADR-0015: Make LLMTHINK the ADR authority and use sealgraph as an advisory check

- Status: Accepted
- Date: 2026-08-14
- Decision owner: Product owner
- Canonical draft: [`0015-llmthink-canonical-adrs-and-advisory-sealgraph.think`](0015-llmthink-canonical-adrs-and-advisory-sealgraph.think)
- Acceptance evidence: Product owner explicitly approved D1 through D4 on 2026-08-14, with the requirement that sealgraph state remain reconstructable from original sources
- Related: `AGENTS.md`; `docs/adr/template.md`; LLMTHINK; sealgraph 0.1.0-dev

This Markdown file is a human-readable projection of the accepted LLMTHINK
record. The same-basename `.think` file is authoritative.

## Context

Markdown-only ADRs currently combine causal structure, explanatory prose, and
approval state. This makes it difficult to distinguish evidence-backed decisions
from an agent's inference and to prove that the decision owner approved the exact
draft before implementation.

LLMTHINK supports explicit `based_on` relationships and audit. Reviewers still
need a readable Markdown view. sealgraph can provide an independent dependency
projection, but its current `0.1.0-dev` contract may change incompatibly.

## Decision drivers

- Make causal support and unresolved questions explicit in the authoritative
  artifact.
- Preserve a concise view for reviewers who do not use the DSL directly.
- Prevent the drafting agent from treating a continuation request as approval.
- Keep an experimental tool from becoming an accidental authority or release
  dependency.

## Considered options

1. Keep Markdown as the only authoritative artifact. This preserves the current
   workflow but does not add machine-auditable causal relationships.
2. Treat Markdown and LLMTHINK as independent authorities. This creates an
   unresolved split-brain condition when they diverge.
3. Make LLMTHINK authoritative and Markdown its human-readable projection, with
   sealgraph as a non-authoritative secondary projection. This is the selected
   option.

## Decision

For ADR-0015 and later ADRs:

- The same-basename `.think` file is the authoritative causal and decision
  record. The `.md` file is its human-readable projection. A conflict is fixed
  in favor of `.think`.
- Every new ADR starts as `Proposed`. `Accepted` requires evidence in the `.think`
  file that the named owner explicitly approved the exact ADR identity and
  decision revision. Drafting, inspection, continuation, or implementation
  requests do not by themselves constitute acceptance.
- sealgraph may reproduce selected LLMTHINK `based_on` and artifact dependencies
  in isolated disposable storage. Its output can prompt investigation, but it
  cannot alter the canonical record, supply approval, decide status, authorize
  implementation, or become a required CI or release gate. Its storage and
  reports are disposable caches: every projection must be rebuilt from the
  authoritative `.think` file and referenced source artifacts without reading
  prior sealgraph storage. If a new version cannot read old storage, discard the
  cache and adapt the advisory projection before rebuilding it.
- Existing ADR-0001 through ADR-0014 keep their current Markdown authority and
  are not rewritten by this migration. Their acceptance provenance is inventoried
  separately; unknown provenance must be explicitly reconfirmed before it alone
  authorizes new implementation.

## Consequences

### Positive

- Causal support, owner authority, and unresolved acceptance remain distinct.
- Human review remains practical through the Markdown projection.
- sealgraph can be evaluated without coupling repository correctness to its
  unstable contract.

### Negative and risks

- Each ADR requires synchronized `.think` and `.md` artifacts.
- Until projection automation exists, reviewers must detect presentation drift.
- The sealgraph adapter may need frequent repair and cannot be treated as proof
  of semantic correctness.

## Compatibility and migration

ADR-0015 applies to itself and later ADRs. Implementation updates `AGENTS.md`,
the ADR README and templates, adds a mandatory LLMTHINK audit command, and adds
a separately invoked best-effort sealgraph reconstruction. Historical acceptance
provenance is audited separately without silently changing decisions.

## Verification

- `llmthink dsl audit docs/adr/0015-llmthink-canonical-adrs-and-advisory-sealgraph.think --min-severity warning`
- Reproduce this draft's recognized `based_on` edges in an isolated sealgraph
  repository and inspect `sealgraph status`, `sealgraph stale --frontier`, and
  `sealgraph graph`.
- Confirm that no workflow, CI, production, release, or historical ADR status was
  changed before explicit owner acceptance.

## Implementation references

- `AGENTS.md`
- `docs/adr/README.md`
- `docs/adr/template.think`
- `docs/adr/template.md`
- `scripts/check-adrs.mjs`
- `scripts/check-adr-sealgraph.mjs`
