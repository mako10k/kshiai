import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ConflictHandlingApplicabilityInputSchema,
  ConflictHandlingTriggerKindSchema,
} from "@kshiai/shared";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const FIXTURE_VERSION = "battle-pipeline-conflict-handling-held-out-v1";
const PROTOCOL_PATH =
  "docs/battle-pipeline-conflict-handling-generalization-protocol.md";
const BUILDER_PATH =
  "backend/src/scripts/build-battle-conflict-handling-held-out-corpus.ts";
const PARENT_EVALUATION_PATH =
  "docs/evidence/battle-pipeline-conflict-handling-applicability-evaluation-2026-08-06.json";
const PARENT_EVALUATION_CONTENT_DIGEST =
  "9618c8153f3b7d169749b78d2f708aef66e662da381bd8d727df29968588449f";

const frozenLineage = [
  {
    path: PROTOCOL_PATH,
    fileSha256:
      "11778eff2ded466a676d2ed0faa79181235e24c54e5480464adbdded0859519f",
  },
  {
    path: "docs/battle-pipeline-conflict-handling-applicability-decision.md",
    fileSha256:
      "7cd27aac40a43a32db7258411624260d119ee435bb76f4c499ed0b98dc25fac5",
  },
  {
    path: PARENT_EVALUATION_PATH,
    fileSha256:
      "facb46a9034a2c1cb81d1e7367d931c9f23e6e39ffb7b5826db90f0da58ed3fc",
  },
  {
    path: "packages/shared/src/battle-conflict-handling-applicability.ts",
    fileSha256:
      "f8561c8cda612d75ee5d6af592a1547d7cfbf5ad8d565c72baab75cd729b7905",
  },
  {
    path: "backend/src/scripts/evaluate-battle-conflict-handling-applicability.ts",
    fileSha256:
      "278a4386d779472f4e671ef3d5508e3ee19405fadbffad2ed6e76610b4e34134",
  },
  {
    path: "backend/src/scripts/build-battle-conflict-handling-applicability-receipts.ts",
    fileSha256:
      "8b9c2a8f663f59c1c801011c761368e85f630c50870323f60921d03a6566cf4e",
  },
] as const;

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const FileEvidenceSchema = z.object({
  path: z.string().min(1),
  fileSha256: DigestSchema,
}).strict();
const FamilySchema = z.enum([
  "no_trigger",
  "selected_fallback",
  "contested_claim",
  "conflicted_read",
  "degraded",
  "exhausted",
  "interference",
]);
const ExpectedSchema = z.object({
  triggerKinds: z.array(ConflictHandlingTriggerKindSchema).max(5),
  applicability: z.enum(["not_applicable", "required"]),
  handling: z.enum(["not_applicable", "handled", "missing"]),
  availability: z.enum(["unavailable", "available"]),
  disposition: z.enum([
    "unavailable",
    "not_needed",
    "used",
    "available_unhandled",
  ]),
}).strict().superRefine((value, ctx) => {
  if (
    new Set(value.triggerKinds).size !== value.triggerKinds.length ||
    value.triggerKinds.some((kind, index) =>
      index > 0 && value.triggerKinds[index - 1]!.localeCompare(kind) >= 0
    )
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["triggerKinds"],
      message: "expected trigger kinds must be sorted and unique",
    });
  }
});

const HeldOutCaseSchema = z.object({
  caseId: z.string().regex(/^[NSCRDBM][0-9]{2}$/u),
  family: FamilySchema,
  input: ConflictHandlingApplicabilityInputSchema,
  expected: ExpectedSchema,
}).strict();

const IntegrationControlSchema = z.object({
  controlId: z.string().regex(/^I0[1-6]$/u),
  baseScenarioId: z.enum([
    "ordinary_fast_action",
    "remote_rejection",
    "interrupted_expanded_action",
    "blocking_local_conflict",
    "exhausted_budget",
  ]),
  allowedFallbacks: z.array(z.enum([
    "defense",
    "intermediate",
    "weak",
    "unknown",
  ])).max(4),
  expected: ExpectedSchema,
}).strict();

