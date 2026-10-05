# ADR-0051: Observed LLM usage accounting and explicit version labels

- Status: Accepted
- Date: 2026-10-05
- Decision owner: Repository owner
- Related: [ADR0050](0050-asynchronous-awareness-projected-character-pipeline.md), [implementation design](../battle-consciousness-usage-measurement-2026-10-05.md), [version labels](../version-display-rules.md), speech-continuity-and-fade-recovery.pert

## Context

Owner explicitly requests object-specific version labels and says: 「料金証明は一旦いいから、実利用トークンをしっかり記録して、利用コストを測れるようにしましょう」。Mandatory certified maximum-charge admission currently prevents new battles without injected proof. This decision inherits all ADR0050 decisions except the mandatory pre-dispatch token/pricing proof and guaranteed USD ceiling. The owner separately holds the old cutover trial contract change.

## Decision drivers

- Identify what is versioned whenever a version is displayed.
- Record provider observations for every physical attempt, including failures, repairs, and late responses.
- Permit calls without a certified price quote and represent absent usage/prices explicitly.

## Considered options

1. Keep mandatory certified quotes: contradicts the latest owner instruction.
2. Assume zero cost or infer actual tokens from text length: misrepresents actual observations.
3. Persist actual usage and calculate estimated cost with an explicit price table: selected.

## Decision

New awareness battles bind immutable accounting policy `awareness-v5-usage-v1`. Pre-dispatch certified input-token/maximum-charge proof is optional. USD0.50 and role shares remain observation targets, not a guaranteed spending ceiling when prices are unknown. Output token caps, time limits, physical-attempt and concurrency ceilings, no automatic transport retry/fallback, canonical failure handling, and privacy boundaries remain inherited. Existing bound certified policies retain their own admission contract.

Persist one record per physical SDK attempt, with immutable call/attempt identity, optional battle/side/tick/receipt scope, requested and response model, provider request ID, start/end/elapsed, status/error class, reported prompt/completion/total/cached/reasoning tokens, and original usage metadata. Record unknown categories as null; errors, timeouts and missing usage are not zero-token or zero-cost calls. Usage remains durable if output parsing fails or the judgment arrives too late to apply.

Expose a cost report from actual recorded token categories and an explicit versioned price table. Label the result estimated usage cost, not an invoice. Preserve partial known totals and unknown attempt counts separately; a total with unknown components is incomplete. Reports may be repriced without rewriting original usage. Do not record prompt/response content or secret material in the usage ledger.

Display versions as object name plus version, using docs/version-display-rules.md. Keep stored identifiers unchanged. Character definition v3, battle binding format v5, and awareness-v5 pipeline are different dimensions.

## Consequences

### Positive

- Missing certified pricing no longer prevents the newly requested measured-use path.
- Per-role and per-model actual token measurements support subsequent economic tuning.

### Negative and risks

- No strict USD0.50 maximum can be asserted without complete prices and maximum-charge contracts.
- Providers can omit usage or expose overlapping token categories; reports preserve unknowns and avoid double-counting reasoning.

## Compatibility and migration

Add an FK-free usage ledger so encounter attempts before battle insertion are observable. New policy revisions are bound only at creation. Existing battles and accepted old trial creation contracts are not migrated. Trial contract revision remains held by the owner; its conflicting tests are reported separately.

## Verification

Verify actual SDK response usage persistence, missing usage/error/invalid JSON/late response, multiple physical attempts, category-aware repricing, complete versus partial totals, restart persistence, scope correlation, optional proof admission, old certified-policy refusal, strict types, and existing pipeline regressions. No paid run or deployment is authorized.

## Implementation references

- Decision → claims: usage persistence, measured admission, version display.
- Claims → evidence: owner instruction above; current SDK prompt/completion usage fields and optional observation-run accounting.
- Implementation action → this Accepted decision and its linked detailed design.
