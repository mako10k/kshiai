# ADR-0078: Recover received reserved narration from public consequences

- Status: Accepted
- Date: 2026-10-12
- Decision owner: User
- Related: ADR0077 revision1; docs/unified-consciousness.pert reservedRepair/reservedStage/reservedPromote; Stage38208113568

## Context

Application v0.25.0-rc.8 committed eight turns and handled one invalid reservation as a failed action. At turn9 the narration input had zero public consequences and the physically received output was {"lines":[]}. The one-line minimum stopped the battle. All37 physical attempts closed, with no world/memory mismatch. Cumulative157 leaves104 under the approved261 attempts. Production remains application v0.24.0-rc.9.

## Decision drivers

Continue despite received presentation errors, reduce extra calls and preserve canonical judgment, privacy, raw evidence, accounting and historical bindings. Apply the owner's automatic mechanical repair direction and existing repair retry/test/deploy/staging/switch authorization.

## Considered options

1. Stop the entire battle for empty presentation: rejected.
2. Add a narration correction call: unnecessary cost for already-known public facts.
3. Deterministically render public consequences on received invalid narration: selected.

## Decision

New reserved turn policy v7 adds narrationFallback="public-consequences-v1", retaining prompt v6/output v3 and policy v6 character/judge recovery and all numeric budgets. Accepted valid narration remains unchanged. For received invalid narration JSON/schema, render only the frozen adjudicated public consequences, at most16 lines and600characters per line. If none, emit the factual line "このターンに公開された行動結果はありません。". Do not synthesize private observations, intentions, actions or consequences. Preserve the actual raw response and physical receipt, mark the effective prepared receipt NARRATION_FALLBACK and log a safe diagnostic. No extra provider call. Original persisted narration deadline, lease fences, atomic world/memory/feedback commit and exact four effective outputs still apply. Unknown sends, transport failures and late responses remain outside this recovery.

Existing policy v1-v6 and prompt v1-v6 remain immutable; policy v7 binds prompt v6/output v3. Existing failed battles are not rebound or manually resumed. No schema migration. The owner already explicitly authorizes mechanical repairs and repair retries, tests, staging, deployment and switching. One corrected application v0.25.0-rc.9 fixture uses max38advances/104physical attempts within cumulative261, unpriced; no unchanged-candidate automatic rerun, character generation or unknown-send replay. Successful Stage precedes exact-artifact promotion.

## Consequences

A public presentation defect cannot discard a correctly adjudicated turn. Normal calls remain four, corrections are unchanged, and narration recovery adds none. Fallback prose is factual and less expressive; NARRATION_FALLBACK exposes that limitation without exposing private content.

## Compatibility or migration impact

No migration or historical prompt changes. Preserve immutable failed candidate evidence and old strict narration behavior. Production rollback must retain a battle binding format v7 executor.

## Validation

Regress actual empty public input/empty lines, invalid schema and received JSON, public-only deterministic fallback and length bounds, unchanged valid narration, unknown-send/late refusal, replay without extra calls, old-policy strictness and API atomic continuation. Individually review affected authority; run full governed tests, typecheck/build/static, exact-source CI and bounded Stage before promotion.
