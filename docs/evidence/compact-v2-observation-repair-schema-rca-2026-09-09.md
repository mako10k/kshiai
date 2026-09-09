# Compact V2 observation replay repair-schema RCA

## Result

The failed provider replay exposed two separate causes:

- Initial provider defect: Grok placed `expressionBrief` inside `delta` despite
  the initial prompt's explicit top-level schema. The model-internal reason is
  unknown.
- Root cause of repair failure: the separate repair request required a complete
  `expressionBrief` but did not include that object's field names, enum values,
  focus cardinality, or types. The rejected slice contained
  `expressionBrief: null`, so the repair request had no valid shape to follow.

The repair response consequently copied speech-appraisal fields into
`replacement.expressionBrief`. Strict validation rejected the result and the
one-shot replay stopped as designed.

## Contributing and escape causes

The repair request cannot rely on the original system prompt because each
`chatJson` call is an independent Chat Completions request. The existing tests
provided an already-correct repair object directly; they verified validation
and merge behavior but not whether the repair prompt supplied the missing
contract. That test gap is the escape cause, not the source cause.

## Correction

The repair prompt now includes complete `speechAppraisal` and
`expressionBrief` replacement shapes. A regression starts with an absent
top-level brief, asserts that the repair prompt contains the brief's enum and
focus contract, and verifies that a valid replacement is accepted.

The touched test boundary was also made type-safe: typed provider input,
subclass-based provider interception, Zod validation after the genuine JSON
string boundary, and control-flow checks replace `as never`, double casts, and
non-null assertions.

The consumed replay ID remains failed and must never be retried. A corrected
provider replay requires a new run ID, newly prepared immutable evidence, and
separate approval.

