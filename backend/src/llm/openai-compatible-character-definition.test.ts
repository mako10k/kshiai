import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultParameters,
  legacyBattlefieldPresetToDefinitionV2,
  legacyCharacterSheetToDefinitionV2,
  listCharacterDefinitionGapsV2,
} from "@kshiai/shared";
import type { GenerateBattlefieldDefinitionV2Input } from "./types.js";
import type { GenerateCharacterDefinitionV2Input } from "./types.js";
import { assertXaiResponseSchema } from "./provider-response-schema.js";
import { ProviderJsonSyntaxError } from "./provider-json.js";
import {
  OpenAiCompatibleProvider,
  type ChatOpts,
} from "./openai-compatible.js";

type ChatCall = {
  system: string;
  user: string;
  label: string | undefined;
  responseFormat: unknown;
};

describe("character definition recovery through SDK HTTP decoding", () => {
  for (const sourceKind of ["create_instruction", "revision_instruction", "import"] as const) {
    for (const failure of ["syntax", "envelope", "definition"] as const) {
      it(`repairs ${failure} once for ${sourceKind} without bypassing decoding`, async (t) => {
        const input = { ...definitionInput(), sourceKind };
        const repaired = structuredClone(input.baseDefinition);
        repaired.psycheDisposition.dynamics.adverseSensitivity = 731;
        repaired.speechPolicy.register = "落ち着いた丁寧語";
        const broken = failure === "syntax" ? '{"definition": {,'
          : failure === "envelope" ? '{"unexpected":true}'
          : '{"definition":{"schemaVersion":2}}';
        let calls = 0;
        const bodies: string[] = [];
        t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
          bodies.push(String(init.body));
          calls++;
          assert.ok(calls <= 2, "no third generation or blind syntax retry");
          return Response.json({ choices: [{ message: { content: calls === 1
            ? broken : JSON.stringify({ definition: repaired }) } }],
          usage: { total_tokens: 17 } });
        });
        const provider = new OpenAiCompatibleProvider({ name: "xai", apiKey: "test-only",
          baseUrl: "https://example.invalid/v1", modelEngine: "test", modelFast: "test" });
        const result = await provider.generateCharacterDefinitionV2(input);
        assert.equal(calls, 2);
        assert.equal(result.speechPolicy.register, "落ち着いた丁寧語");
        assert.equal(result.psycheDisposition.dynamics.adverseSensitivity,
          input.baseDefinition.psycheDisposition.dynamics.adverseSensitivity);
        assert.deepEqual(result.identity, input.baseDefinition.identity);
        assert.match(bodies[1], /You repair one rejected/);
        assert.match(bodies[1], /validationIssues/);
        if (failure === "syntax") assert.match(bodies[1], /invalid_json/);
      });
    }
  }

  for (const second of ['{"definition": {,', '{"wrong":true}', '{"definition":{}}']) {
    it(`fails closed after one rejected repair: ${second}`, async (t) => {
      let calls = 0;
      t.mock.method(globalThis, "fetch", async () => {
        calls++;
        return Response.json({ choices: [{ message: { content: calls === 1
          ? '{"definition": {,' : second } }], usage: { total_tokens: 17 } });
      });
      const provider = new OpenAiCompatibleProvider({ name: "xai", apiKey: "test-only",
        baseUrl: "https://example.invalid/v1", modelEngine: "test", modelFast: "test", fallbackOnError: true });
      await assert.rejects(provider.generateCharacterDefinitionV2({
        ...definitionInput(), sourceKind: "create_instruction",
      }));
      assert.equal(calls, 2);
    });
  }

  it("does not reinterpret HTTP authentication failure as a repairable candidate", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls++;
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    });
    const provider = new OpenAiCompatibleProvider({ name: "xai", apiKey: "test-only",
      baseUrl: "https://example.invalid/v1", modelEngine: "test", modelFast: "test" });
    await assert.rejects(provider.generateCharacterDefinitionV2({
      ...definitionInput(), sourceKind: "create_instruction",
    }), /401/);
    assert.equal(calls, 1);
  });

  it("keeps malformed candidate text bounded and out of diagnostic serialization", () => {
    const error = new ProviderJsonSyntaxError("private candidate".repeat(2000));
    assert.equal(error.rejectedText.length, 16000);
    assert.doesNotMatch(String(error), /private candidate/);
    assert.doesNotMatch(JSON.stringify(error), /private candidate/);
  });
});

