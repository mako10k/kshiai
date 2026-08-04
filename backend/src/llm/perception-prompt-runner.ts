import {
  TurnSemanticPatchSchema,
  applyTurnSemanticPatch,
} from "@kshiai/shared";
import {
  COMBINED_PERCEPTION_SYSTEM_PROMPT,
  PERCEPTION_PROMPT_FIXTURE_VERSION,
  PERCEPTION_PROMPT_FIXTURES,
  SENSORY_EVIDENCE_SYSTEM_PROMPT,
  WORLD_RECONCILIATION_SYSTEM_PROMPT,
  aggregatePerceptionPromptScores,
  promptUserPayload,
  recommendPerceptionPromptTopology,
  scorePerceptionPromptCandidate,
  sensoryPromptUserPayload,
  worldPromptUserPayload,
  type PerceptionPromptAggregate,
  type PerceptionPromptCandidate,
  type PerceptionPromptRecommendation,
  type PerceptionPromptSampleScore,
  type PerceptionPromptTopology,
  type PromptCallMeasurement,
} from "./perception-prompt-strategy.js";

export type JsonPromptCompletion = {
  data: unknown;
  measurement: PromptCallMeasurement;
};

export type PerceptionPromptEvaluationClient = {
  completeJson(input: {
    system: string;
    user: string;
    label: string;
  }): Promise<JsonPromptCompletion>;
};

export type PerceptionPromptEvaluationReport = {
  schemaVersion: 1;
  fixtureVersion: string;
  provider: string;
  model: string;
  repetitions: number;
  evaluatedAt: string;
  combined: PerceptionPromptAggregate;
  split: PerceptionPromptAggregate;
  recommendation: PerceptionPromptRecommendation;
  combinedSamples: PerceptionPromptSampleScore[];
  splitSamples: PerceptionPromptSampleScore[];
  callErrors: Array<{
    topology: PerceptionPromptTopology;
    fixtureId: string;
    repetition: number;
    stage: "combined" | "world" | "sensory";
    message: string;
  }>;
};

export async function evaluatePerceptionPromptTopologies(input: {
  provider: string;
  model: string;
  repetitions: number;
  client: PerceptionPromptEvaluationClient;
  now?: () => Date;
}): Promise<PerceptionPromptEvaluationReport> {
  if (!Number.isInteger(input.repetitions) || input.repetitions < 1) {
    throw new Error("perception prompt repetitions must be a positive integer");
  }
  const callErrors: PerceptionPromptEvaluationReport["callErrors"] = [];
  const evaluateTopology = async (topology: PerceptionPromptTopology) => {
    const scores = [];
    for (let repetition = 1; repetition <= input.repetitions; repetition += 1) {
      for (const fixture of PERCEPTION_PROMPT_FIXTURES) {
        const candidate = await runCandidate({
          client: input.client,
          topology,
          fixture,
          repetition,
          onError: (stage, message) => callErrors.push({
            topology,
            fixtureId: fixture.id,
            repetition,
            stage,
            message,
          }),
        });
        scores.push(scorePerceptionPromptCandidate({ fixture, candidate }));
      }
    }
    return {
      aggregate: aggregatePerceptionPromptScores(scores),
      scores,
    };
  };

  const combinedResult = await evaluateTopology("combined");
  const splitResult = await evaluateTopology("split");
  const combined = combinedResult.aggregate;
  const split = splitResult.aggregate;
  return {
    schemaVersion: 1,
    fixtureVersion: PERCEPTION_PROMPT_FIXTURE_VERSION,
    provider: input.provider.trim().toLowerCase(),
    model: input.model.trim(),
    repetitions: input.repetitions,
    evaluatedAt: (input.now?.() ?? new Date()).toISOString(),
    combined,
    split,
    recommendation: recommendPerceptionPromptTopology({ combined, split }),
    combinedSamples: combinedResult.scores,
    splitSamples: splitResult.scores,
    callErrors,
  };
}

async function runCandidate(input: {
  client: PerceptionPromptEvaluationClient;
  topology: PerceptionPromptTopology;
  fixture: (typeof PERCEPTION_PROMPT_FIXTURES)[number];
  repetition: number;
  onError: (
    stage: "combined" | "world" | "sensory",
    message: string,
  ) => void;
}): Promise<PerceptionPromptCandidate> {
  const labelBase = [
    "perception",
    input.topology,
    input.fixture.id,
    input.repetition,
  ].join("/");
  if (input.topology === "combined") {
    const result = await safeComplete({
      client: input.client,
      system: COMBINED_PERCEPTION_SYSTEM_PROMPT,
      user: promptUserPayload(input.fixture.input),
      label: `${labelBase}/combined`,
      onError: (message) => input.onError("combined", message),
    });
    return {
      fixtureId: input.fixture.id,
      topology: "combined",
      rawWorldResponse: result.data,
      calls: [result.measurement],
    };
  }

  const world = await safeComplete({
    client: input.client,
    system: WORLD_RECONCILIATION_SYSTEM_PROMPT,
    user: worldPromptUserPayload(input.fixture.input),
    label: `${labelBase}/world`,
    onError: (message) => input.onError("world", message),
  });
  const rawWorld = asRecord(world.data);
  const patch = TurnSemanticPatchSchema.safeParse({
    ...asRecord(rawWorld.patch),
    baseRevision: input.fixture.input.before.revision,
    turn: input.fixture.input.turn,
    sourceEventIds: input.fixture.input.events.flatMap((event) =>
      event.id ? [event.id] : []
    ),
  });
  const applied = patch.success
    ? applyTurnSemanticPatch({
        state: input.fixture.input.before,
        patch: patch.data,
        turn: input.fixture.input.turn,
        allowedSourceEventIds: new Set(
          input.fixture.input.events.flatMap((event) => event.id ? [event.id] : []),
        ),
      })
    : null;
  const committedState = applied?.ok
    ? applied.state
    : input.fixture.input.before;
  const sensory = await safeComplete({
    client: input.client,
    system: SENSORY_EVIDENCE_SYSTEM_PROMPT,
    user: sensoryPromptUserPayload({
      turn: input.fixture.input.turn,
      committedState,
      actions: input.fixture.input.actions,
      events: input.fixture.input.events,
      characters: input.fixture.input.characters,
      mechanicalEvidence: input.fixture.input.mechanicalEvidence,
    }),
    label: `${labelBase}/sensory`,
    onError: (message) => input.onError("sensory", message),
  });
  return {
    fixtureId: input.fixture.id,
    topology: "split",
    rawWorldResponse: world.data,
    rawSensoryResponse: sensory.data,
    calls: [world.measurement, sensory.measurement],
  };
}

async function safeComplete(input: {
  client: PerceptionPromptEvaluationClient;
  system: string;
  user: string;
  label: string;
  onError: (message: string) => void;
}): Promise<JsonPromptCompletion> {
  const started = Date.now();
  try {
    return await input.client.completeJson({
      system: input.system,
      user: input.user,
      label: input.label,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.onError(message.slice(0, 400));
    return {
      data: {},
      measurement: {
        latencyMs: Date.now() - started,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
      },
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
