import { it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { CharacterCompilerCapabilityV1Schema, type CharacterCompilerCapabilityV1 } from "./character-definition-v3.js";
import { CharacterSkeletonPhaseOperationV1Schema } from "./character-semantic-authoring.js";

type FitsCapability<T> = T extends CharacterCompilerCapabilityV1 ? true : false;
const wrongVersion: FitsCapability<{ consumer: "battle-mechanics"; version: 2 }> = false;
type Skeleton = z.infer<typeof CharacterSkeletonPhaseOperationV1Schema>;
const wrongPhase: { op: "remove_action_norm"; id: string } extends Skeleton ? true : false = false;

it("uses the registered compiler pairs as one static and runtime registry", () => {
  assert.equal(wrongVersion, false);
  for (const variant of CharacterCompilerCapabilityV1Schema.options) {
    const pair = { consumer: variant.shape.consumer.value, version: variant.shape.version.value };
    assert.deepEqual(CharacterCompilerCapabilityV1Schema.parse(pair), pair);
    assert.equal(CharacterCompilerCapabilityV1Schema.safeParse({ ...pair, version: pair.version + 1 }).success, false);
  }
});

it("restricts skeleton operations without changing their original fields", () => {
  assert.equal(wrongPhase, false);
  const operation: Skeleton = { op: "remove_background", id: "original-background" };
  assert.deepEqual(CharacterSkeletonPhaseOperationV1Schema.parse(operation), operation);
  assert.equal(CharacterSkeletonPhaseOperationV1Schema.safeParse({ op: "remove_action_norm", id: "original-norm" }).success, false);
});