const RegisteredDistributionSchema = z.object({
  total: z.literal(30),
  notApplicable: z.literal(4),
  required: z.literal(26),
  handled: z.literal(18),
  missing: z.literal(8),
  handlingNotApplicable: z.literal(4),
  dispositionUnavailable: z.literal(6),
  dispositionNotNeeded: z.literal(3),
  dispositionUsed: z.literal(14),
  dispositionAvailableUnhandled: z.literal(7),
  multiTriggerInterference: z.literal(6),
  integrationControls: z.literal(6),
}).strict();

const CorpusWithoutIntegritySchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("conflict_handling_held_out_corpus"),
  fixtureVersion: z.literal(FIXTURE_VERSION),
  builtAt: z.string().datetime(),
  provenance: z.object({
    protocol: FileEvidenceSchema,
    builder: FileEvidenceSchema,
    frozenLineage: z.array(FileEvidenceSchema).length(6),
    parentEvaluationContentDigest: z.literal(
      PARENT_EVALUATION_CONTENT_DIGEST,
    ),
  }).strict(),
  oracle: z.object({
    mode: z.literal("literal_pre_registered_expected"),
    expectedDerivedFromClassifierOutput: z.literal(false),
    classifierInvokedDuringConstruction: z.literal(false),
    enricherInvokedDuringConstruction: z.literal(false),
  }).strict(),
  cases: z.array(HeldOutCaseSchema).length(30),
  integrationControls: z.array(IntegrationControlSchema).length(6),
  registeredDistribution: RegisteredDistributionSchema,
  boundaries: z.object({
    frozenLineageVerified: z.literal(true),
    sourceMutationCount: z.literal(0),
    authoritativeOutcomeChangeCount: z.literal(0),
    legacyReceiptMutationCount: z.literal(0),
    canonicalCommitCount: z.literal(0),
    externalLlmCallsMade: z.literal(0),
    xaiCallsMade: z.literal(0),
  }).strict(),
}).strict();

export const ConflictHandlingHeldOutCorpusSchema =
  CorpusWithoutIntegritySchema.extend({
    integrity: z.object({
      algorithm: z.literal("sha256"),
      basis: z.literal("canonical corpus excluding integrity"),
      contentDigest: DigestSchema,
    }).strict(),
  }).strict().superRefine((value, ctx) => {
    const caseIds = value.cases.map((fixture) => fixture.caseId);
    const controlIds = value.integrationControls.map((control) =>
      control.controlId
    );
    if (new Set(caseIds).size !== caseIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cases"],
        message: "case IDs must be unique",
      });
    }
    if (new Set(controlIds).size !== controlIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["integrationControls"],
        message: "integration control IDs must be unique",
      });
    }
  });
export type ConflictHandlingHeldOutCorpus = z.infer<
  typeof ConflictHandlingHeldOutCorpusSchema
>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return sha256(JSON.stringify(canonicalize(value)));
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function fileEvidence(relativePath: string): Promise<z.infer<
  typeof FileEvidenceSchema
>> {
  const source = await fs.readFile(path.join(repositoryRoot, relativePath));
  return FileEvidenceSchema.parse({
    path: relativePath,
    fileSha256: sha256(source),
  });
}

function parsedCase(
  raw: z.input<typeof HeldOutCaseSchema>,
): z.infer<typeof HeldOutCaseSchema> {
  return HeldOutCaseSchema.parse(raw);
}

