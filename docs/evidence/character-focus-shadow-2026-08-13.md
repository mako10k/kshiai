# Character focus deterministic shadow evidence — 2026-08-13

Status: deterministic offline and opt-in shadow accepted locally. No provider
replay, staging deployment, production observation, or expression projection
was run.

## Bound candidate

- Policy generation: `character-focus-shadow-v1`
- Fixture count: 12 observer-relative synthetic scenarios
- Focus variants: `sharp`, `steady`, `strained`
- Evaluated cases: 36
- Fixture SHA-256:
  `b9d029a5fd10326dd3ab74c560f83d1dd4b7280ca98588282ce23b25ead874bf`
- Blinded scoring contract: `docs/character-focus-review-rubric.md`
- Runtime guard: `CHARACTER_FOCUS_SHADOW_MODE=off` by default;
  `shadow` binds the policy only to newly created battles.

## Deterministic result

Command:

```text
npm run observe:character-focus-shadow
```

| Check | Result |
| --- | ---: |
| Expected focus/hold/switch mismatches | 0 / 36 |
| Same-input replay mismatches | 0 / 36 |
| Hidden canonical text selections | 0 / 36 |
| Repeated-self-utterance freshness selections | 0 / 3 |
| Provider calls | 0 |

The fixed cases distinguish weak and strong cue handling: strained focus misses
the subtle gesture and weak self result while all bands retain direct speech,
strong counterpart result, and strong ambient interruption. Only sharp focus
holds a secondary weak cue in the competing-cue fixture.

## Runtime shadow invariants

Tests prove that the opt-in policy:

- adds battle-private focus state and deterministic receipts;
- stores only evidence references and bounded salience in the state, not copied
  prose;
- emits an ID-free packet into the existing private internal trace but does not add it to the
  expression-model input;
- adds no deep-psyche or expression provider operation;
- does not alter character parameters, action, mechanics, public DTO, or
  narration authority;
- fails closed to a no-focus packet when packet or focus-band input is missing
  or side/turn mismatched;
- preserves legacy and default-off battles without focus state;
- binds the policy generation immutably only when the explicit local shadow
  guard is selected.

## Decision boundary

This evidence completes only the deterministic fixture and no-effect shadow
slice authorized by ADR-0008. The next PERT frontier is owner authorization of
a frozen 144-logical-call / 160-physical-attempt blinded expression replay.
No provider call is permitted until that separate authorization freezes its
provider, model, temperature support, fixture digest, reviewer rubric, token
ceiling, monetary ceiling, and stop conditions.
