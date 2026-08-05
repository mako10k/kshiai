import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createBattleState,
  defaultParameters,
  deriveBattleProfileStateOverrides,
  deriveBattleSceneStateFacts,
  resolveTurn,
  type BattleState,
  type CharacterSheet,
  type FreeActionCanonicalRoot,
  type LatentAffordanceProjection,
} from "@kshiai/shared";
import {
  commitFreeActionAdjudications,
  prepareFreeActionsForTurn,
  type FreeActionTurnPreparation,
} from "./free-action-service.js";
import { MockLlmProvider } from "../llm/mock.js";

function sheet(id: string, displayName: string): CharacterSheet {
  const now = new Date().toISOString();
  return {
    id,
    ownerUserId: "test-user",
    displayName,
    tags: [],
    createdAt: now,
    updatedAt: now,
    appearance: {
      summary: `${displayName}のテスト用外見`,
      visualPrompt: "test",
    },
    traits: ["現実的に勝機を探す"],
    parameters: defaultParameters({ hp: 200, maxHp: 200 }),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "自由行動テスト用",
  };
}

function battle(): { state: BattleState; mine: CharacterSheet; opp: CharacterSheet } {
  const mine = sheet("mine", "A");
  const opp = sheet("opp", "B");
  const state = createBattleState({
    id: "free-action-test",
    sideA: mine,
    sideB: opp,
    turnLimit: 20,
    prologuePending: false,
  });
  return { state, mine, opp };
}

function resolveFreeTurn(
  state: BattleState,
  mine: CharacterSheet,
  opp: CharacterSheet,
  description: string,
  subjectRefs: string[],
) {
  const before = structuredClone(state);
  state.plannedActionA = {
    kind: "free_action",
    description,
    desiredOutcome: "手に持つ",
    subjectRefs,
  };
  state.plannedActionB = { kind: "wait" };
  const resolved = resolveTurn({
    state,
    sideASkills: mine.skills,
    sideBSkills: opp.skills,
  });
  return { before, resolved };
}

function affordance(
  root: FreeActionCanonicalRoot,
  perceivedAs: string,
): LatentAffordanceProjection {
  return {
    ref: root.ref,
    perceivedAs,
    relation: "足元の近くにあるように見える",
    certainty: "coarse",
    possiblePreparations: [{
      description: `${perceivedAs}を拾おうとする`,
      setupTurns: 1,
    }],
    possibleUses: [{
      description: `${perceivedAs}を攻撃の補助に使えるかもしれない`,
      compatibleActionKinds: ["free_action", "basic_attack"],
      expectedCausalPotential: { damage: "minor" },
    }],
  };
}

function commit(input: {
  before: BattleState;
  resolved: ReturnType<typeof resolveTurn>;
  preparation: FreeActionTurnPreparation;
}) {
  return commitFreeActionAdjudications({
    beforeState: input.before,
    resolvedState: input.resolved.state,
    actions: input.resolved.actions,
    events: input.resolved.events,
    preparation: input.preparation,
  });
}

