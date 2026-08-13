# Character-focus expression replay authorization

- Status: Authorized and prepared on 2026-08-13
- Owner authorization: the product owner said `では、進めてください。` after the
  replay hypothesis plan, the explicit provider-call boundary, and the
  two-human-review boundary were stated.
- Contract digest:
  `c0c3e6114a1ae126d8fec4b4f47890fcdb89c32d70640f3959e013825ef65d74`
- Protocol digest:
  `3268556a30eb6629008cb6a8a8528d5eaf6adb667bdfab30603068866a5d2be6`
- Production baseline SHA:
  `9535a3d3090b6e39f465c368d5a23b29da9606d8`
- Canonical machine-readable contract:
  `evidence/character-focus-replay-2026-08-13/prepared-contract.json`

## Frozen execution boundary

- Synthetic observer-relative fixtures only; no retained user battle data.
- xAI Chat Completions at `https://api.x.ai/v1` with request model
  `grok-4-fast-non-reasoning` and temperature `0.65`.
- xAI retired that request slug on 2026-05-15 and documents its redirect to
  `grok-4.3` with reasoning effort `none`. The receipt records the model returned
  by every response. A response outside the frozen request/effective model pair
  stops the run rather than silently changing the comparison.
- Exactly 12 scenarios x 4 arms x 3 samples = 144 logical calls in one frozen
  randomized order.
- At most 160 physical attempts. No provider fallback, content repair, content
  retry, deep-psyche call, narration call, full battle call, or LLM judge.
- Only the identical payload may retry once, and only for HTTP 429 or 503.
- Maximum 180 completion tokens per call, 1,000,000 total tokens, and USD 1.50.
  A conservative UTF-8-byte-as-token preflight bound is 723,579 tokens and
  USD 0.936874 at the frozen price snapshot, so all 144 calls fit without
  depending on cached-input discounts.
- Four concurrent requests, 30-second per-attempt timeout.
- An interrupted in-flight call is ambiguous and is never automatically
  resent. Successful logical calls are durable and skipped on a safe resume.

## Frozen comparison

- A: exact current compact-expression prompt and input.
- B: latest eligible local evidence foregrounded; no retained focus state;
  steady selection capacity.
- C: deterministic persistent focus state and foreground packet; effectiveness
  forced to steady.
- D: arm C with effectiveness derived from the scenario's frozen focus bands.

The focus packet is ID-free and placed as the final input field. Broad context
remains present for identity, truth, and safety. Strained focus may change cue
selection only and is explicitly forbidden from lowering language quality.

## Review and acceptance boundary

The generated packet hides arm, focus band, sample number, and provider
metadata. At least two people independently score every completed output using
the frozen binary rubric. Their files and any reconciled score set are frozen
before the arm map is read. Provider execution alone cannot complete
`CF_RUN_BLINDED_ABLATION`; it remains open until this human review exists.

No staging, production deployment, release, or battle-policy adoption is
authorized here.

## External price/model evidence

- xAI retirement notice:
  https://docs.x.ai/developers/migration/may-15-retirement
- xAI Grok 4.3 model and pricing:
  https://docs.x.ai/developers/models/grok-4.3
- xAI current pricing table:
  https://docs.x.ai/developers/pricing