const cases: Array<z.infer<typeof HeldOutCaseSchema>> = [
  parsedCase({
    caseId: "N01",
    family: "no_trigger",
    input: {
      allowedFallbacks: [],
      proposals: [],
      adaptive: { status: "skipped" },
      reads: [],
      issues: [],
    },
    expected: {
      triggerKinds: [],
      applicability: "not_applicable",
      handling: "not_applicable",
      availability: "unavailable",
      disposition: "unavailable",
    },
  }),
  parsedCase({
    caseId: "N02",
    family: "no_trigger",
    input: {
      allowedFallbacks: ["unknown"],
      proposals: [],
      adaptive: { status: "skipped" },
      reads: [],
      issues: [],
    },
    expected: {
      triggerKinds: [],
      applicability: "not_applicable",
      handling: "not_applicable",
      availability: "available",
      disposition: "not_needed",
    },
  }),
  parsedCase({
    caseId: "N03",
    family: "no_trigger",
    input: {
      allowedFallbacks: ["intermediate", "unknown"],
      proposals: [{ proposalRef: "proposal.N03", actionKind: "custom" }],
      adaptive: {
        status: "executed",
        contestedClaimRefs: [],
        receipts: [{
          proposalRef: "proposal.N03",
          resolution: "expanded",
          outcome: "partial",
          failureReason: "precondition_failed",
        }],
      },
      reads: [],
      issues: [],
    },
    expected: {
      triggerKinds: [],
      applicability: "not_applicable",
      handling: "not_applicable",
      availability: "available",
      disposition: "not_needed",
    },
  }),
  parsedCase({
    caseId: "N04",
    family: "no_trigger",
    input: {
      allowedFallbacks: ["defense"],
      proposals: [{ proposalRef: "proposal.N04", actionKind: "custom" }],
      adaptive: {
        status: "executed",
        contestedClaimRefs: [],
        receipts: [{
          proposalRef: "proposal.N04",
          resolution: "fast",
          outcome: "completed",
        }],
      },
      reads: [],
      issues: [],
    },
    expected: {
      triggerKinds: [],
      applicability: "not_applicable",
      handling: "not_applicable",
      availability: "available",
      disposition: "not_needed",
    },
  }),
  ...[
    ["S01", ["defense"]],
    ["S02", ["defense", "intermediate"]],
    ["S03", ["defense", "weak"]],
    ["S04", ["defense", "unknown"]],
  ].map(([caseId, allowedFallbacks]) => parsedCase({
    caseId: caseId as string,
    family: "selected_fallback",
    input: {
      allowedFallbacks: allowedFallbacks as Array<
        "defense" | "intermediate" | "weak" | "unknown"
      >,
      proposals: [{
        proposalRef: `proposal.${caseId as string}.defense`,
        actionKind: "defense",
      }],
      adaptive: {
        status: "executed",
        contestedClaimRefs: [],
        receipts: [{
          proposalRef: `proposal.${caseId as string}.defense`,
          resolution: "fast",
          outcome: "completed",
        }],
      },
      reads: [],
      issues: [],
    },
    expected: {
      triggerKinds: ["selected_fallback_proposal"],
      applicability: "required",
      handling: "handled",
      availability: "available",
      disposition: "used",
    },
  })),
  parsedCase({
    caseId: "C01",
    family: "contested_claim",
    input: contestedInput("C01", [], undefined),
    expected: {
      triggerKinds: ["contested_claim"],
      applicability: "required",
      handling: "missing",
      availability: "unavailable",
      disposition: "unavailable",
    },
  }),
  parsedCase({
    caseId: "C02",
    family: "contested_claim",
    input: contestedInput("C02", ["unknown"], undefined),
    expected: {
      triggerKinds: ["contested_claim"],
      applicability: "required",
      handling: "missing",
      availability: "available",
      disposition: "available_unhandled",
    },
  }),
  parsedCase({
    caseId: "C03",
    family: "contested_claim",
    input: contestedInput("C03", ["unknown"], {
      factRef: "fact.C03.unknown",
      strength: "unknown",
    }),
    expected: {
      triggerKinds: ["contested_claim"],
      applicability: "required",
      handling: "handled",
      availability: "available",
      disposition: "used",
    },
  }),
  parsedCase({
    caseId: "C04",
    family: "contested_claim",
    input: contestedInput("C04", ["weak"], {
      factRef: "fact.C04.weak",
      strength: "weak",
    }),
    expected: {
      triggerKinds: ["contested_claim"],
      applicability: "required",
      handling: "handled",
      availability: "available",
      disposition: "used",
    },
  }),
  parsedCase({
    caseId: "R01",
    family: "conflicted_read",
    input: conflictedReadInput("R01", [], false, undefined),
    expected: {
      triggerKinds: ["conflicted_read"],
      applicability: "required",
      handling: "handled",
      availability: "unavailable",
      disposition: "unavailable",
    },
  }),
  parsedCase({
    caseId: "R02",
    family: "conflicted_read",
    input: conflictedReadInput("R02", ["unknown"], false, undefined),
    expected: {
      triggerKinds: ["conflicted_read"],
      applicability: "required",
      handling: "handled",
      availability: "available",
      disposition: "available_unhandled",
    },
  }),
  parsedCase({
    caseId: "R03",
    family: "conflicted_read",
    input: conflictedReadInput("R03", ["unknown"], true, undefined),
    expected: {
      triggerKinds: ["conflicted_read"],
      applicability: "required",
      handling: "handled",
      availability: "available",
      disposition: "available_unhandled",
    },
  }),
  parsedCase({
    caseId: "R04",
    family: "conflicted_read",
    input: conflictedReadInput("R04", ["unknown"], false, {
      factRef: "fact.R04.unknown",
      strength: "unknown",
    }),
    expected: {
      triggerKinds: ["conflicted_read"],
      applicability: "required",
      handling: "handled",
      availability: "available",
      disposition: "used",
    },
  }),
  parsedCase({
    caseId: "D01",
    family: "degraded",
    input: degradedInput("D01", [], "invalid_character_plan", undefined),
    expected: {
      triggerKinds: ["degraded_indeterminate"],
      applicability: "required",
      handling: "missing",
      availability: "unavailable",
      disposition: "unavailable",
    },
  }),
  parsedCase({
    caseId: "D02",
    family: "degraded",
    input: degradedInput(
      "D02",
      ["unknown"],
      "invalid_character_plan",
      undefined,
    ),
    expected: {
      triggerKinds: ["degraded_indeterminate"],
      applicability: "required",
      handling: "missing",
      availability: "available",
      disposition: "available_unhandled",
    },
  }),
  parsedCase({
    caseId: "D03",
    family: "degraded",
    input: degradedInput("D03", ["unknown"], "invalid_character_plan", {
      factRef: "fact.D03.unknown",
      strength: "unknown",
    }),
    expected: {
      triggerKinds: ["degraded_indeterminate"],
      applicability: "required",
      handling: "handled",
      availability: "available",
      disposition: "used",
    },
  }),
  parsedCase({
    caseId: "D04",
    family: "degraded",
    input: {
      ...degradedInput(
        "D04",
        ["unknown"],
        "invalid_character_plan",
        undefined,
      ),
      reads: [{
        sliceRef: "slice.D04",
        consistencyLevel: "conflicted",
        blockingIssueRefs: [],
      }],
    },
    expected: {
      triggerKinds: ["conflicted_read", "degraded_indeterminate"],
      applicability: "required",
      handling: "handled",
      availability: "available",
      disposition: "available_unhandled",
    },
  }),
  parsedCase({
    caseId: "B01",
    family: "exhausted",
    input: degradedInput("B01", [], "budget_exhausted", undefined),
    expected: {
      triggerKinds: ["budget_exhausted", "degraded_indeterminate"],
      applicability: "required",
      handling: "missing",
      availability: "unavailable",
      disposition: "unavailable",
    },
  }),
  parsedCase({
    caseId: "B02",
    family: "exhausted",
    input: degradedInput(
      "B02",
      ["intermediate"],
      "budget_exhausted",
      undefined,
    ),
    expected: {
      triggerKinds: ["budget_exhausted", "degraded_indeterminate"],
      applicability: "required",
      handling: "missing",
      availability: "available",
      disposition: "available_unhandled",
    },
  }),
  parsedCase({
    caseId: "B03",
    family: "exhausted",
    input: degradedInput("B03", ["intermediate"], "budget_exhausted", {
      factRef: "fact.B03.intermediate",
      strength: "intermediate",
    }),
    expected: {
      triggerKinds: ["budget_exhausted", "degraded_indeterminate"],
      applicability: "required",
      handling: "handled",
      availability: "available",
      disposition: "used",
    },
  }),
  parsedCase({
    caseId: "B04",
    family: "exhausted",
    input: degradedInput("B04", ["weak"], "budget_exhausted", {
      factRef: "fact.B04.weak",
      strength: "weak",
    }),
    expected: {
      triggerKinds: ["budget_exhausted", "degraded_indeterminate"],
      applicability: "required",
      handling: "handled",
      availability: "available",
      disposition: "used",
    },
  }),
  parsedCase({
    caseId: "M01",
    family: "interference",
    input: {
      allowedFallbacks: ["defense"],
      proposals: [{
        proposalRef: "proposal.M01.defense",
        actionKind: "defense",
      }],
      adaptive: {
        status: "executed",
        contestedClaimRefs: ["claim.M01"],
        receipts: [{
          proposalRef: "proposal.M01.defense",
          resolution: "fast",
          outcome: "completed",
        }],
      },
      reads: [],
      issues: [],
    },
    expected: {
      triggerKinds: ["contested_claim", "selected_fallback_proposal"],
      applicability: "required",
      handling: "missing",
      availability: "available",
      disposition: "used",
    },
  }),
  parsedCase({
    caseId: "M02",
    family: "interference",
    input: {
      ...contestedInput("M02", [], undefined),
      reads: [{
        sliceRef: "slice.M02",
        consistencyLevel: "conflicted",
        blockingIssueRefs: [],
      }],
    },
    expected: {
      triggerKinds: ["conflicted_read", "contested_claim"],
      applicability: "required",
      handling: "handled",
      availability: "unavailable",
      disposition: "unavailable",
    },
  }),
  parsedCase({
    caseId: "M03",
    family: "interference",
    input: degradedInput("M03", ["unknown"], "budget_exhausted", {
      factRef: "fact.M03.unknown",
      strength: "unknown",
    }),
    expected: {
      triggerKinds: ["budget_exhausted", "degraded_indeterminate"],
      applicability: "required",
      handling: "handled",
      availability: "available",
      disposition: "used",
    },
  }),
  parsedCase({
    caseId: "M04",
    family: "interference",
    input: {
      allowedFallbacks: ["defense"],
      proposals: [
        { proposalRef: "proposal.M04.defense", actionKind: "defense" },
        { proposalRef: "proposal.M04.degraded", actionKind: "custom" },
      ],
      adaptive: {
        status: "executed",
        contestedClaimRefs: [],
        receipts: [
          {
            proposalRef: "proposal.M04.defense",
            resolution: "fast",
            outcome: "completed",
          },
          {
            proposalRef: "proposal.M04.degraded",
            resolution: "degraded",
            outcome: "indeterminate",
            failureReason: "invalid_character_plan",
          },
        ],
      },
      reads: [],
      issues: [],
    },
    expected: {
      triggerKinds: [
        "degraded_indeterminate",
        "selected_fallback_proposal",
      ],
      applicability: "required",
      handling: "missing",
      availability: "available",
      disposition: "used",
    },
  }),
  parsedCase({
    caseId: "M05",
    family: "interference",
    input: {
      allowedFallbacks: ["unknown"],
      proposals: [{ proposalRef: "proposal.M05", actionKind: "custom" }],
      adaptive: {
        status: "executed",
        contestedClaimRefs: ["claim.M05"],
        receipts: [{
          proposalRef: "proposal.M05",
          resolution: "degraded",
          outcome: "indeterminate",
          failureReason: "invalid_character_plan",
        }],
      },
      reads: [{
        sliceRef: "slice.M05",
        consistencyLevel: "conflicted",
        blockingIssueRefs: ["issue.M05"],
      }],
      issues: [{ issueRef: "issue.M05", status: "open" }],
    },
    expected: {
      triggerKinds: [
        "conflicted_read",
        "contested_claim",
        "degraded_indeterminate",
      ],
      applicability: "required",
      handling: "handled",
      availability: "available",
      disposition: "available_unhandled",
    },
  }),
  parsedCase({
    caseId: "M06",
    family: "interference",
    input: {
      allowedFallbacks: ["defense", "unknown"],
      proposals: [
        { proposalRef: "proposal.M06.defense", actionKind: "defense" },
        { proposalRef: "proposal.M06.exhausted", actionKind: "custom" },
      ],
      adaptive: {
        status: "executed",
        contestedClaimRefs: ["claim.M06"],
        receipts: [
          {
            proposalRef: "proposal.M06.defense",
            resolution: "fast",
            outcome: "completed",
          },
          {
            proposalRef: "proposal.M06.exhausted",
            resolution: "degraded",
            outcome: "indeterminate",
            failureReason: "budget_exhausted",
            fallbackFact: {
              factRef: "fact.M06.unknown",
              strength: "unknown",
            },
          },
        ],
      },
      reads: [{
        sliceRef: "slice.M06",
        consistencyLevel: "conflicted",
        blockingIssueRefs: ["issue.M06"],
      }],
      issues: [{ issueRef: "issue.M06", status: "open" }],
    },
    expected: {
      triggerKinds: [
        "budget_exhausted",
        "conflicted_read",
        "contested_claim",
        "degraded_indeterminate",
        "selected_fallback_proposal",
      ],
      applicability: "required",
      handling: "handled",
      availability: "available",
      disposition: "used",
    },
  }),
];

