# Character focus-state hypothesis experiment

Status: deterministic fixture, no-effect shadow, and bounded synthetic replay
are complete. The provider replay was authorized under
`docs/evidence/character-focus-replay-authorization-2026-08-13.md`; the owner
subsequently authorized two independent LLM sub-agent reviewers under
`docs/evidence/character-focus-replay-2026-08-13/review-protocol-amendment.md`.
The reconciled result does not support A-to-C uplift, weak-cue focus
calibration, or the C novelty/restraint guards. Therefore no opt-in candidate
is selected or started. Expression projection, staging deployment, production
observation, and retained-user-data use remain unauthorized.

Post-replay product direction is recorded in
`docs/character-focus-and-narrator-presentation-direction.md`. Character focus
remains unproven and separate from the newly selected narrator-first design
direction. The first presentation candidate, if separately planned and
authorized, is limited to audience-only impact/release narration derived from
committed public receipts. Audible action calls and counterpart reactions are
deferred as future simulation features.

## Objective

Test whether character speech becomes more responsive to small situational
changes when broad battle context is retained as a low-salience guard and one
fresh observer-relative focus packet is emphasized immediately before
expression. Separately test whether persistent focus state adds value beyond
prompt placement, and whether the existing canonical `focus` parameter
modulates attention effectiveness without lowering prose quality.

The intended causal chain is:

```text
perceived delta
  -> deterministic focus selection and persistence
  -> focus effectiveness from existing focus bands
  -> fresh expression focus
  -> semantically responsive public line
```

The experiment must distinguish this chain from merely increasing textual
variety. A novel but irrelevant line is a failure.

## Hypotheses and ablation arms

| ID | Change from current behavior | Question isolated |
| --- | --- | --- |
| A — control | Current compact expression input and persisted brief | Current baseline |
| B — foreground only | Copy the freshest already-allowed local evidence beside the expression instruction; no persistent focus state and no focus-band effect | Does prompt salience/recency alone help? |
| C — state, steady | Add deterministic `CharacterFocusStateV1`, decay, hysteresis, and state-derived expression focus; force effectiveness to `steady` | Does persistent selected attention help beyond placement? |
| D — state plus focus | Arm C plus effectiveness derived from existing absolute and base-relative focus bands | Does the character parameter add calibrated value? |

Arm B must not refresh or semantically reinterpret the persisted expression
brief. Arm C introduces the new state owner. This keeps “put it near the end”
separate from “maintain character attention.”

Results are interpreted component by component:

- B > A supports the local-foreground hypothesis without requiring new state.
- C > B supports persistent focus state and state-derived expression focus.
- D > C on weak-cue calibration, without quality loss, supports using the
  existing focus parameter.
- If C passes and D fails, keep the state hypothesis and reject focus coupling.
- If only B passes, prefer the smaller prompt-projection change.

## Fixed synthetic scenario matrix

Use twelve versioned, observer-relative expression snapshots. Do not use
retained user battles.

| Scenario | Required distinction |
| --- | --- |
| Subtle counterpart gesture | Weak fresh interpersonal cue |
| Direct counterpart reply | Strong fresh speech cue |
| Fresh self result | Own immediate committed consequence |
| Fresh counterpart result | Observed change to the counterpart |
| Ambient microchange | Small relevant environmental cue |
| Strong ambient interruption | Strong cue may legitimately switch focus |
| No new evidence | Prior focus should decay or be deliberately held |
| Repeated self utterance only | Self echo must not count as fresh evidence |
| Counterpart responds to a repeated line | New response may refresh or reframe focus |
| Competing weak and strong cues | Stronger relevant evidence should win without leaking hidden facts |
| Deliberate protective hold | Character-grounded fixation may persist without fabricated novelty |
| Hidden canonical change | Unperceived information must never become a focus candidate |

Each scenario has frozen expected candidate evidence, forbidden evidence,
allowed hold/switch outcomes, and high/steady/strained focus variants where the
distinction is relevant. Include A/B side-swap variants in deterministic tests.

## Phase 1: deterministic contract and shadow

After ADR-0008 is accepted:

1. Define bounded focus-state, packet, transition-receipt, and policy-generation
   schemas.
2. Build candidates only from the character's own retained perception and
   perceived conversation.
3. Reuse existing server-only absolute and base-relative focus bands. Freeze a
   versioned mapping to an attention-effectiveness band; never send raw values.
4. Implement decay, novelty, hysteresis, optional secondary capacity, and the
   self-echo exclusion as pure deterministic functions.
5. Run the twelve scenarios, focus variants, A/B swaps, missing-input cases,
   replay, and unrelated-field counterfactuals without an LLM.
6. Shadow the transition on local fixed battles without changing expression,
   action, mechanics, persistence outside the new private envelope, or public
   output.

Deterministic acceptance requires:

- hidden/private evidence selections: 0;
- repeated-self-utterance freshness selections: 0;
- unbound or unknown evidence references: 0;
- same-input replay mismatches: 0;
- A/B structural asymmetry after label swap: 0;
- mechanics, action, provider-call, public DTO, and narration diffs: 0;
- every expected fixture focus/hold/switch outcome passes.

Failure corrects the state contract or fixture before any provider replay.

## Phase 2: blinded expression replay

This phase requires a separate owner approval that freezes provider, model,
temperature support, input revision, fixture digest, reviewer rubric, maximum
logical and physical attempts, maximum tokens, and monetary ceiling.

Replay all four arms for the twelve scenarios three times in randomized order:

```text
12 scenarios x 4 arms x 3 samples = 144 logical expression calls
```

The hard physical-attempt ceiling is 160. Exhaustion stops the experiment; it
does not fall back to another provider or silently reduce an arm. Use the same
one expression responsibility in every arm. Do not add deep-psyche, judge,
repair, retry-on-content, narration, or complete-battle calls.

The two owner-selected LLM sub-agent reviewer profiles score anonymized output
independently before arm labels are revealed. Freeze both raw files, then apply
the predeclared conservative deterministic reconciliation; do not use a third
judge or adaptive discussion to resolve disagreements.

## Evaluation metrics and thresholds

Calculate each rate per scenario first, then aggregate across scenarios so one
verbose or easy case cannot dominate.

| Measure | Definition | Acceptance |
| --- | --- | ---: |
| Observer-safety violation | Output uses hidden or forbidden evidence | 0 in every arm |
| Fresh-evidence grounding | Eligible lines materially use the newest selected perceived evidence | C >= 0.75 and C - A >= 0.20 |
| Semantic response | Eligible lines answer a new counterpart move or present result | C >= 0.75 and C - A >= 0.15 |
| Unsupported novelty | Line invents a change to appear responsive | C <= A + 0.05 |
| Character consistency | Line remains consistent with frozen identity and speech style | C >= A - 0.05 |
| No-change restraint | No-evidence cases avoid fabricated development | C >= 0.80 |
| Worst-speaker exact-unique rate | Existing KPI over the assembled dialogue sequences | >= 0.60 |
| Longest exact repeat run | Existing same-speaker exact run KPI | <= 2 |
| Weak-cue focus calibration | Weak-cue uptake under sharp versus strained effectiveness | D difference >= 0.20 |
| Strong-cue non-inferiority | Strong-cue uptake under strained versus sharp effectiveness | loss <= 0.10 |
| Low-focus prose non-inferiority | Naturalness/consistency under strained focus versus C | loss <= 0.05 |

Exact uniqueness is a secondary guard. The primary claim requires semantic
grounding and response. A low-focus character may miss a subtle cue, but the
line it does produce must remain coherent and character-consistent.

Report raw counts, denominators, per-scenario results, reviewer agreement, and
missing values. With this bounded sample, a pass supports the fixed-fixture
hypothesis; it is not a population-wide claim.

## Phase 3: opt-in candidate and staging trial

Only after replay acceptance may implementation wire arm D—or the smallest arm
actually supported by the ablation—into an opt-in battle policy. Local
acceptance must prove:

- immutable policy and asset binding;
- legacy battle compatibility and fail-closed no-focus fallback;
- no raw focus values, private reasoning, or control IDs in expression input;
- unchanged action, mechanics, world, rating, narration, and provider-call
  counts;
- bounded prompt size and no new retry/fallback route;
- full test, typecheck, build, privacy, migration, and replay gates.

Staging requires another owner decision on the exact commit, artifacts,
configuration, rollback target, observation protocol, operation ceiling, token
ceiling, and monetary ceiling. Run at most six fixed staging battles across at
least three matchups, including high/low baseline focus and temporary focus
gain/loss. Stop on any safety, mechanics, schema, cost, or privacy divergence.

Apply the KPI contract to the six-battle cohort, but retain the replay's
semantic rubric as the primary hypothesis measure. Do not promote to production
from this plan.

## Final decision

The owner records one of four outcomes:

- support foregrounding only (B);
- support persistent focus state without focus coupling (C);
- support persistent focus state with focus coupling (D);
- reject or revise the hypothesis.

A supported outcome authorizes a new adoption/release plan, not an automatic
production release. All generated provider evidence remains synthetic,
sanitized, and bound to the accepted evaluation revision.

## Required artifacts

- Proposed/Accepted ADR-0008 and immutable policy contract.
- Versioned fixture corpus and expected deterministic focus transitions.
- Shadow trace summary without public or canonical effects.
- Frozen provider-replay authorization and sanitized output scores.
- Ablation report with raw denominators and component decision.
- Exact staging candidate, local acceptance receipt, and bounded staging report.
- Owner hypothesis decision and separately scoped next plan.
