# Judgment presentation projection design

- Status: Accepted for implementation
- Date: 2026-08-13
- Governing decision: [ADR-0009](adr/0009-separate-adjudication-from-judgment-presentation.md)

## Authority boundary

```text
committed turn facts + final qualitative state
  -> Referee
  -> BattleAdjudication (internal immutable audit)
       winnerSide ---------> exact server verdict
       reasonFacts.factor -> deterministic public projection
       reason/statement ---X public presentation

JudgmentPresentationProjectionV1 + public continuity + style
  -> existing narrateJudgment call
  -> optional before/after framing
```

The exact verdict owns the terminal result. The narrator owns only optional
framing. Neither output can update winner, rating, character state, world state,
or the internal adjudication.

## Projection

```ts
type JudgmentPresentationProjectionV1 = {
  schemaVersion: 1;
  verdictKind: "win" | "draw";
  winnerLabel: string | null;
  basisLines: string[]; // 1..2 audience-safe lines
};
```

The selector admits only `reasonFacts.factor` values whose favored side matches
the canonical winner. It ignores `reason`, `statement`, source, fallback side,
input range, turn facts, parameter keys, intensity bands, reserve bands,
operation kinds, IDs, and raw values.

Stable factor order is:

1. overall effectiveness;
2. committed actions;
3. visible/mechanical effects;
4. remaining capacity;
5. world impact.

The public mapping deliberately uses genre-neutral language:

| Internal factor | Winner basis | Draw basis |
| --- | --- | --- |
| overall effectiveness | `<name>は対決全体で一歩上回った。` | `対決全体を通して、両者は譲らなかった。` |
| committed actions | `<name>は最後まで有効な働きかけを積み重ねた。` | `両者の働きかけは最後まで拮抗した。` |
| mechanical effects | `<name>は働きかけの結果をより強く残した。` | `両者が残した結果に決定的な差はなかった。` |
| remaining capacity | `<name>は終幕まで対決を続ける余地をより多く保った。` | `終幕に残した余地も、両者ほぼ互角だった。` |
| world impact | `<name>は場の流れをより強く動かした。` | `場へ与えた影響も、両者の間で拮抗した。` |

If no consistent factor remains, use the overall-effectiveness line. Equal
factors are de-duplicated, and at most two lines are retained.

## Rendering contract

- The server inserts `判定は <name> の勝利。` or `判定は引き分け。` exactly once.
- `narrateJudgment` sees only the projection and cannot see raw adjudication
  prose.
- It may express at most one projected basis naturally in `before` or `after`.
- It must not quote projection keys, add scoring terms, invent an action or
  outcome, or add character speech.
- On provider failure or legacy input without a projection, keep the exact
  verdict and omit a public reason.

## Acceptance

- unit tests cover factor mapping, contradictory facts, raw-text invariance,
  draw, fallback, and deep immutability;
- provider prompt capture proves raw reason is absent and projection is present;
- worker tests prove both current and legacy requests publish no raw reason;
- battle-service tests prove canonical adjudication remains unchanged while the
  public block is outcome-only;
- full test, typecheck, and build pass.