function contestedInput(
  caseId: string,
  allowedFallbacks: Array<"defense" | "intermediate" | "weak" | "unknown">,
  fallbackFact: {
    factRef: string;
    strength: "intermediate" | "weak" | "unknown";
  } | undefined,
): z.input<typeof ConflictHandlingApplicabilityInputSchema> {
  return {
    allowedFallbacks,
    proposals: [{ proposalRef: `proposal.${caseId}`, actionKind: "custom" }],
    adaptive: {
      status: "executed",
      contestedClaimRefs: [`claim.${caseId}`],
      receipts: [{
        proposalRef: `proposal.${caseId}`,
        resolution: "expanded",
        outcome: "attempted_failed",
        failureReason: "simultaneous_conflict",
        ...(fallbackFact ? { fallbackFact } : {}),
      }],
    },
    reads: [],
    issues: [],
  };
}

function conflictedReadInput(
  caseId: string,
  allowedFallbacks: Array<"defense" | "intermediate" | "weak" | "unknown">,
  withIssue: boolean,
  fallbackFact: {
    factRef: string;
    strength: "intermediate" | "weak" | "unknown";
  } | undefined,
): z.input<typeof ConflictHandlingApplicabilityInputSchema> {
  const issueRef = `issue.${caseId}`;
  const adaptive = fallbackFact
    ? {
        status: "executed" as const,
        contestedClaimRefs: [],
        receipts: [{
          proposalRef: `proposal.${caseId}`,
          resolution: "coarse" as const,
          outcome: "partial" as const,
          fallbackFact,
        }],
      }
    : { status: "skipped" as const };
  return {
    allowedFallbacks,
    proposals: fallbackFact
      ? [{ proposalRef: `proposal.${caseId}`, actionKind: "custom" as const }]
      : [],
    adaptive,
    reads: [{
      sliceRef: `slice.${caseId}`,
      consistencyLevel: "conflicted",
      blockingIssueRefs: withIssue ? [issueRef] : [],
    }],
    issues: withIssue ? [{ issueRef, status: "open" }] : [],
  };
}

