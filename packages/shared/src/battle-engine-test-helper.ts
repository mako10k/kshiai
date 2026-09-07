import { defaultBasicAttack, type BasicAttackProfile } from "./character.js";
import {
  prepareBattleTurnExecution as prepareBattleTurnExecutionStrict,
  prepareBattleTurnInitiative as prepareBattleTurnInitiativeStrict,
  prepareSequentialBattleTurnInitiative as prepareSequentialBattleTurnInitiativeStrict,
  resolveBattleTurnBucket as resolveBattleTurnBucketStrict,
  resolveNextBattleTurnBucket as resolveNextBattleTurnBucketStrict,
  resolveTurn as resolveTurnStrict,
  finalizeBattleTurnExecution as finalizeBattleTurnExecutionStrict,
  type ResolveTurnInput,
} from "./battle-engine.js";

type BasicAttackInputs = {
  sideABasicAttack: BasicAttackProfile;
  sideBBasicAttack: BasicAttackProfile;
};

type ExplicitTestBasicAttackInput<T extends BasicAttackInputs> =
  Omit<T, keyof BasicAttackInputs> & Partial<BasicAttackInputs>;

export function resolveTurn(
  input: ExplicitTestBasicAttackInput<ResolveTurnInput>,
) {
  return resolveTurnStrict({
    ...input,
    sideABasicAttack: input.sideABasicAttack ?? defaultBasicAttack(),
    sideBBasicAttack: input.sideBBasicAttack ?? defaultBasicAttack(),
  });
}

export function prepareSequentialBattleTurnInitiative(
  input: ExplicitTestBasicAttackInput<
    Parameters<typeof prepareSequentialBattleTurnInitiativeStrict>[0]
  >,
) {
  return prepareSequentialBattleTurnInitiativeStrict(
    {
      ...input,
      sideABasicAttack: input.sideABasicAttack ?? defaultBasicAttack(),
      sideBBasicAttack: input.sideBBasicAttack ?? defaultBasicAttack(),
    },
  );
}

export function prepareBattleTurnExecution(
  input: ExplicitTestBasicAttackInput<
    Parameters<typeof prepareBattleTurnExecutionStrict>[0]
  >,
) {
  return prepareBattleTurnExecutionStrict({
    ...input,
    sideABasicAttack: input.sideABasicAttack ?? defaultBasicAttack(),
    sideBBasicAttack: input.sideBBasicAttack ?? defaultBasicAttack(),
  });
}

export function prepareBattleTurnInitiative(
  input: ExplicitTestBasicAttackInput<
    Parameters<typeof prepareBattleTurnInitiativeStrict>[0]
  >,
) {
  return prepareBattleTurnInitiativeStrict({
    ...input,
    sideABasicAttack: input.sideABasicAttack ?? defaultBasicAttack(),
    sideBBasicAttack: input.sideBBasicAttack ?? defaultBasicAttack(),
  });
}

export function resolveBattleTurnBucket(
  input: ExplicitTestBasicAttackInput<
    Parameters<typeof resolveBattleTurnBucketStrict>[0]
  >,
) {
  return resolveBattleTurnBucketStrict({
    ...input,
    sideABasicAttack: input.sideABasicAttack ?? defaultBasicAttack(),
    sideBBasicAttack: input.sideBBasicAttack ?? defaultBasicAttack(),
  });
}

export function resolveNextBattleTurnBucket(
  input: ExplicitTestBasicAttackInput<
    Parameters<typeof resolveNextBattleTurnBucketStrict>[0]
  >,
) {
  return resolveNextBattleTurnBucketStrict({
    ...input,
    sideABasicAttack: input.sideABasicAttack ?? defaultBasicAttack(),
    sideBBasicAttack: input.sideBBasicAttack ?? defaultBasicAttack(),
  });
}

export function finalizeBattleTurnExecution(
  input: ExplicitTestBasicAttackInput<
    Parameters<typeof finalizeBattleTurnExecutionStrict>[0]
  >,
) {
  return finalizeBattleTurnExecutionStrict({
    ...input,
    sideABasicAttack: input.sideABasicAttack ?? defaultBasicAttack(),
    sideBBasicAttack: input.sideBBasicAttack ?? defaultBasicAttack(),
  });
}
