# Independent review — structured semantic authoring kernel design v1 revision 5

- Verdict: **PASS**
- Findings: P0 0, P1 0, P2 0, P3 0
- Review subject: `design/structured-semantic-authoring-kernel-v1`
- Exact Seal: `69c9c98937d7d610384823ae339ea464724f6e983d8b5500d3aef6942945a240`
- Workfile SHA256: `426470047d0e380de90624192b9db71d3f30788fa44423ed0710f9cb1e6cdba4`
- Scope: accepted ADR-0032, retained ADR-0031 D11, foundation v3 F8/F9/F15,
  revision-4 findings, revision-5 recovery transitions and conformance fixture
- Excludes: implementation fitness, numeric time-policy selection, provider behavior,
  deployment, activation, and owner acceptance

## Closed revision-4 findings

Revision 5 closes both prior P1 findings. Under a current fence it evaluates
transport-recovery eligibility before resource admission, sends zero/consumed/no-basis
paths to `provider_transport_unavailable`, sends otherwise-eligible admission failure
to `resource_exhausted`, retains the timeout receipt and accounting, and requires the
fixture to distinguish those branches.

Evidence: design lines 543–560 and 772–781; revision-4 review decisions D2 and D3.

## Disposition of the original revision-5 finding

The original review treated the absence of a formal recovery-basis verifier, exact
admissible-evidence semantics, canonical digest scope, and additional metadata-only and
stale-evidence fixtures as one P1 design blocker. That finding is **not adopted**.

Accepted foundation F8 permits source-supported synthesis, creative completion,
coherent interpretation, low-importance adjustment, valid deferral, and preserved
retirement as reviewable migration outcomes. F9 separately requires retries to add
information, narrow the problem, or test a materially different alternative, and
forbids blind retry. These execution safeguards constrain runaway execution; they do
not make migration a semantic-exactness process.

Revision 5 already requires the server to establish one truthful typed `recoveryBasis`
before paid admission, rejects recovery when no such basis exists, disallows a model
assertion as the basis, assigns a distinct replacement request identity, and requires
controlled evidence that no blind replay is scheduled. ADR-0031 D11 does not make the
additional formal proof protocol proposed by the original review a design-acceptance
requirement.

Digest inequality alone still does not prove material information gain. That is a
possible implementation hazard to evaluate when verifying runtime F9 conformance, not
evidence of a current contradiction in this design. Promoting that optional elaboration
into a P1 blocker was **AP-007 Control Accretion**: a later-stage implementation concern
was converted into a new current prerequisite without an accepted requirement or a
concrete unresolved design outcome.

Evidence: foundation v3 F8 lines 210–228, F9 lines 232–255 and lines 375–378;
design lines 531–557 and 772–781; accepted ADR-0031 D11.

## Evidence-chain conclusion

- `C-RECOVERY-001` 📜: Revision 5 closes both revision-4 findings.
  - References: `E2`, `E3`, revision-4 review `D2`, `D3`.
- `C-RECOVERY-002` 📜✅: The design-level recovery contract satisfies F9 without
  requiring semantic-exact migration or the original review's additional proof protocol.
  - References: authoritative review thought `E4` through `E8`, `C1` through `C3`.
- `A-RECOVERY-001` ➖ [保留]: Verify actual runtime F9 conformance during the
  implementation stage; do not make one optional verifier design a retroactive
  requirement for this review.
  - Reference: `C-RECOVERY-002`, `U1`.

## Boundary

This PASS does not accept the design and does not authorize implementation, provider
calls, PERT resumption, route cutover, deployment, production effects, pointer/policy
activation, rollback, or release. `cc304` remains suspended. Runtime implementation
conformance and provider behavior remain unverified.