function degradedInput(
  caseId: string,
  allowedFallbacks: Array<"defense" | "intermediate" | "weak" | "unknown">,
  failureReason: "invalid_character_plan" | "budget_exhausted",
  fallbackFact: {
    factRef: string;
    strength: "intermediate" | "weak" | "unknown";
  } | undefined,
): z.input<typeof ConflictHandlingApplicabilityInputSchema> {
  return {
    allowedFallbacks,
    proposals: [{ proposalRef: `proposal.${caseId}`, actionKind: "custom" }],
    adaptive: {
      status: "executed",
      contestedClaimRefs: [],
      receipts: [{
        proposalRef: `proposal.${caseId}`,
        resolution: "degraded",
        outcome: "indeterminate",
        failureReason,
        ...(fallbackFact ? { fallbackFact } : {}),
      }],
    },
    reads: [],
    issues: [],
  };
}

const integrationControls: Array<z.infer<typeof IntegrationControlSchema>> = [
  {
    controlId: "I01",
    baseScenarioId: "ordinary_fast_action",
    allowedFallbacks: ["unknown"],
    expected: {
      triggerKinds: [],
      applicability: "not_applicable",
      handling: "not_applicable",
      availability: "available",
      disposition: "not_needed",
    },
  },
  {
    controlId: "I02",
    baseScenarioId: "interrupted_expanded_action",
    allowedFallbacks: [],
    expected: {
      triggerKinds: [],
      applicability: "not_applicable",
      handling: "not_applicable",
      availability: "unavailable",
      disposition: "unavailable",
    },
  },
  {
    controlId: "I03",
    baseScenarioId: "blocking_local_conflict",
    allowedFallbacks: [],
    expected: {
      triggerKinds: [
        "conflicted_read",
        "contested_claim",
        "degraded_indeterminate",
      ],
      applicability: "required",
      handling: "handled",
      availability: "unavailable",
      disposition: "unavailable",
    },
  },
  {
    controlId: "I04",
    baseScenarioId: "exhausted_budget",
    allowedFallbacks: [],
    expected: {
      triggerKinds: ["budget_exhausted", "degraded_indeterminate"],
      applicability: "required",
      handling: "handled",
      availability: "unavailable",
      disposition: "unavailable",
    },
  },
  {
    controlId: "I05",
    baseScenarioId: "remote_rejection",
    allowedFallbacks: ["unknown"],
    expected: {
      triggerKinds: [],
      applicability: "not_applicable",
      handling: "not_applicable",
      availability: "available",
      disposition: "not_needed",
    },
  },
  {
    controlId: "I06",
    baseScenarioId: "interrupted_expanded_action",
    allowedFallbacks: ["defense"],
    expected: {
      triggerKinds: [],
      applicability: "not_applicable",
      handling: "not_applicable",
      availability: "available",
      disposition: "not_needed",
    },
  },
].map((control) => IntegrationControlSchema.parse(control));

