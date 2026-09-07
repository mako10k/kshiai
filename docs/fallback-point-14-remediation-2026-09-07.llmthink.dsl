domain KshiaiFallbackPoint14:
  description "Determine the source correction for observer perception projection fallback point 14."

problem P14:
  "Which observer perception failures may continue with a minimal projection, and which must stop as application defects?"

premise CONTRACT:
  "Validated absence is represented by an empty sensory-evidence list, and missing legacy perception registry is explicitly normalized by the projection function."

premise CONTROL:
  "A fallback may continue only for a declared recoverable input class; invariant or schema failures in deterministic application state must not be normalized."

premise SCOPE:
  "This increment addresses point 14 only. Semantic seed and basic-attack compatibility points 18 and 19 remain separate subsequent increments."

evidence E1:
  "reconcileSemanticState validates sensory evidence before projection and passes the validator result list into projectPerceptionState."

evidence E2:
  "projectObserverPerception accepts empty sensory evidence and normalizeRegistry constructs an empty registry when the previous legacy registry is absent."

evidence E3:
  "Before this remediation, the runtime try-catch wrapped both observer projections and caught every thrown value, including registry and frame Zod parse failures."

evidence E4:
  "Before this remediation, the test named projection fallback supplied rejected sensory evidence, asserted the validator returned an empty list, and then observed a successful projection; it did not force or verify the catch branch."

evidence E5:
  "After the source correction, the focused public battle semantic projection tests, repository typecheck, all workspace tests, and production build completed successfully."

decision I1 based_on CONTRACT, E1, E2:
  "Recoverable sensory absence and legacy registry absence already use typed normal paths and do not require an exception fallback."

decision I2 based_on CONTROL, E3:
  "Every currently reachable exception in this boundary represents invalid deterministic input or a projection implementation defect unless a narrower recoverable exception is later introduced and typed."

decision D1 based_on P14, I1, I2, E4:
  "Remove the blanket exception fallback from the runtime boundary and let projection invariant failures reject the semantic-state transition. Retain buildMinimalObserverPerception only for explicit construction consumers, not as an exception handler."

decision D2 based_on D1, SCOPE:
  "Replace the misleading regression with tests proving rejected sensory evidence projects normally from engine cues and invalid prior perception state is not silently normalized. Do not change points 18 or 19 in this increment."

decision D3 based_on D1, D2:
  "Run focused backend tests, typecheck, full tests, and build; classify any resulting issue before expanding scope."

decision RESULT based_on D1, D2, E5:
  "Point 14 is corrected locally: typed absence continues through normal projection, while invalid deterministic perception state raises an explicit application error without entering semantic fallback continuation."
