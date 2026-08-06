import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConsistencyAlertSchema,
  ConsistencyIssuePocEnvelopeSchema,
  blockingConsistencyIssueRefs,
  createConsistencyIssuePocEnvelope,
  deferConsistencyIssue,
  projectConsistencyIssueViews,
  registerConsistencyAlert,
  registerPatchAuditResult,
  resolveConsistencyIssue,
  type ConsistencyAlert,
} from "./battle-consistency-issue.js";
import { ShadowPatchAuditResultSchema } from "./battle-canonical-patch.js";

function alert(input: {
  alertRef: string;
  reporter?: ConsistencyAlert["reporter"];
  turn?: number;
  involvedRefs?: string[];
  conflictingClaims?: string[];
  blocking?: boolean;
}): ConsistencyAlert {
  return ConsistencyAlertSchema.parse({
    schemaVersion: 1,
    alertRef: input.alertRef,
    reporter: input.reporter ?? "character_agent",
    turn: input.turn ?? 3,
    involvedRefs: input.involvedRefs ?? ["character.a", "object.sword"],
    conflictingClaims: input.conflictingClaims ?? [
      "fact.sword-held",
      "fact.sword-floor",
    ],
    blocking: input.blocking ?? true,
    explanation: "同じ剣が保持中かつ床上として入力されている。",
  });
}