function countBy<T>(values: readonly T[], predicate: (value: T) => boolean) {
  return values.filter(predicate).length;
}

function registeredDistribution(): z.infer<
  typeof RegisteredDistributionSchema
> {
  return RegisteredDistributionSchema.parse({
    total: cases.length,
    notApplicable: countBy(cases, (fixture) =>
      fixture.expected.applicability === "not_applicable"
    ),
    required: countBy(cases, (fixture) =>
      fixture.expected.applicability === "required"
    ),
    handled: countBy(cases, (fixture) =>
      fixture.expected.handling === "handled"
    ),
    missing: countBy(cases, (fixture) =>
      fixture.expected.handling === "missing"
    ),
    handlingNotApplicable: countBy(cases, (fixture) =>
      fixture.expected.handling === "not_applicable"
    ),
    dispositionUnavailable: countBy(cases, (fixture) =>
      fixture.expected.disposition === "unavailable"
    ),
    dispositionNotNeeded: countBy(cases, (fixture) =>
      fixture.expected.disposition === "not_needed"
    ),
    dispositionUsed: countBy(cases, (fixture) =>
      fixture.expected.disposition === "used"
    ),
    dispositionAvailableUnhandled: countBy(cases, (fixture) =>
      fixture.expected.disposition === "available_unhandled"
    ),
    multiTriggerInterference: countBy(cases, (fixture) =>
      fixture.family === "interference"
    ),
    integrationControls: integrationControls.length,
  });
}

