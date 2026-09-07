domain KshiaiFallbackIntegrationDeployment:
  description "Route the synchronized fallback-remediation branch toward deployment while preserving exact owner approvals and artifact readback."

problem P1:
  "How far may the instruction to perform the work together through deployment proceed before later exact evidence and owner decisions exist?"

premise AUTHORITY:
  "User-wide and repository governance require separate exact authorization and readback for pull-request creation, merge, release, Stage, and production promotion; a desired terminal outcome does not erase those evidence-dependent boundaries."

premise REQUEST:
  "The user explicitly requested that the synchronized fallback-remediation work be carried through deployment in one flow."

premise ORDER:
  "The protected path is pull request, four required CI checks, merge readback, annotated release tag, no-traffic Stage workflow, Stage artifact readback, production approval, and Promote workflow."

evidence E1:
  "Fresh GitHub readback shows origin/main at a4184d4188e050d8db63aea5aac004d1b6496d07, synchronized branch codex/monotony-log-rca at d7cecd55565853b0839dfbc7a98bd645f76e5e6d, and no existing pull request for that head."

evidence E2:
  "Main protection requires current validate, security, backend-image, and worker checks, linear history, and pull-request integration; no approving review count is configured."

evidence E3:
  "The release workflow accepts annotated v0.22.0 release-candidate tags, verifies package and changelog version 0.22.0 plus required checks on the tag commit, stages Cloud Run with no traffic, uploads an immutable Worker version, and returns their exact IDs."

evidence E4:
  "The production workflow requires those exact staged IDs and confirmation DEPLOY plus the exact tag; the production GitHub Environment separately requires reviewer mako10k and does not allow administrator bypass."

evidence E5:
  "The latest release is v0.22.0-rc.7 at origin/main, so the next monotonic candidate would be v0.22.0-rc.8 only after the new main commit and its required checks exist."

pending MERGE_EVIDENCE:
  "The pull-request number, final head SHA, required CI conclusions, mergeability, and resulting main SHA do not exist or are not yet established."

pending STAGE_EVIDENCE:
  "The release tag commit, staged Cloud Run revision, Worker version, preview smoke, migrations, auth, SSE, R2, and queue evidence do not yet exist for this change."

premise ALT_A:
  "Treat the terminal deployment request as advance approval for every later object regardless of evidence."

premise ALT_B:
  "Use the request for the currently exact PR creation, then advance automatically through read-only waits but stop at each later owner decision until its exact evidence exists."

premise ALT_C:
  "Perform no integration action until every future identifier is known, which prevents producing the evidence needed for later decisions."

decision D1 based_on P1, AUTHORITY, REQUEST, ORDER, E1, E2, ALT_A, ALT_B, ALT_C:
  "Select B: record approval for one pull request from codex/monotony-log-rca at its final synchronized head into main, create it, and wait for all required checks."

decision D2 based_on D1, MERGE_EVIDENCE, AUTHORITY:
  "After checks complete, report the exact PR revision, conclusions, mergeability, proposed squash result, and deployment sequence; do not merge until the owner approves that exact evidence."

decision D3 based_on E3, E4, E5, STAGE_EVIDENCE, AUTHORITY:
  "Do not create v0.22.0-rc.8, dispatch Stage, approve production, or dispatch Promote before their predecessor evidence and exact owner gates are satisfied."
