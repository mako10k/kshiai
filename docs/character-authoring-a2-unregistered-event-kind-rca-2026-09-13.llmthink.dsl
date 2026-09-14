domain CharacterAuthoringA2UnregisteredEventKindRca:
  description "Explain the A2 live invalid_payload without changing schemaVersion 2 meaning or authorizing another paid call."

problem P1:
  "Why did the approved one-call A2 request accept the provider json_schema but fail CharacterDefinitionV2 on observed_event_kind=direct_address, and what is the smallest local repair?"

premise VERSIONING:
  "schemaVersion 2 already rejects unregistered action-norm clause values. The provider-facing grammar must not be looser than that rule. Adding speech reactTo values to observed_event_kind would change runtime matching and is out of scope."

premise VOCABULARY:
  "speechPolicy.reactTo and action-norm observed_event_kind are different closed sets. Runtime observed_event_kind facts are TurnEvent.type values. Being spoken to is utterance, not direct_address."

premise SCOPE:
  "This correction is local. It does not deploy, call a provider, activate schema-3, or rerun A2."

evidence E1:
  "A2 live result classified invalid_payload after HTTP 200. The only reported issue was actionNorms.1.when.clauses.0.value unregistered observed_event_kind value: direct_address. Estimated cost USD 0.047, one call, no retry."

evidence E2:
  "CharacterNormClauseV2Schema stores value as z.string and checks registered values only in superRefine. Zod JSON Schema therefore advertises an unconstrained string to xAI."

evidence E3:
  "speechPolicy.reactTo enumerates direct_address, self_impact, counterpart_impact, ambient_change, and relationship_shift. observed_event_kind enumerates damage, heal, rest, parameter, defend, wait, reflect, status, situation, info, utterance, manifestation, and free_action."

evidence E4:
  "battle-service emits observed_event_kind facts from cognition.observedEvents[].type. TurnEvent.type has no direct_address. A clause with direct_address could never match even if authoring accepted it."

evidence E5:
  "The generateCharacterDefinitionV2 prompt says actionNorms use registered clauses but does not list observed_event_kind values or forbid speech reactTo vocabulary in those clauses."

evidence E6:
  "TurnEvent.type also includes reposition, which is absent from observed_event_kind. That hole did not cause the A2 failure and is not this repair."

decision I1 based_on E1, E2:
  "The provider accepted the request because the json_schema did not encode the already-enforced clause-value registry. Server-side superRefine is detection after the paid call, not the provider contract."

decision I2 based_on E3, E4, E5, VOCABULARY:
  "The model reused the nearby speech trigger direct_address as an action-norm event kind. The registered equivalent for being addressed is utterance. This is vocabulary collision plus missing prompt enumeration, not a missing battle event type."

decision D1 based_on I1, I2, VERSIONING, SCOPE:
  "Keep schemaVersion 2. Replace the string-plus-superRefine clause with a kind-discriminated value enum so the provider grammar matches server registration. Tell the create/fill/repair prompts that speech reactTo is not an observed_event_kind and that being addressed is utterance. Do not add direct_address to observed_event_kind. Do not deploy or pay for a second A2 call."