export async function verifyConflictHandlingHeldOutFrozenLineage(): Promise<
  boolean
> {
  try {
    const current = await Promise.all(frozenLineage.map((item) =>
      fileEvidence(item.path)
    ));
    if (current.some((item, index) =>
      item.fileSha256 !== frozenLineage[index]!.fileSha256
    )) {
      return false;
    }
    const parent = JSON.parse(await fs.readFile(
      path.join(repositoryRoot, PARENT_EVALUATION_PATH),
      "utf8",
    )) as { integrity?: { contentDigest?: string } };
    return parent.integrity?.contentDigest ===
      PARENT_EVALUATION_CONTENT_DIGEST;
  } catch {
    return false;
  }
}

export function verifyConflictHandlingHeldOutCorpusContentDigest(
  raw: unknown,
): boolean {
  const corpus = ConflictHandlingHeldOutCorpusSchema.parse(raw);
  const { integrity, ...basis } = corpus;
  return digest(basis) === integrity.contentDigest;
}

export async function verifyConflictHandlingHeldOutCorpusCurrentSources(
  raw: unknown,
): Promise<boolean> {
  const corpus = ConflictHandlingHeldOutCorpusSchema.parse(raw);
  const expected = [
    corpus.provenance.protocol,
    corpus.provenance.builder,
    ...corpus.provenance.frozenLineage,
  ];
  const current = await Promise.all(expected.map((item) =>
    fileEvidence(item.path)
  ));
  return current.every((item, index) =>
    item.path === expected[index]!.path &&
    item.fileSha256 === expected[index]!.fileSha256
  );
}