function definitionInput(): GenerateCharacterDefinitionV2Input {
  const baseDefinition = legacyCharacterSheetToDefinitionV2({
    id: "character-upgrade-repair",
    ownerUserId: "owner-upgrade-repair",
    displayName: "観測士ナギ",
    identity: {
      realName: null,
      nicknames: ["ナギ"],
      selfNames: ["私"],
      epithets: [],
      gender: null,
      age: null,
    },
    tags: ["observer"],
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    appearance: {
      summary: "藍色の外套と記録端末を携えた観測者",
      visualPrompt: "observer in an indigo coat",
      imageUrl: null,
    },
    traits: ["相手の言葉を受けてから問いかける"],
    parameters: defaultParameters(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "動作の理由を読み、相手の言葉には質問で返す観測者。",
  });
  return {
    sourceKind: "upgrade_description",
    sourceText: "動作の理由を読み、相手の言葉には質問で返す観測者。",
    baseDefinition,
    unstructuredActionNormSources: [{
      id: "observe-then-ask",
      statement: "相手を観測してから問いかける",
      priority: 70,
      force: "preference",
    }],
  };
}

function naturalStringFill() {
  return {
    profileBackground: null,
    appearanceDetails: [{
      id: "detail-coat",
      region: "clothing",
      description: "藍色の外套",
    }],
    psycheCoreNeeds: null,
    speech: { register: "落ち着いた丁寧語", cadence: "短く区切る" },
    relationshipSeeds: null,
    actionNorms: [{
      id: "ask-after-observing",
      when: {
        match: "all",
        clauses: [{ kind: "always", operator: "is", value: "true" }],
      },
      response: {
        disposition: "prefer",
        actionRefs: [],
        actionKinds: ["free_action"],
        tacticTags: [],
        statement: "相手の動きを見てから問いかける",
        fallbackActionRef: null,
      },
      priority: 50,
      force: "preference",
      selfAwareness: "aware",
      exceptions: [],
      description: null,
    }],
    expressionNotes: null,
  };
}

function providerWithResponses(
  responses: unknown[],
  fallbackOnError = false,
): {
  provider: OpenAiCompatibleProvider;
  calls: ChatCall[];
} {
  const calls: ChatCall[] = [];
  class StubProvider extends OpenAiCompatibleProvider {
    protected override async chatJson(
      system: string,
      user: string,
      opts?: ChatOpts,
    ): Promise<unknown> {
      if (opts?.responseFormat) assertXaiResponseSchema(opts.responseFormat.json_schema.schema);
      calls.push({
        system,
        user,
        label: opts?.label,
        responseFormat: opts?.responseFormat,
      });
      const response = responses[calls.length - 1];
      if (response === undefined) throw new Error("unexpected provider call");
      return structuredClone(response);
    }
  }
  const provider = new StubProvider({
    name: "xai",
    apiKey: "test-only",
    baseUrl: "https://example.invalid/v1",
    modelEngine: "grok-4.5",
    modelFast: "grok-4-fast-non-reasoning",
    fallbackOnError,
  });
  return { provider, calls };
}

describe("OpenAI-compatible character definition repair", () => {
  it("does not issue a repair call for a natural string-description fill", async () => {
    const input = definitionInput();
    const { provider, calls } = providerWithResponses([
      { fill: naturalStringFill() },
    ]);

    const definition = await provider.generateCharacterDefinitionV2(input);

    assert.equal(definition.appearance.details[0]?.description.text, "藍色の外套");
    assert.equal(definition.speechPolicy.register, "落ち着いた丁寧語");
    assert.equal(
      definition.actionNorms[0]?.response.statement,
      "相手の動きを見てから問いかける",
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.label, "fillCharacterDefinitionGapsV2");
    const request = JSON.parse(calls[0]!.user) as {
      unstructuredActionNormSources: unknown[];
    };
    assert.deepEqual(
      request.unstructuredActionNormSources,
      input.unstructuredActionNormSources,
    );
    const format = calls[0]?.responseFormat;
    assert.ok(format && typeof format === "object");
    const jsonSchema = Reflect.get(format, "json_schema");
    assert.ok(jsonSchema && typeof jsonSchema === "object");
    const schema = Reflect.get(jsonSchema, "schema");
    assert.ok(schema && typeof schema === "object");
    const properties = Reflect.get(schema, "properties");
    assert.ok(properties && typeof properties === "object");
    assert.equal(Reflect.get(jsonSchema, "name"), "character_definition_fill_v2");
    assert.equal(
      "identity" in properties,
      false,
    );
  });

  it("repairs a non-object fill with a bounded validation receipt", async () => {
    const input = definitionInput();
    const { provider, calls } = providerWithResponses([
      { fill: "not-an-object" },
      { fill: {} },
    ]);

    const definition = await provider.generateCharacterDefinitionV2(input);

    assert.deepEqual(definition, input.baseDefinition);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.label, "fillCharacterDefinitionGapsV2");
    assert.equal(calls[1]?.label, "fillCharacterDefinitionGapsV2Repair");
    const repair = JSON.parse(calls[1]!.user) as {
      sourceKind: string;
      validationIssues: Array<{ path: Array<string | number>; message: string }>;
    };
    assert.equal(repair.sourceKind, "upgrade_description");
    assert.ok(repair.validationIssues.length > 0);
  });

  it("fails closed after one unsuccessful repair attempt", async () => {
    const input = definitionInput();
    const { provider, calls } = providerWithResponses([
      { fill: "not-an-object" },
      { fill: "not-an-object" },
    ]);

    await assert.rejects(
      provider.generateCharacterDefinitionV2(input),
      /Expected object|invalid_type/,
    );
    assert.equal(calls.length, 2);
  });

  it("does not replace a structure error with mock output", async () => {
    const input = definitionInput();
    const { provider, calls } = providerWithResponses([
      { fill: "not-an-object" },
      { fill: "still-not-an-object" },
    ], true);

    await assert.rejects(
      provider.generateCharacterDefinitionV2(input),
      /Expected object|invalid_type/,
    );
    assert.equal(calls.length, 2);
  });

  it("rejects missing owner source while definition gaps remain", async () => {
    const input = { ...definitionInput(), sourceText: "" };
    const { provider, calls } = providerWithResponses([]);

    await assert.rejects(
      provider.generateCharacterDefinitionV2(input),
      /gaps require a non-empty owner source/,
    );
    assert.equal(calls.length, 0);
  });

  it("returns an already complete upgrade base without calling the provider", async () => {
    const input = definitionInput();
    const completeFill = {
      ...naturalStringFill(),
      profileBackground: [{
        id: "background-observer",
        kind: "role",
        summary: "観測者",
        description: "相手の動作を読む観測者。",
        selfAwareness: "aware",
      }],
      psycheCoreNeeds: [{
        id: "need-understand",
        description: "相手の意図を理解したい",
        selfAwareness: "aware",
      }],
      relationshipSeeds: [{
        id: "relation-counterpart",
        role: "rival",
        relationKinds: ["observer"],
        historySummary: "",
        defaultAddress: "",
        selfAwareness: "aware",
        priority: 10,
      }],
    };
    const initial = providerWithResponses([{ fill: completeFill }]);
    const completed = await initial.provider.generateCharacterDefinitionV2(input);
    const noCall = providerWithResponses([]);
    assert.deepEqual(listCharacterDefinitionGapsV2(completed), []);

    const unchanged = await noCall.provider.generateCharacterDefinitionV2({
      ...input,
      baseDefinition: completed,
    });

    assert.deepEqual(unchanged, completed);
    assert.equal(noCall.calls.length, 0);
  });

  it("routes revisions through complete definition generation", async () => {
    const input = {
      ...definitionInput(),
      sourceKind: "revision_instruction" as const,
    };
    const { provider, calls } = providerWithResponses([{
      definition: input.baseDefinition,
    }]);

    await provider.generateCharacterDefinitionV2(input);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.label, "generateCharacterDefinitionV2");
  });

  it("rejects an invalid review fill instead of treating it as no revision", async () => {
    const input = definitionInput();
    const { provider } = providerWithResponses([{
      verdict: "revise",
      issues: [{ code: "norm", path: "actionNorms", message: "structure required" }],
      fill: {
        actionNorms: [{
          id: "shorthand",
          statement: "待つ",
          force: "constraint",
          selfAwareness: "aware",
        }],
      },
    }]);

    await assert.rejects(
      provider.reviewCharacterDefinitionV2({
        sourceText: input.sourceText,
        sourceKind: input.sourceKind,
        baseDefinition: input.baseDefinition,
        candidate: input.baseDefinition,
        gaps: ["actionNorms"],
        findings: [],
      }),
      /Required|Unrecognized key/,
    );
  });
});

