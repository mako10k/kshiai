import assert from "node:assert/strict";
import { it } from "node:test";
import { CharacterGenerationEnvelopeV2Schema } from "@kshiai/shared";
import { semanticMigrationProbeSource } from "./semantic-migration-probe-fixture.js";

it("authors a valid V2 source with both selectorless and executable preferences", () => {
  const fixture = semanticMigrationProbeSource();
  assert.ok(CharacterGenerationEnvelopeV2Schema.safeParse(fixture.source).success);
  const [soft, executable] = fixture.source.definition.actionNorms;
  assert.equal(soft.response.actionRefs.length, 0);
  assert.equal(executable.response.actionRefs.length, 1);
  assert.equal(executable.response.statement, "基本攻撃を優先したい。");
  assert.ok(soft.response.fallbackActionRef);
  assert.equal(executable.response.fallbackActionRef, null);
});
