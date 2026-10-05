// R: Verify private narrator projection and recognition watermark ownership in a real SQLite transaction.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { validAwarenessBattleFixture } from "../services/awareness-test-fixture.js";
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "narrator-state-")), "test.db");
const { withTransaction } = await import("../db.js");
const { insertNewBattle } = await import("./battles.js");
const { captureAwarenessNarratorContext, commitAwarenessNarratorRecognition, readAwarenessNarrator } = await import("./battle-awareness-narrator.js");
it("projects only the requested subjective narrator perspective and never reseeds from a later baseline", async () => {
  const { state } = validAwarenessBattleFixture("narrator-private-projection");
  const initial = state.narratorContinuity; assert.ok(initial);
  initial.a.lastInteriorBeat = "private A"; initial.b.lastInteriorBeat = "private B";
  await insertNewBattle(state,{ sideAUserId:"owner",sideACharacterId:"a",sideBCharacterId:"b" });
  await withTransaction(async (connection) => {
    const context = await captureAwarenessNarratorContext(connection,{ battleId:state.id,firstSequence:1,target:"a",initial,now:new Date().toISOString() });
    assert.deepEqual(context.continuity?.perspectives.map((item)=>item.viewpointSide),["a"]);
    assert.equal(JSON.stringify(context).includes("private B"),false);
    await commitAwarenessNarratorRecognition(connection,{ battleId:state.id,sequence:1,turn:1,target:"a",allowedSubjectRefs:["cue"],
      updates:[{subjectRef:"cue",recognizedAs:"柱影",identityKnowledge:"unknown",continuity:"same_entity"}],now:new Date().toISOString() });
    const replacement = structuredClone(initial); replacement.a.lastInteriorBeat = "future must not seed";
    const next = await captureAwarenessNarratorContext(connection,{battleId:state.id,firstSequence:2,target:"a",initial:replacement,now:new Date().toISOString()});
    assert.equal(JSON.stringify(next).includes("future must not seed"),false);
    assert.equal(next.continuity?.perspectives[0]?.recognitions.some((item)=>item.subjectRef==="cue"),true);
    const reader = await captureAwarenessNarratorContext(connection,{battleId:state.id,firstSequence:2,target:"reader",now:new Date().toISOString()});
    assert.equal(reader.continuity?.perspectives.length,0);
    assert.equal(reader.continuity?.reader.recognitions.some((item)=>item.subjectRef==="cue"),false);
  });
  await assert.rejects(withTransaction((connection)=>commitAwarenessNarratorRecognition(connection,{battleId:state.id,sequence:1,turn:1,
    target:"reader",allowedSubjectRefs:[],updates:[],now:new Date().toISOString()})),/SEQUENCE_CONFLICT/);
  await withTransaction(async(connection)=>assert.equal((await readAwarenessNarrator(connection,state.id))?.sequence,1));
});