describe("OpenAI-compatible character definition response format", () => {
  it("contains no recursive definitions after constraint normalization", async () => {
    const input = {
      ...definitionInput(),
      sourceKind: "revision_instruction" as const,
    };
    const { provider, calls } = providerWithResponses([{
      definition: input.baseDefinition,
    }]);

    await provider.generateCharacterDefinitionV2(input);

    const format = calls[0]?.responseFormat;
    assert.ok(format && typeof format === "object");
    const jsonSchema = Reflect.get(format, "json_schema");
    assert.ok(jsonSchema && typeof jsonSchema === "object");
    const schema = Reflect.get(jsonSchema, "schema");
    assert.ok(schema && typeof schema === "object");
    const definitions = Reflect.get(schema, "definitions");
    assert.ok(definitions && typeof definitions === "object");
    assertXaiResponseSchema(schema);
    const constraintDefinitions = Object.keys(definitions)
      .filter((name) => [
        "reach",
        "requiresSight",
        "mobility",
        "requiresSpeech",
        "requiresUsableHeldObject",
      ].some((field) => name.endsWith(`_properties_${field}`)));
    assert.equal(constraintDefinitions.length, 5);
    assert.ok(constraintDefinitions.every((name) =>
      Reflect.get(Reflect.get(definitions, name), "$ref") === undefined));
  });

  it("encodes observed_event_kind enums without speech reactTo values", async () => {
    const input = {
      ...definitionInput(),
      sourceKind: "revision_instruction" as const,
    };
    const { provider, calls } = providerWithResponses([{
      definition: input.baseDefinition,
    }]);
    await provider.generateCharacterDefinitionV2(input);
    const format = calls[0]?.responseFormat;
    assert.ok(format && typeof format === "object");
    const jsonSchema = Reflect.get(format, "json_schema");
    assert.ok(jsonSchema && typeof jsonSchema === "object");
    const schema = Reflect.get(jsonSchema, "schema");
    assertXaiResponseSchema(schema);
    const eventValues = observedEventKindEnums(schema);
    assert.ok(eventValues.includes("utterance"));
    assert.equal(eventValues.includes("direct_address"), false);
    assert.ok(calls[0]?.system.includes("observed_event_kind=utterance"));
  });
});

