domain KshiaiIssue135CompactPsycheValidationRca:
  description |
    Hypothesis-first RCA for GitHub Issue 135: Stage compact deep-psyche
    HTTP succeeded then application validation rejected the compact state.

problem RCA:
  |
    Why did four xAI grok-4.3 compact psyche operations—both sides at
    prologue and aftermath—complete HTTP then throw "Deep psyche returned
    invalid compact state", and which layer (prompt, decoder, schema,
    validator) is the producing mechanism?

premise SAFETY:
  |
    Do not persist raw private provider output. Do not add retries, provider
    fallback, phrase bans, prose rejection, extra LLM calls, or another
    observation as diagnosis.

premise H1:
  |
    Hypothesis H1: the provider HTTP call failed or returned non-JSON, and
    the compact validator is a missing check covering transport failure.

premise H2:
  |
    Hypothesis H2: aftermath omitted delta.privateMemory, which is the only
    compact-specific post-parse rule.

premise H3:
  |
    Hypothesis H3: chatJson succeeded as an object, then
    CharacterDeepPsycheCompactAdvanceSchema.safeParse failed. The thrown
    Error discards Zod issue paths, so the exact field was not retained.

premise H4:
  |
    Hypothesis H4: the compact envelope is .strict() at delta, brief, and
    root while the prompt permits optional extra fields. Unknown keys from a
    successful JSON object fail the decoder before semantic content is
    judged.

evidence E1:
  |
    Stage revision kshiai-api-00120-dog at 2026-09-04T12:26:51Z and
    12:28:40Z logged xai/advanceCharacterPsycheCompact model=grok-4.3 ok
    (1841ms, 2508ms, 3777ms, 3783ms) immediately before
    "[llm-router] xai advanceCharacterPsyche failed reason=other" and
    "[battle] side A/B deep psyche retained prior state Error: Deep psyche
    returned invalid compact state".

evidence E2:
  |
    The compact path throws that Error only after chatJson returns and
    CharacterDeepPsycheCompactAdvanceSchema.safeParse fails, or when
    aftermath privateMemory is empty. Prologue calls also failed, so
    aftermath-only privateMemory cannot be the sole mechanism.

evidence E3:
  |
    CharacterDeepPsycheCompactAdvanceSchema, CharacterDeepPsycheDeltaSchema,
    and CharacterExpressionBriefSchema are .strict(). The compact prompt
    allows optional persistent private fields, observableManifestations, and
    narrativeCues. A successful JSON object with an unknown key fails parse
    without a path in the battle log.

evidence E4:
  |
    Issue 135 states the four compact inputs used compact mode, correct
    observer-side ownership, and no legacy top-level aliases. Sixteen
    normal-turn psyche traces were skipped by policy. Provider ledger
    counted four successful physical attempts.

decision D1 based_on H1, E1, E4:
  |
    H1 is rejected. Transport succeeded. The failure is application-level
    compact-state validation after a parsed JSON object.

decision D2 based_on H2, E2:
  |
    H2 is rejected as the sole cause. Prologue calls failed the same Error.

decision D3 based_on H3, H4, E2, E3:
  |
    H3 and H4 are supported. The producing mechanism is the compact decoder
    plus silent Zod failure: a successful JSON object is rejected as a
    single opaque Error, most directly by strict unknown-key refusal on the
    compact envelope.

decision FIX based_on RCA, D3, SAFETY:
  |
    Decode the compact envelope by selecting known keys before schema parse.
    Keep required compact speechAppraisal fields and continuityBasis pairing.
    On remaining failure, log Zod path and code only, never raw private
    payload. Cover extra-key success and still-invalid missing appraisal.
    Do not add retries or provider fallback.
