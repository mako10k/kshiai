domain KshiaiFallbackPoint18:
  description "Separate absent legacy battlefield seeds from invalid or intentionally empty structured seeds."

problem P18:
  "How should battle semantic-state initialization preserve legacy compatibility without concealing invalid modern seed or generated state?"

premise CONTRACT:
  "Legacy BattlefieldInstance rows may omit semanticSeed, while the deterministic V2 battlefield compiler emits both compilerContract and semanticSeed."

premise CONTROL:
  "Only absent legacy input may use obstacle-derived compatibility data. Present invalid structured input and invalid deterministic output are application defects and must stop."

premise COMPATIBILITY:
  "Persisted semantic states created before provenance was added must remain readable, but every newly created semantic state must identify its initialization source."

evidence E1:
  "createBattleSemanticState currently passes seed null or undefined as an empty object to safeParse and maps parse failure to null."

evidence E2:
  "The same function replaces both a missing seed and a valid seed with zero entities by obstacle-derived entities."

evidence E3:
  "When the assembled semantic state fails validation, the function currently returns a two-character minimal state and discards the failure."

evidence E4:
  "BattlefieldInstanceSchema validates any present semanticSeed, and compileBattlefieldInstanceV2 always supplies a structured seed and compiler contract."

evidence E5:
  "After the correction, focused semantic-state tests, repository typecheck, all workspace tests, and the production build completed successfully."

decision I1 based_on CONTRACT, E1, E4:
  "Seed absence is the bounded legacy compatibility trigger; a present seed must be parsed successfully and used exactly, including an intentionally empty entity map."

decision I2 based_on CONTROL, E3:
  "A deterministic candidate validation failure has no accepted continuation substitute and must throw with its bounded validation code and message."

decision D1 based_on P18, I1, I2, COMPATIBILITY:
  "Parse present seeds strictly, derive obstacle entities only when the seed is absent, add optional persisted initializationSource provenance for old-state compatibility, and set it on every newly created state."

decision D2 based_on D1, E2:
  "Add regressions for structured seed provenance, absent legacy obstacle provenance, intentionally empty structured seed preservation, invalid present seed rejection, and invalid assembled-state rejection."

decision D3 based_on D1, D2:
  "Run focused shared tests, typecheck, all workspace tests, build, LLMThink audit, diff checks, and forbidden-boundary scans before reporting point 18 complete."

decision RESULT based_on D1, D2, E5:
  "Point 18 is corrected locally: only absent seeds use tagged legacy obstacle compatibility, while present invalid seeds and invalid assembled semantic states stop explicitly."