describe("shadow consistency issue registry PoC", () => {
  it("registers an LLM alert without granting its blocking claim authority", () => {
    const envelope = createConsistencyIssuePocEnvelope();
    const unrelatedCanonicalState = {
      facts: ["fact.sword-held", "fact.sword-floor"],
    };
    const beforeCanonicalState = structuredClone(unrelatedCanonicalState);

    const registered = registerConsistencyAlert({
      envelope,
      alert: alert({ alertRef: "alert.character.1", blocking: true }),
      discoveredAtStage: "planning",
      classifiedBlocksPurposes: ["narration"],
    });

    assert.equal(registered.outcome, "registered");
    assert.equal(registered.envelope.mode, "shadow_issue_registry");
    assert.equal(registered.envelope.revision, 1);
    assert.equal(registered.envelope.issues.length, 1);
    const issue = registered.envelope.issues[0]!;
    assert.equal(issue.status, "open");
    assert.equal(issue.reporterClaimsBlocking, true);
    assert.deepEqual(issue.blocksPurposes, ["narration"]);
    assert.deepEqual(
      blockingConsistencyIssueRefs({
        envelope: registered.envelope,
        purpose: "narration",
      }),
      [issue.id],
    );
    assert.deepEqual(
      blockingConsistencyIssueRefs({
        envelope: registered.envelope,
        purpose: "adjudication",
      }),
      [],
    );
    assert.deepEqual(projectConsistencyIssueViews(registered.envelope), [{
      id: issue.id,
      involvedFactRefs: ["fact.sword-floor", "fact.sword-held"],
      involvedEntityRefs: ["character.a", "object.sword"],
      blocksPurposes: ["narration"],
      status: "open",
    }]);
    assert.deepEqual(unrelatedCanonicalState, beforeCanonicalState);
    assert.deepEqual(envelope, createConsistencyIssuePocEnvelope());
  });

  it("deduplicates unresolved claims and preserves deferred blocking until resolution", () => {
    const first = registerConsistencyAlert({
      envelope: createConsistencyIssuePocEnvelope(),
      alert: alert({ alertRef: "alert.1" }),
      discoveredAtStage: "planning",
      classifiedBlocksPurposes: ["adjudication"],
    });
    assert.ok(first.issueRef);
    const secondAlert = alert({
      alertRef: "alert.2",
      reporter: "narrator",
      turn: 4,
      involvedRefs: ["object.sword", "character.a"],
      conflictingClaims: ["fact.sword-floor", "fact.sword-held"],
    });
    const duplicate = registerConsistencyAlert({
      envelope: first.envelope,
      alert: secondAlert,
      discoveredAtStage: "narration",
      classifiedBlocksPurposes: ["narration"],
    });
    assert.equal(duplicate.outcome, "deduplicated");
    assert.equal(duplicate.issueRef, first.issueRef);
    assert.equal(duplicate.envelope.issues.length, 1);
    assert.equal(duplicate.envelope.issues[0]?.occurrenceCount, 2);
    assert.deepEqual(duplicate.envelope.issues[0]?.blocksPurposes, [
      "adjudication",
      "narration",
    ]);
    assert.deepEqual(duplicate.envelope.issues[0]?.reporters, [
      "character_agent",
      "narrator",
    ]);

    const replay = registerConsistencyAlert({
      envelope: duplicate.envelope,
      alert: secondAlert,
      discoveredAtStage: "narration",
      classifiedBlocksPurposes: ["narration"],
    });
    assert.equal(replay.outcome, "unchanged");
    assert.deepEqual(replay.envelope, duplicate.envelope);

    const deferred = deferConsistencyIssue({
      envelope: replay.envelope,
      issueRef: first.issueRef!,
      decisionRef: "decision.defer.1",
      turn: 4,
      reason: "現在の裁定には不要なので解決を後続へ送る。",
    });
    assert.equal(deferred.outcome, "deferred");
    assert.deepEqual(
      blockingConsistencyIssueRefs({
        envelope: deferred.envelope,
        purpose: "adjudication",
      }),
      [first.issueRef],
    );

    const resolved = resolveConsistencyIssue({
      envelope: deferred.envelope,
      issueRef: first.issueRef!,
      resolutionRef: "repair.1",
      turn: 5,
      summary: "後続因果に従い保持factを採用した。",
    });
    assert.equal(resolved.outcome, "resolved");
    assert.deepEqual(
      blockingConsistencyIssueRefs({
        envelope: resolved.envelope,
        purpose: "adjudication",
      }),
      [],
    );
    assert.deepEqual(
      resolved.envelope.lifecycleEvents.map((event) => event.kind),
      ["registered", "deduplicated", "deferred", "resolved"],
    );
    assert.equal(
      deferConsistencyIssue({
        envelope: resolved.envelope,
        issueRef: first.issueRef!,
        decisionRef: "decision.defer.2",
        turn: 6,
        reason: "resolved issue cannot be deferred",
      }).outcome,
      "rejected",
    );

    const recurrence = registerConsistencyAlert({
      envelope: resolved.envelope,
      alert: alert({ alertRef: "alert.3", turn: 6 }),
      discoveredAtStage: "adjudication",
      classifiedBlocksPurposes: ["adjudication"],
    });
    assert.equal(recurrence.outcome, "registered");
    assert.equal(recurrence.envelope.issues.length, 2);
    assert.notEqual(recurrence.issueRef, first.issueRef);
  });

  it("keeps no-issue and indeterminate audits distinct from registration", () => {
    const envelope = createConsistencyIssuePocEnvelope();
    let classifications = 0;
    const noIssue = registerPatchAuditResult({
      envelope,
      auditRef: "audit.1",
      turn: 1,
      result: ShadowPatchAuditResultSchema.parse({
        verdict: "no_issue_found",
        checkedScope: {
          factRefs: ["fact.checked"],
          entityRefs: ["character.a"],
          patchBytes: 120,
        },
        issues: [],
      }),
      classifyIssue: () => {
        classifications += 1;
        return ["patch_audit"];
      },
    });
    assert.equal(noIssue.outcome, "no_issue_found");
    assert.deepEqual(noIssue.checkedFactRefs, ["fact.checked"]);
    assert.deepEqual(noIssue.envelope, envelope);

    const indeterminate = registerPatchAuditResult({
      envelope,
      auditRef: "audit.2",
      turn: 1,
      result: ShadowPatchAuditResultSchema.parse({
        verdict: "indeterminate",
        checkedScope: {
          factRefs: ["fact.checked"],
          entityRefs: ["character.a"],
          patchBytes: 120,
        },
        issues: [{
          code: "incomplete_context",
          factRefs: [],
          entityRefs: [],
          explanation: "scope intentionally incomplete",
        }],
      }),
      classifyIssue: () => {
        classifications += 1;
        return ["patch_audit"];
      },
    });
    assert.equal(indeterminate.outcome, "indeterminate");
    assert.deepEqual(indeterminate.envelope, envelope);
    assert.equal(classifications, 0);
  });

  it("registers deterministic audit findings atomically and deduplicates replay", () => {
    const auditResult = ShadowPatchAuditResultSchema.parse({
      verdict: "issue_found",
      checkedScope: {
        factRefs: ["fact.old", "fact.new"],
        entityRefs: ["character.a"],
        patchBytes: 500,
      },
      issues: [{
        code: "direct_conflict",
        factRefs: ["fact.old", "fact.new"],
        entityRefs: ["character.a"],
        explanation: "two active claims conflict",
      }, {
        code: "incomplete_context",
        factRefs: [],
        entityRefs: [],
        explanation: "a separate inverse edge was not loaded",
      }],
    });
    const registered = registerPatchAuditResult({
      envelope: createConsistencyIssuePocEnvelope(),
      auditRef: "audit.conflict.1",
      turn: 2,
      result: auditResult,
      classifyIssue: (issue) => issue.code === "direct_conflict"
        ? ["adjudication", "patch_audit"]
        : [],
    });
    assert.equal(registered.outcome, "registered");
    assert.equal(registered.envelope.issues.length, 1);
    assert.equal(registered.envelope.issues[0]?.kind, "direct_conflict");
    assert.deepEqual(registered.envelope.issues[0]?.blocksPurposes, [
      "adjudication",
      "patch_audit",
    ]);

    const replay = registerPatchAuditResult({
      envelope: registered.envelope,
      auditRef: "audit.conflict.1",
      turn: 2,
      result: auditResult,
      classifyIssue: () => ["adjudication"],
    });
    assert.equal(replay.outcome, "deduplicated");
    assert.deepEqual(replay.envelope, registered.envelope);

    const duplicate = registerPatchAuditResult({
      envelope: registered.envelope,
      auditRef: "audit.conflict.2",
      turn: 3,
      result: auditResult,
      classifyIssue: () => ["narration"],
    });
    assert.equal(duplicate.outcome, "deduplicated");
    assert.equal(duplicate.envelope.issues[0]?.occurrenceCount, 2);
    assert.deepEqual(duplicate.envelope.issues[0]?.blocksPurposes, [
      "adjudication",
      "narration",
      "patch_audit",
    ]);
  });

  it("rejects invalid lifecycle time and strict-envelope extensions", () => {
    const registered = registerConsistencyAlert({
      envelope: createConsistencyIssuePocEnvelope(),
      alert: alert({ alertRef: "alert.time", turn: 5 }),
      discoveredAtStage: "planning",
      classifiedBlocksPurposes: ["adjudication"],
    });
    assert.equal(deferConsistencyIssue({
      envelope: registered.envelope,
      issueRef: registered.issueRef!,
      decisionRef: "decision.before-discovery",
      turn: 4,
      reason: "invalid earlier turn",
    }).outcome, "rejected");
    assert.equal(resolveConsistencyIssue({
      envelope: registered.envelope,
      issueRef: registered.issueRef!,
      resolutionRef: "repair.before-discovery",
      turn: 4,
      summary: "invalid earlier resolution",
    }).outcome, "rejected");
    assert.throws(() => ConsistencyAlertSchema.parse({
      schemaVersion: 1,
      alertRef: "alert.empty",
      reporter: "narrator",
      turn: 1,
      involvedRefs: [],
      conflictingClaims: [],
      blocking: false,
      explanation: "no references",
    }));
    assert.throws(() => ConsistencyIssuePocEnvelopeSchema.parse({
      ...createConsistencyIssuePocEnvelope(),
      canonicalFacts: [],
    }));
  });
});
