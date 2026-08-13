# Character-focus blinded independent review

Review packet SHA-256: `4950964efc9707f4943e30dad986efb74c501ad7c8642d70883da4ace508ab71`

Two explicitly authorized LLM sub-agents independently score every row from
`review-packet.blinded.json` and freeze separate files before comparison. Use
1/0, or NA only where the packet marks that measure ineligible. Do not open
`run-state.unblinded.json` until both independent files and the deterministic
reconciled score set are frozen. Reviewer roles and reconciliation are defined
in `review-protocol-amendment.md`.

A transport/content failure is missing data and must not be replaced by a rerun.
