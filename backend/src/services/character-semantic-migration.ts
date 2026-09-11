import {
  CharacterSemanticConsistencyReviewV1Schema,
  type CharacterCompilerCapabilityV1, type CharacterMigrationFinding,
  type CharacterSemanticConsistencyReviewV1,
  type CharacterSemanticMigrationAttemptV1,
} from "@kshiai/shared";
import { beginCharacterSemanticMigrationAttempt } from "../repositories/character-semantic-migration.js";
import {
  CHARACTER_MIGRATION_PROMPT_V4,
  characterMigrationRepairClosure, createCharacterMigrationContext, migrationTargetPaths,
  pathContains, usesCharacterMigrationV3Diagnostics, type CharacterMigrationContext,
} from "./character-migration-context.js";
import {
  characterMigrationOwnerDiff, initialCharacterMigrationMerge,
  mergeCharacterMigrationChangeSet, migrationFinding, migrationPreservationEntries,
  type CharacterMigrationMerge,
} from "./character-migration-merge.js";
import { characterMigrationProviderPayload } from "./character-migration-prompts.js";
import { parseCharacterMigrationResponse } from "./character-migration-response.js";
import { parseCharacterMigrationReview } from "./character-migration-diagnostics.js";
import {
  requestCharacterMigrationStep, type CharacterMigrationProvider,
  type CharacterMigrationRequestResult,
} from "./character-migration-requests.js";
import {
  carryCharacterMigrationDisclosure, validateCharacterMigrationCandidate,
  type CharacterMigrationValidation,
} from "./character-migration-validation.js";

type MigrationRunState = {
  context: CharacterMigrationContext;
  merged: CharacterMigrationMerge;
  findings: CharacterMigrationFinding[];
  closure: string[];
  review: CharacterSemanticConsistencyReviewV1 | null;
  reviewConcerns: CharacterMigrationFinding[];
  reviewClosurePaths: string[];
  validation: CharacterMigrationValidation | null;
  requests: CharacterMigrationRequestResult[];
};

function relatedFindingPath(left: string, right: string): boolean {
  return pathContains(left, right) || pathContains(right, left);
}

function reviewFindingCorroborated(
  review: CharacterMigrationFinding, serverFindings: CharacterMigrationFinding[],
): boolean {
  const related = serverFindings.filter((server) => review.targetPaths.some((target) =>
    server.targetPaths.some((serverTarget) => relatedFindingPath(target, serverTarget))));
  return review.targetPaths.every((target) => related.some((server) =>
    server.targetPaths.some((serverTarget) => relatedFindingPath(target, serverTarget)))) &&
    review.sourcePaths.every((source) => related.some((server) =>
      server.sourcePaths.some((serverSource) => relatedFindingPath(source, serverSource))));
}

function unverifiedReviewConcern(finding: CharacterMigrationFinding): CharacterMigrationFinding {
  return {
    ...finding,
    code: "review_claim_unverified",
    explanation: `Provider review claim '${finding.code}' was not corroborated by an independent server finding and did not authorize repair. ${finding.explanation}`.slice(0, 600),
  };
}

function applyChangeResponse(
  run: MigrationRunState, response: unknown, requestId: string, round: number,
): void {
  const parsed = parseCharacterMigrationResponse(response);
  if (!parsed.changeSet) {
    run.merged.findings = parsed.findings;
    return;
  }
  run.merged = mergeCharacterMigrationChangeSet({
    context: run.context, previous: run.merged, changeSet: parsed.changeSet,
    providerRequestId: requestId, repairClosure: round === 0 ? null : run.closure,
  });
  run.merged.findings.push(...parsed.findings);
  carryCharacterMigrationDisclosure(run.context, run.merged);
}

function applyReviewResponse(run: MigrationRunState, response: unknown): void {
  if (usesCharacterMigrationV3Diagnostics(run.context.attempt.promptIdentity)) {
    const result = parseCharacterMigrationReview(response, run.context, run.merged.candidate);
    run.review = result.review;
    if (run.context.attempt.promptIdentity === CHARACTER_MIGRATION_PROMPT_V4) {
      run.reviewConcerns = [];
      if (!result.review) {
        run.reviewConcerns.push(...result.findings);
        return;
      }
      const serverFindings = [...run.findings];
      for (const finding of result.review.findings) {
        run.reviewClosurePaths.push(...finding.targetPaths, ...finding.semanticDependants);
        if (!reviewFindingCorroborated(finding, serverFindings)) {
          run.reviewConcerns.push(unverifiedReviewConcern(finding));
        }
      }
      return;
    }
    run.findings.push(...result.findings);
    return;
  }
  const parsed = CharacterSemanticConsistencyReviewV1Schema.safeParse(response);
  if (!parsed.success) {
    run.review = null;
    run.findings.push(migrationFinding("review_schema_invalid", "definition.actionNorms",
      "The review response did not satisfy CharacterSemanticConsistencyReviewV1."));
    return;
  }
  const registered = migrationTargetPaths(run.merged.candidate);
  const invalid = parsed.data.findings.some((finding) =>
    [...finding.targetPaths, ...finding.semanticDependants].some((path) => !registered.includes(path)) ||
    finding.sourcePaths.some((path) => !run.context.sourcePaths.includes(path)));
  if (invalid) {
    run.review = null;
    run.findings.push(migrationFinding("review_path_invalid", "definition.actionNorms",
      "Reviewer findings must use registered candidate/source paths."));
    return;
  }
  run.review = parsed.data;
  run.findings.push(...parsed.data.findings);
}

