domain CharacterAuthoringAndSelectionRca:
  description "Restore current character creation and selection while keeping persisted schema meaning and conscious/action terminology explicit."

problem P1:
  "What mechanisms create the current production character-authoring schema failure and the one-character match selector, and what is the smallest correct repair boundary?"

premise VERSIONING:
  "Immutable persisted schema and compiler version identifiers must retain their recorded meaning; a stricter rule requires a new version or an explicit compatibility disposition."

premise AUTHORITY:
  "An implementation request authorizes correction work but does not by itself accept an exact new architecture revision under repository ADR rules."

premise ACTION_NORM:
  "An executable action norm selects at least one action reference, action kind, or tactic tag; a selectorless soft statement can guide conscious interpretation but cannot constrain or rank an action."

premise SCOPE:
  "Production inspection is read-only; deployment and production data mutation remain separately authorized effects."

evidence E1:
  "Production health returned revision kshiai-api-00141-vis, and Cloud Run reports that revision at 100 percent traffic."

evidence E2:
  "The newest production create attempt for the owner failed with xAI HTTP 400 Unsupported response format because self referenced definitions are not supported."

evidence E3:
  "Before commit 3794fbc, create and revision requests used the smaller fill response schema. That commit routed them through the complete CharacterDefinitionV2 response schema and retained only upgrade on the fill path."

evidence E4:
  "A local response-schema inspection found five direct self-referenced definitions for reach, sight, mobility, speech, and held-object constraints. The corresponding constraints properties are concrete string or boolean schemas and are different objects; the original replacement source is not self-referential."

evidence E5:
  "A production read-only transaction found twenty-five active owner characters: sixteen have no character asset state; nine point to a current schema-2 generation with persisted status ready. Current compatibility evaluation keeps only Takumi ready and returns invalid_action_norm_selector for the other eight."

evidence E6:
  "Those eight generations were activated as V2 before the selector rule and contain twenty-one selectorless norms, all soft prefer norms with force preference or commitment; no selectorless constraint was observed."

evidence E7:
  "The match page requests GET /api/characters with selectable=true, and the backend filters the evaluated selectable flag, producing the one-character dropdown."

evidence E8:
  "The V2 compiler and readiness checks were strengthened without changing schemaVersion 2 or the character-action-norm compiler version 2."

evidence E9:
  "ADR-0010 requires explicit compatibility state, ready compiler-compatible generations, immutable generations, and backend eligibility enforcement; it does not authorize silently rewriting an existing generation."

evidence E10:
  "Commit 3794fbc replaced an identity-preserving schemaRecord helper with schemaObject returning OpenAiJsonSchemaObjectSchema.parse(value). Zod object parsing returns a copy, so nestedSchema returned a detached definitions object; normalization and its self-reference check changed that copy while the untouched root schema was returned to the provider."

evidence E11:
  "The lockfile resolves OpenAI 5.23.2 and Zod 3.25.76 at the original schema repair, both 2026-09-06 and 2026-09-07 code states, and production commit 1cdf210. A dependency upgrade does not distinguish the working and failing paths."

evidence E12:
  "Before 3794fbc, the fill contract requested only action-norm id, statement, force, and awareness. The server stored soft preference and commitment entries with no selectors. Compiler-v2 accepted them: they matched and ranked no actions but supplied their awareness-gated statements as consciousActionPrinciples."

evidence E13:
  "The local creation correction preserves the traversed schema object identity and reuses the generated concrete constraint properties. Its provider-facing acyclic-schema regression passes, all 353 backend tests pass, repository typecheck passes, and Lizard 1.23.0 reports zero threshold warnings for the changed production and test files."

pending U1:
  "Whether a new long-term schema should store conscious-only principles in a dedicated field instead of the legacy selectorless actionNorm location remains an owner architecture decision."

pending U2:
  "A real xAI request with the corrected response schema has not yet been executed."

decision I1 based_on E2, E4, E10, E11:
  "The creation root cause is identity loss in schema traversal: normalization operated on Zod-parsed copies and returned an unmodified root containing the provider-rejected definitions. Routing create through that full schema was the incident trigger; the provider rejection and missing outgoing-schema test are detection, not source causes."

decision I2 based_on E5, E7, E8, E12, VERSIONING:
  "The dropdown root cause is a semantic-version collision: one actionNorms entry represented both executable action selection and conscious-only guidance without a discriminator, then the stricter runtime treated every entry as executable under unchanged schema-v2 and compiler-v2 identifiers and reapplied that new meaning to immutable ready generations. It is not missing character rows or a frontend search defect."

decision I3 based_on E6, ACTION_NORM:
  "The affected persisted values also expose terminology debt: they are stored as action norms but act only as conscious guidance because they have no executable selector."

decision D1 based_on I1, E4:
  "Preserve object identity after schema validation, apply the existing generated concrete-property replacement to the returned schema, and regression-check the actual provider-facing response schema for direct or transitive definition cycles. Do not duplicate the authoritative constraint schemas by hand."

decision D2 based_on I2, I3, E9, AUTHORITY, U1:
  "Before changing selection semantics, issue a versioned compatibility and terminology ADR that distinguishes executable action norms, legacy conscious-only guidance, and new-authoring activation rules, and obtain owner acceptance of its exact revision."

decision D3 based_on D2, SCOPE:
  "Do not mutate existing production generations; the implementation candidate may preserve recorded V2 behavior through a bounded reader/compiler compatibility path and require selectors for newly activated authoring candidates, subject to the accepted ADR."

decision D4 based_on P1, D1, D2, E1, E13, U2, SCOPE:
  "The creation source correction is locally verified. Keep the selection change at the exact requirement and ADR acceptance boundary, and keep provider replay, commit, push, deployment, and production writes outside this action unless separately authorized."