describe("free action promotion and adjudication", () => {
  it("adds no adjudication call for standard turns and one batched call for free actions", async () => {
    const { state, mine, opp } = battle();
    const provider = new MockLlmProvider();
    let calls = 0;
    const adjudicate = provider.adjudicateFreeActions.bind(provider);
    provider.adjudicateFreeActions = async (input) => {
      calls += 1;
      return adjudicate(input);
    };

    state.plannedActionA = { kind: "basic_attack" };
    state.plannedActionB = { kind: "wait" };
    await prepareFreeActionsForTurn({ llm: provider, state, mine, opp });
    assert.equal(calls, 0);

    state.plannedActionA = {
      kind: "free_action",
      description: "相手の腕をつかもうとする",
      subjectRefs: ["actor:a:counterpart"],
    };
    state.plannedActionB = {
      kind: "free_action",
      description: "身を低くする",
      subjectRefs: ["actor:b:self"],
    };
    const prepared = await prepareFreeActionsForTurn({
      llm: provider,
      state,
      mine,
      opp,
    });
    assert.equal(calls, 1);
    assert.equal(prepared.adjudication?.proposals.length, 2);
  });

  it("can apply a plausible direct action to the canonical counterpart", async () => {
    const { state, mine, opp } = battle();
    state.plannedActionA = {
      kind: "free_action",
      description: "間合いの内側にいる相手の腕をつかむ",
      subjectRefs: ["actor:a:counterpart"],
    };
    state.plannedActionB = { kind: "wait" };
    const before = structuredClone(state);
    const preparation = await prepareFreeActionsForTurn({
      llm: new MockLlmProvider(),
      state,
      mine,
      opp,
    });
    const resolved = resolveTurn({
      state,
      sideASkills: mine.skills,
      sideBSkills: opp.skills,
    });
    const result = commit({ before, resolved, preparation });
    assert.equal(
      result.state.worldState!.entities["character.b"]?.actorState?.restraint,
      "partially_restrained",
    );
    assert.equal(result.state.latestFreeActionReceipts?.[0]?.outcome, "accepted");
    assert.equal(result.state.latestFreeActionReceipts?.[0]?.promotion, "not_needed");
  });

  it("fails the same ordinary grab when the canonical counterpart is far away", async () => {
    const { state, mine, opp } = battle();
    state.worldState!.pairRelations[0]!.distance = "far";
    state.plannedActionA = {
      kind: "free_action",
      description: "離れた相手の腕を素手でつかむ",
      subjectRefs: ["actor:a:counterpart"],
    };
    state.plannedActionB = { kind: "wait" };
    const before = structuredClone(state);
    const preparation = await prepareFreeActionsForTurn({
      llm: new MockLlmProvider(),
      state,
      mine,
      opp,
    });
    const resolved = resolveTurn({
      state,
      sideASkills: mine.skills,
      sideBSkills: opp.skills,
    });
    const result = commit({ before, resolved, preparation });
    assert.equal(
      result.state.worldState!.entities["character.b"]?.actorState?.restraint,
      "free",
    );
    assert.equal(result.state.latestFreeActionReceipts?.[0]?.outcome, "failed");
    assert.match(result.state.latestFreeActionReceipts?.[0]?.summary ?? "", /距離/);
  });

  it("does not create an object when a believed stone has no canonical root", () => {
    const { state, mine, opp } = battle();
    const turn = resolveFreeTurn(
      state,
      mine,
      opp,
      "目の前にあると思い込んでいる石を拾う",
      ["percept.a.hallucinated-stone"],
    );
    const result = commit({
      ...turn,
      preparation: {
        roots: [],
        affordances: { a: [], b: [] },
        adjudication: {
          proposals: [{
            actorSide: "a",
            outcome: "impossible",
            interpretation: "認知上の石を拾おうとした。",
            changes: [],
            successSummary: "石を拾った。",
            failureSummary: "そこに拾える物体はなく、手は空を切った。",
          }],
        },
      },
    });

    assert.equal(
      Object.values(result.state.worldState!.entities).some((entity) =>
        entity.objectProfile?.observerLabels.a === "石"
      ),
      false,
    );
    assert.equal(result.state.latestFreeActionReceipts?.[0]?.reason, "impossible");
    assert.equal(result.actions[0]?.resolution?.reason, "free_action_impossible");
    assert.equal(
      result.events.some((event) =>
        event.id === "turn-1-free-action-a" && /手は空を切った/.test(event.summary)
      ),
      true,
    );
  });

  it("promotes the real ball while preserving the actor's stone belief", () => {
    const { state, mine, opp } = battle();
    const root: FreeActionCanonicalRoot = {
      ref: "percept.a.loose.1",
      sourceRef: "battlefield:loose-ball",
      provenance: "battlefield",
      canonicalLabel: "ボール",
      description: "訓練場に転がっている小さなボール。",
      perceivedBy: { a: "石" },
    };
    const turn = resolveFreeTurn(
      state,
      mine,
      opp,
      "足元の石を拾う",
      [root.ref],
    );
    const result = commit({
      ...turn,
      preparation: {
        roots: [root],
        affordances: { a: [affordance(root, "石")], b: [] },
        adjudication: {
          proposals: [{
            actorSide: "a",
            outcome: "possible",
            interpretation: "石だと思っている対象は現実にはボールだが、手が届く。",
            subject: {
              rootRef: root.ref,
              candidateKey: "loose-ball",
              canonicalLabel: "ボール",
              description: root.description,
              portable: true,
              usable: true,
              knownOpenAspects: ["material"],
              causalEnvelope: { damage: "minor" },
            },
            changes: [{
              target: "subject",
              path: "/placement",
              value: { type: "held", holderId: "character.a" },
            }],
            successSummary: "石だと思っていた物を拾い上げた。",
            failureSummary: "対象を拾えなかった。",
          }],
        },
      },
    });

    const receipt = result.state.latestFreeActionReceipts?.[0];
    assert.equal(receipt?.outcome, "accepted");
    assert.equal(receipt?.promotion, "promoted");
    const entity = result.state.worldState!.entities[receipt!.canonicalEntityId!];
    assert.equal(entity?.objectProfile?.canonicalLabel, "ボール");
    assert.equal(entity?.objectProfile?.observerLabels.a, "石");
    assert.deepEqual(entity?.placement, {
      type: "held",
      holderId: "character.a",
    });
  });

  it("promotes a profile hat and leaves it in canonical scene state after removal", () => {
    const { state, mine, opp } = battle();
    mine.appearance.summary = "赤い帽子をかぶっている。";
    const root: FreeActionCanonicalRoot = {
      ref: "profile:a:appearance",
      sourceRef: "profile:a:appearance",
      provenance: "profile_appearance",
      canonicalLabel: null,
      description: mine.appearance.summary,
      perceivedBy: { a: "赤い帽子" },
    };
    const turn = resolveFreeTurn(
      state,
      mine,
      opp,
      "赤い帽子を脱いで床へ置く",
      [root.ref],
    );
    const result = commit({
      ...turn,
      preparation: {
        roots: [root],
        affordances: { a: [affordance(root, "赤い帽子")], b: [] },
        adjudication: {
          proposals: [{
            actorSide: "a",
            outcome: "possible",
            interpretation: "着用中の帽子を外して足元へ置ける。",
            subject: {
              rootRef: root.ref,
              candidateKey: "red-hat",
              canonicalLabel: "赤い帽子",
              description: "Aがかぶっていた赤い帽子。",
              portable: true,
              usable: true,
              knownOpenAspects: [],
              causalEnvelope: {},
            },
            changes: [{
              target: "subject",
              path: "/placement",
              value: { type: "scene", areaId: "area.1" },
            }],
            successSummary: "赤い帽子を脱ぎ、足元へ置いた。",
            failureSummary: "赤い帽子を脱げなかった。",
          }],
        },
      },
    });

    const receipt = result.state.latestFreeActionReceipts?.[0];
    assert.equal(receipt?.outcome, "accepted");
    assert.equal(receipt?.promotion, "promoted");
    assert.deepEqual(
      result.state.worldState!.entities[receipt!.canonicalEntityId!]?.placement,
      { type: "scene", areaId: "area.1" },
    );
    assert.match(
      deriveBattleProfileStateOverrides({
        worldState: result.state.worldState,
        side: "a",
      })[0]?.statement ?? "",
      /身につけていない/,
    );
    assert.match(
      deriveBattleSceneStateFacts({
        worldState: result.state.worldState,
        observerSide: "a",
      })[0]?.statement ?? "",
      /赤い帽子.*にある/,
    );
    assert.equal(mine.appearance.summary, "赤い帽子をかぶっている。");
  });

  it("can promote on a failed manipulation and concretize the same entity later", () => {
    const { state, mine, opp } = battle();
    const root: FreeActionCanonicalRoot = {
      ref: "percept.a.round-object",
      sourceRef: "battlefield:round-object",
      provenance: "battlefield",
      canonicalLabel: null,
      description: "暗がりにある丸い物体。",
      perceivedBy: { a: "石のような物" },
    };
    const firstTurn = resolveFreeTurn(
      state,
      mine,
      opp,
      "丸い物を拾おうとする",
      [root.ref],
    );
    const failed = commit({
      ...firstTurn,
      preparation: {
        roots: [root],
        affordances: { a: [affordance(root, "石のような物")], b: [] },
        adjudication: {
          proposals: [{
            actorSide: "a",
            outcome: "impossible",
            interpretation: "対象は実在するが、今の距離からは手が届かない。",
            subject: {
              rootRef: root.ref,
              candidateKey: "round-object",
              canonicalLabel: null,
              description: root.description,
              portable: true,
              usable: true,
              knownOpenAspects: ["identity", "material"],
              causalEnvelope: {},
            },
            changes: [],
            successSummary: "対象を拾った。",
            failureSummary: "手を伸ばしたが、距離があり届かなかった。",
          }],
        },
      },
    });
    const firstReceipt = failed.state.latestFreeActionReceipts?.[0];
    assert.equal(firstReceipt?.outcome, "failed");
    assert.equal(firstReceipt?.promotion, "promoted");
    const entityId = firstReceipt!.canonicalEntityId!;
    assert.equal(
      failed.state.worldState!.entities[entityId]?.placement.type,
      "scene",
    );
    assert.equal(
      failed.state.worldState!.entities[entityId]?.objectProfile?.canonicalLabel,
      null,
    );

    const laterRoot: FreeActionCanonicalRoot = {
      ...root,
      existingEntityId: entityId,
    };
    const secondTurn = resolveFreeTurn(
      failed.state,
      mine,
      opp,
      "近づいて丸い物を手に取り、確かめる",
      [laterRoot.ref],
    );
    const concretized = commit({
      ...secondTurn,
      preparation: {
        roots: [laterRoot],
        affordances: {
          a: [affordance(laterRoot, "石のような物")],
          b: [],
        },
        adjudication: {
          proposals: [{
            actorSide: "a",
            outcome: "possible",
            interpretation: "手触りと弾力からボールだと分かり、今度は手に取れた。",
            subject: {
              rootRef: laterRoot.ref,
              candidateKey: "round-object",
              canonicalLabel: "ボール",
              description: "弾力のある小さなボール。",
              portable: true,
              usable: true,
              knownOpenAspects: ["material"],
              causalEnvelope: { damage: "minor" },
            },
            changes: [{
              target: "subject",
              path: "/placement",
              value: { type: "held", holderId: "character.a" },
            }],
            successSummary: "手に取ると、それがボールだと分かった。",
            failureSummary: "対象を確かめられなかった。",
          }],
        },
      },
    });
    const secondReceipt = concretized.state.latestFreeActionReceipts?.[0];
    assert.equal(secondReceipt?.canonicalEntityId, entityId);
    assert.equal(secondReceipt?.promotion, "not_needed");
    assert.equal(
      concretized.state.worldState!.entities[entityId]?.objectProfile
        ?.canonicalLabel,
      "ボール",
    );
    assert.equal(
      concretized.state.worldState!.entities[entityId]?.objectProfile
        ?.concretizations.length,
      1,
    );
    assert.equal(
      Object.values(concretized.state.worldState!.entities).filter((entity) =>
        entity.objectProfile?.sourceRef === root.sourceRef
      ).length,
      1,
    );
  });
});