function updateRepairClosure(run: MigrationRunState): void {
  const registered = migrationTargetPaths(run.merged.candidate);
  const reported = [
    ...run.findings.flatMap((finding) => [...finding.targetPaths, ...finding.semanticDependants]),
    ...(usesCharacterMigrationV3Diagnostics(run.context.attempt.promptIdentity)
      ? run.findings.flatMap((finding) => finding.sourcePaths) : []),
    ...run.merged.operations.flatMap((operation) => operation.semanticDependants),
    ...run.reviewClosurePaths,
  ].map((path) => registered.includes(path) ? path :
    registered.filter((parent) => pathContains(parent, path)).at(-1) ??
      (usesCharacterMigrationV3Diagnostics(run.context.attempt.promptIdentity)
        ? "" : "definition.actionNorms"));
  run.closure = characterMigrationRepairClosure(reported, run.merged.candidate);
}

function migrationOutcome(
  run: MigrationRunState,
  status: "awaiting_owner_acceptance" | "review_required" | "provider_failed" | "pending",
) {
  return {
    status,
    migrationAttemptId: run.context.attempt.migrationAttemptId,
    candidate: run.validation?.candidate ?? null,
    draft: run.merged.candidate,
    compatibility: run.validation?.compatibility ?? null,
    findings: [...run.findings, ...run.reviewConcerns],
    semanticReview: run.review,
    uncertainties: [...new Set([
      ...run.merged.uncertainties,
      ...(run.review?.uncertainties ?? []),
      ...(run.reviewConcerns.length > 0
        ? ["Unverified semantic review claims were preserved for owner review and did not authorize repair."]
        : []),
    ])],
    ownerDiff: characterMigrationOwnerDiff(run.context, run.merged),
    preservationEntries: migrationPreservationEntries(run.context, run.merged),
    requests: run.requests,
    repairClosure: run.closure,
    // Candidate/receipt acceptance and CAS activation belong to B6, not this service.
    activated: false,
  };
}
export type CharacterSemanticMigrationResult = ReturnType<typeof migrationOutcome>;

async function executeStep(input: {
  run: MigrationRunState;
  round: number;
  review: boolean;
  provider: CharacterMigrationProvider;
}): Promise<CharacterMigrationRequestResult> {
  const { run, round, review } = input;
  const kind = review ? (round === 0 ? "semantic_review" : "semantic_rereview") :
    (round === 0 ? "initial_generation" : "semantic_repair");
  const response = await requestCharacterMigrationStep({
    attempt: run.context.attempt, ordinal: round * 2 + (review ? 2 : 1), kind,
    payload: characterMigrationProviderPayload({
      context: run.context, state: run.merged, kind,
      findings: run.findings, repairClosure: run.closure,
    }),
    provider: input.provider,
  });
  run.requests.push(response);
  return response;
}

export async function generateCharacterSemanticMigration(input: {
  attempt: CharacterSemanticMigrationAttemptV1;
  provider: CharacterMigrationProvider;
  availableCapabilities: CharacterCompilerCapabilityV1[];
}): Promise<CharacterSemanticMigrationResult> {
  // Pure source/schema/prompt checks precede persistence and any provider work.
  const context = createCharacterMigrationContext(input.attempt);
  await beginCharacterSemanticMigrationAttempt(input.attempt);
  const run: MigrationRunState = {
    context, merged: initialCharacterMigrationMerge(context), findings: [],
    closure: [], review: null, reviewConcerns: [], reviewClosurePaths: [],
    validation: null, requests: [],
  };
  for (let round = 0; round <= 2; round += 1) {
    const generation = await executeStep({ run, round, review: false, provider: input.provider });
    if (generation.status === "pending") return migrationOutcome(run, "pending");
    if (generation.receipt.outcome === "failed") return migrationOutcome(run, "provider_failed");
    applyChangeResponse(run, generation.receipt.response, generation.request.providerRequestId, round);
    run.validation = validateCharacterMigrationCandidate({
      context, state: run.merged, availableCapabilities: input.availableCapabilities,
    });
    run.findings = [...run.validation.findings];
    // Always review the entire merged candidate, including structurally valid neighbours.
    const review = await executeStep({ run, round, review: true, provider: input.provider });
    if (review.status === "pending") return migrationOutcome(run, "pending");
    if (review.receipt.outcome === "failed") return migrationOutcome(run, "provider_failed");
    applyReviewResponse(run, review.receipt.response);
    updateRepairClosure(run);
    if (run.findings.length === 0 && run.review?.verdict === "consistent") {
      return migrationOutcome(run, run.validation.compatibility?.status === "ready" ?
        "awaiting_owner_acceptance" : "review_required");
    }
    if (run.findings.length === 0 && run.reviewConcerns.length > 0) {
      return migrationOutcome(run, "review_required");
    }
    if (run.review?.verdict === "unresolved") return migrationOutcome(run, "review_required");
  }
  return migrationOutcome(run, "review_required");
}
