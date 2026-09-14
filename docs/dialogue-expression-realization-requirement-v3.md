# Dialogue expression state and history requirement candidate v3

- Status: Candidate / owner review pending
- Date: 2026-09-08
- Requirement owner: Product owner
- Source request: Separate character state from completed utterance history so
  an unchanged situation does not make an earlier utterance look unconsumed,
  while preserving characters that repeat the same line.
- Current normative baseline: `docs/requirements.md` at
  `2e211479c49717c760bc8eb7f2ff36da8c9dcb69bebb07721b46fe2b06753d54`
- Related authority: ADR-0004, ADR-0008, F-BTL-13, F-BTL-15, F-BTL-37,
  F-BTL-48

## 1. Required outcome

Compact character processing must keep these inputs distinct:

1. durable private and semantic character state; and
2. utterances and visible reactions that already occurred.

The expression result must separately name the utterance proposed for the
current call. Equal text is permitted and is still a new occurrence. No text
comparison or runtime reuse classifier is part of correctness.

## 2. Definitions

### 2.1 Expression state

The bounded, character-private semantic projection available to deep psyche or
outward expression. It contains disposition, goals, beliefs, emotion, focus,
dialogue intent, and other explicitly permitted conscious context. It does not
contain `lastSpeech` or another authoritative copy of completed utterance text.

### 2.2 Utterance history

A bounded observer-relative projection of canonical utterance events that have
already occurred. It is historical context, not a candidate result. Public
narrator wording is not utterance history.

### 2.3 Next utterance

The non-empty utterance or visible reaction returned for the current Compact
expression call. It is named `nextUtterance`. When accepted, the existing turn
assembly records it as the current canonical utterance event.

## 3. Normative requirements

### req001: Separate state and actual history

Compact deep-psyche and expression inputs must place `expressionState` and
`utteranceHistory` in separate closed typed fields. `expressionState` must not
contain `lastSpeech` or `conversationHistory`. `utteranceHistory` contains only
observer-perceived completed occurrences.

### req002: Canonical utterance authority

Canonical `utterance` events remain authoritative for actual speech.
`CharacterAgentState.lastSpeech` is not an authoritative input under the new
Compact contract and must not be copied into `expressionState`. Existing stored
fields may remain readable only for old-policy compatibility.

### req003: Explicit current output

The Compact expression output must use `nextUtterance`, not generic `speech`.
It represents the current call result and must not contain an event ID, a prior
utterance reference, or a declared relation to earlier wording.

### req004: Content-independent acceptance

Any otherwise valid non-empty `nextUtterance` is accepted without comparing it
with earlier text. Exact repetition, paraphrase, and different wording follow
the same path. Phrase bans, normalization checks, similarity gates, and an LLM
intention classifier are prohibited as acceptance mechanisms.

### req005: Reuse the existing commit boundary

At-most-once turn commitment remains owned by the existing battle revision
compare-and-save operation. A stale concurrent save must fail as it does now.
The change must not add an expression opportunity, realization receipt,
provider-operation ID, utterance-event ID, secondary idempotency ledger, or
runtime cross-opportunity reuse detector.

### req006: Closed changed boundaries

The changed Compact input and output boundaries must use explicit closed
schemas. They must not end at `any`, `Record<string, any>`,
`Record<string, unknown>`, or `z.unknown()`.

### req007: Preserve responsibility and privacy boundaries

The change must not merge psyche, focus, action selection, outward expression,
semantic adjudication, or narration. It must not expose opponent-private state
or public narrator wording to character cognition.

### req008: Immutable compatibility boundary

The revised Compact contract must be selected through the existing immutable
dialogue-policy binding for new battles. Existing battles continue under their
recorded contract. No new policy or lifecycle identifier is introduced, and no
existing identifier is renamed.

### req009: No provider-count expansion

The normal successful path remains one expression call per active character.
The change does not authorize a critic call, regeneration loop, automatic
provider retry, cross-provider fallback, or release-time replacement call.

## 4. Acceptance criteria

1. Compact deep-psyche input contains semantic state and a separate completed
   utterance history, with no `lastSpeech` inside semantic state.
2. Compact expression input uses the same separation.
3. Compact provider output is decoded from `nextUtterance` through a closed
   schema rather than an arbitrary record.
4. Equal and different previous text produce the same acceptance behavior.
5. The accepted result is recorded once by normal turn assembly.
6. A stale concurrent battle save remains rejected by the existing battle
   revision boundary; no second idempotency mechanism is added.
7. A-side input contains no B-private state and B-side input contains no
   A-private state.
8. Narrator-rendered wording never enters utterance history.
9. Existing battle snapshots parse and replay under their recorded policy.
10. Successful-path provider operation count is unchanged.
11. Changed shared and backend boundaries contain no `any` or arbitrary-record
    escape.

## 5. Compatibility disposition

- Preserve F-BTL-37 and F-BTL-48: canonical utterance events and
  observer-relative projection remain authoritative.
- Preserve ADR-0004: psyche and expression remain independent consumers.
- Preserve ADR-0008: repeated self speech does not refresh focus, and no phrase
  ban or narrator rewrite is introduced.
- Revise F-BTL-13 for the new Compact contract: `lastSpeech` remains legacy
  compatibility data but is excluded from semantic-state inputs and new writes.
- Clarify F-BTL-15: updated private state and the actual expression are separate
  outputs even when produced within the same turn.

## 6. Out of scope

- New expression lifecycle entities or identifiers.
- Runtime detection of prior provider-result object reuse.
- Semantic-similarity scoring or a universal preference for varied wording.
- Rewriting a character's actual speech in the narrator.
- Changing mechanics, action selection, damage, victory, or public-turn timing.
- Paid replay, Stage activation, production promotion, or migration of an
  existing battle without its own approval.
