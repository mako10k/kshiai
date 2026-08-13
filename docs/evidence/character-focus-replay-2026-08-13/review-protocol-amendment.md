# Review protocol amendment — 2026-08-13

The original prepared execution record called for two human reviewers and no
LLM judge. That reviewer-class condition was proposed by Codex and was not
separately agreed with the product owner. It is not a contract with an external
party. The product owner explicitly replaced it after provider execution by
requesting these two independent sub-agent reviewers:

1. a logical reviewer sensitive to symmetry, consistency, and completeness;
2. a game-oriented reviewer sensitive to spectacle, interest, surprise, and
   character vitality.

Both reviewers are LLM sub-agents and must be identified as such. They inspect
only `REVIEW.md` and `review-packet.blinded.json`; neither may inspect the
unblinded state, source, provider receipt, arm labels, or the other review before
freezing its own score file. Their declared preferences may shape notes and
borderline rubric judgments, but may not weaken observer safety or allow
unsupported novelty.

The independent outputs are:

- `review-logical.csv` and `impressions-logical.md`;
- `review-story.csv` and `impressions-story.md`.

No third model judges disagreements. Reconciliation is deterministic and is
frozen before either result is read:

- for beneficial fields (`fresh_evidence_grounding`, `semantic_response`,
  `character_consistency`, `no_change_restraint`, and `naturalness`), the
  reconciled value is `1` only when both reviewers scored `1`; otherwise `0`;
- for adverse fields (`observer_safety_violation` and
  `unsupported_novelty`), the reconciled value is `1` when either reviewer
  scored `1`; otherwise `0`;
- `NA` is determined only by the packet's eligibility flags and must agree in
  both files;
- both raw score files, disagreement counts, and impressions remain visible.

This amendment changes only who reviews and how disagreements are reconciled.
It does not change or rerun the 144 generated outputs, reveal arms before score
freeze, alter KPI thresholds, or authorize staging, release, or production use.
