domain KshiaiFallbackPoint19:
  description "Restrict missing-basic-attack compatibility to declared legacy reads and carry modern generation provenance into battle state."

problem P19:
  "How should the battle pipeline reject missing modern basic actions without making persisted legacy characters or battles unreadable?"

premise CONTRACT:
  "Character definition V2 requires capabilities.basicAction, and a ready V2 generation is required before a new battle starts."

premise COMPATIBILITY:
  "Persisted legacy character sheets and version-one battle manifests may omit basicAttack and must remain readable through an explicit compatibility boundary."

premise CONTROL:
  "After a character or battle has crossed its declared compatibility boundary, missing basicAttack is invalid current state and must stop rather than synthesize an action."

premise PROVENANCE:
  "A new battle must retain the exact character generation identity from which each required basic action was projected; a legacy default must be labelled as such."

evidence E1:
  "CharacterDefinitionV2Schema already requires capabilities.basicAction, and characterDefinitionV2ToLegacySheet projects it into basicAttack."

evidence E2:
  "The character repository currently calls ensureCharacterCombatProperties while parsing persisted sheets, but the same broadly named helper is also callable outside that legacy read boundary."

evidence E3:
  "buildObserverSafeAvailableActions, resolveTurn, balanceBasicAttack, profile grounding, and battle-service presentation paths currently accept optional basicAttack or substitute a deterministic value."

evidence E4:
  "BattleAssetManifest stores each character generationId and immutable snapshot, but its version-one snapshot schema still permits missing basicAttack and does not state whether a default was introduced."

evidence E5:
  "After correction, shared tests passed 302 of 302, backend tests passed 289 of 289, frontend tests passed 20 of 20, deployment tests passed 3 of 3, and repository typecheck and production build completed successfully."

decision I1 based_on CONTRACT, E1, E3:
  "The normal modern battle path has no legitimate reason to default basicAttack after V2 generation validation; downstream fallbacks conceal a broken handoff contract."

decision I2 based_on COMPATIBILITY, E2:
  "The only legitimate character-sheet default is an explicitly named persisted-legacy hydration operation, not a general runtime normalization helper."

decision I3 based_on PROVENANCE, E4:
  "A versioned battle binding can accept old manifests at the read boundary, label any legacy default, and make all newly emitted bindings strict and generation-linked."

decision D1 based_on P19, I1, I2:
  "Introduce a combat-ready character-sheet type with required basicAttack, rename the defaulting operation as legacy hydration, and require the combat-ready type in action feasibility and battle-engine inputs."

decision D2 based_on I3, COMPATIBILITY:
  "Parse legacy battle-manifest version one through a typed compatibility transform, emit version two for new battles, require combat-ready snapshots there, and store a basic-attack source receipt linked to the character generation or labelled legacy_default."

decision D3 based_on D1, D2, CONTROL:
  "Remove downstream optional basic-attack fallbacks in the touched battle pipeline and add regressions proving modern omission fails, legacy reads are tagged, and new snapshots preserve generation provenance."

decision D4 based_on D3:
  "Run focused tests, repository typecheck, all workspace tests, build, LLMThink audit, diff review, and forbidden-boundary scans before reporting point 19 corrected."

decision RESULT based_on D1, D2, D3, E5:
  "Point 19 is corrected locally: legacy defaults occur only at named compatibility boundaries, modern battle execution requires a basic action, and every new battle binding carries matching character-generation provenance."