function observedEventKindEnums(node: unknown): string[] {
  const found: string[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const record = value as Record<string, unknown>;
    const properties = record.properties;
    if (properties && typeof properties === "object" && !Array.isArray(properties)) {
      const kind = Reflect.get(properties, "kind");
      const clauseValue = Reflect.get(properties, "value");
      const kindEnum = kind && typeof kind === "object"
        ? Reflect.get(kind, "enum") ?? Reflect.get(kind, "const")
        : undefined;
      const kinds = kindEnum === "observed_event_kind"
        ? ["observed_event_kind"]
        : Array.isArray(kindEnum) ? kindEnum : [];
      if (kinds.includes("observed_event_kind") && clauseValue && typeof clauseValue === "object") {
        const values = Reflect.get(clauseValue, "enum");
        if (Array.isArray(values)) {
          for (const item of values) {
            if (typeof item === "string") found.push(item);
          }
        }
      }
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(node);
  return found;
}

function battlefieldInput(): GenerateBattlefieldDefinitionV2Input {
  return {
    sourceKind: "upgrade_description",
    sourceText: "霧に沈む石造遺跡。中央広場と崩れた回廊がある。",
    baseDefinition: legacyBattlefieldPresetToDefinitionV2({
      id: "field-upgrade",
      ownerUserId: "owner-upgrade",
      isSystem: false,
      displayName: "霧の遺跡",
      category: "ruins",
      tags: ["霧"],
      createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z",
      appearance: {
        summary: "霧に沈む石造遺跡",
        visualPrompt: "misty stone ruins",
        imageUrl: null,
      },
      terrainHints: ["中央広場"],
      obstacleHints: [],
      conditionHints: [],
      baseCoefficients: { damage: 0.9 },
      narrativeBlurb: "霧に閉ざされた遺跡。",
    }),
  };
}

describe("OpenAI-compatible battlefield definition fill", () => {
  it("applies a natural string-description fill without repair", async () => {
    const input = battlefieldInput();
    const { provider, calls } = providerWithResponses([{
      fill: {
        atmosphere: ["濃霧"],
        scale: null,
        genre: null,
        areas: null,
        objects: [{
          id: "pillar",
          label: "石柱",
          description: "倒れた石柱",
          area: "中央広場",
          portable: false,
          usable: false,
          cover: "partial",
          blocking: true,
        }],
        effects: null,
        evolutionAffordances: [{
          id: "fog",
          pressure: "visibility_shift",
          description: "霧だけが濃くなる",
        }],
      },
    }]);

    const definition = await provider.generateBattlefieldDefinitionV2(input);

    assert.deepEqual(definition.identity.atmosphere, ["濃霧"]);
    assert.equal(definition.objects[0]?.label, "石柱");
    assert.equal(definition.evolutionAffordances[0]?.pressure, "visibility_shift");
    assert.equal(definition.baseCoefficients.damage, 0.9);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.label, "fillBattlefieldDefinitionGapsV2");
  });
});
