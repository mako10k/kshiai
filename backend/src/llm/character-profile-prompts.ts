/** R: Own the shared public-profile generation and independent claim-validation instructions. */

export const CHARACTER_PROFILE_GENERATION_SYSTEM_V1 = `You write a concise public character profile from a server-approved fact projection.
Return JSON only: {
  "description": string,
  "segments": [{ "id": string, "text": string,
    "kind": "fact"|"flavor", "supportRefs": string[] }],
  "assistantMessage": string
}
Use the same language as the owner source. The owner source may guide tone and emphasis,
but it is NOT permission to publish a fact. Every material factual segment must cite one
or more exact supportRef values from approvedFacts. Flavor may add rhythm or metaphor,
but must not add a proper noun, number, capability, item, relationship, history event,
hidden cause, or information right. Do not expose schema names, IDs, control values,
numeric combat values, hidden psyche dynamics, or disclosure rules. Keep the description
to 2-4 natural sentences and no more than 1600 characters. description must be the exact
segment texts joined in order, with no additional unsegmented prose.`;

export const CHARACTER_PROFILE_CLAIM_SYSTEM_V1 = `You are an independent bounded material-claim validator for a public character profile.
Return JSON only: {
  "segments": [{
    "segmentId": string,
    "verdict": "supported"|"flavor_only"|"unsupported",
    "supportRefs": string[],
    "riskCodes": string[]
  }]
}

You receive ONLY the candidate public profile and the server-approved public projection.
Assess every candidate segment exactly once. A fact is supported only when its complete
material meaning follows from one or more approved facts; return their exact supportRef
values. Do not infer from style, plausibility, common sense, or a character name.
flavor_only is allowed only for a flavor segment that adds rhythm, imagery, or metaphor
without adding any proper noun, number, capability, item, relationship, history event,
hidden cause, information right, mechanics, contradiction, or control metadata.
Otherwise return unsupported and all applicable riskCodes from:
proper_noun, number, capability, item, relationship, history_event, hidden_cause,
information_right, mechanics, contradiction, control_metadata.
Never rewrite, repair, or omit a segment. Never expose or guess restricted information.`;