export async function buildConflictHandlingHeldOutCorpus(input: {
  now?: () => Date;
} = {}): Promise<ConflictHandlingHeldOutCorpus> {
  if (!await verifyConflictHandlingHeldOutFrozenLineage()) {
    throw new Error("held-out corpus frozen lineage mismatch");
  }
  const [protocol, builder] = await Promise.all([
    fileEvidence(PROTOCOL_PATH),
    fileEvidence(BUILDER_PATH),
  ]);
  const withoutIntegrity = CorpusWithoutIntegritySchema.parse({
    schemaVersion: 1,
    mode: "conflict_handling_held_out_corpus",
    fixtureVersion: FIXTURE_VERSION,
    builtAt: (input.now?.() ?? new Date()).toISOString(),
    provenance: {
      protocol,
      builder,
      frozenLineage,
      parentEvaluationContentDigest: PARENT_EVALUATION_CONTENT_DIGEST,
    },
    oracle: {
      mode: "literal_pre_registered_expected",
      expectedDerivedFromClassifierOutput: false,
      classifierInvokedDuringConstruction: false,
      enricherInvokedDuringConstruction: false,
    },
    cases,
    integrationControls,
    registeredDistribution: registeredDistribution(),
    boundaries: {
      frozenLineageVerified: true,
      sourceMutationCount: 0,
      authoritativeOutcomeChangeCount: 0,
      legacyReceiptMutationCount: 0,
      canonicalCommitCount: 0,
      externalLlmCallsMade: 0,
      xaiCallsMade: 0,
    },
  });
  const corpus = ConflictHandlingHeldOutCorpusSchema.parse({
    ...withoutIntegrity,
    integrity: {
      algorithm: "sha256",
      basis: "canonical corpus excluding integrity",
      contentDigest: digest(withoutIntegrity),
    },
  });
  if (!verifyConflictHandlingHeldOutCorpusContentDigest(corpus)) {
    throw new Error("held-out corpus content digest mismatch");
  }
  return corpus;
}

function parseArgs(args: string[]): { outputPath?: string } {
  const parsed: { outputPath?: string } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg !== "--output") throw new Error(`unknown argument ${arg}`);
    if (!value) throw new Error("missing value for --output");
    parsed.outputPath = path.resolve(repositoryRoot, value);
    index += 1;
  }
  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const corpus = await buildConflictHandlingHeldOutCorpus();
  const serialized = `${JSON.stringify(corpus, null, 2)}\n`;
  if (args.outputPath) {
    await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
    await fs.writeFile(args.outputPath, serialized, {
      encoding: "utf8",
      flag: "wx",
    });
    console.error(`[conflict-handling-held-out] wrote ${args.outputPath}`);
    return;
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
