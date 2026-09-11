import type { SemanticAuthoringCapabilityRoleV1 } from "@kshiai/shared";

export type CapabilityToolNameV1 =
  | "authoring_query_context_v1"
  | "authoring_propose_change_v1"
  | "authoring_submit_review_v1";

export type CapabilitySessionV1 = Readonly<{
  runId: string;
  workItemId: string;
  capabilitySessionId: string;
  mutationRole: Exclude<SemanticAuthoringCapabilityRoleV1, "query-context">;
  allowedSelectors: readonly string[];
  proposalSchemaIdentity: string;
  writeClosure: readonly string[];
  expiresAtMs: number;
  queryInvocationCount: number;
  mutationInvocationCount: number;
  mutationSucceeded: boolean;
  revoked: boolean;
}>;

export type CapabilityInvocationFailureReasonV1 =
  | "revoked"
  | "expired"
  | "binding_mismatch"
  | "selector_not_allowed"
  | "proposal_schema_mismatch"
  | "tool_not_exposed"
  | "invocation_limit";

export type CapabilityInvocationResultV1 =
  | Readonly<{ accepted: true; session: CapabilitySessionV1 }>
  | Readonly<{
      accepted: false;
      reason: CapabilityInvocationFailureReasonV1;
      session: CapabilitySessionV1;
    }>;

type CapabilityInvocationIdentityV1 = Readonly<{
  runId: string;
  workItemId: string;
  capabilitySessionId: string;
}>;

export type CapabilityInvocationV1 =
  | Readonly<CapabilityInvocationIdentityV1 & {
      tool: "authoring_query_context_v1";
      selector: string;
    }>
  | Readonly<CapabilityInvocationIdentityV1 & {
      tool: "authoring_propose_change_v1" | "authoring_submit_review_v1";
      proposalSchemaIdentity: string;
    }>;

export function visibleCapabilityToolsV1(
  session: CapabilitySessionV1,
  nowMs: number,
): readonly CapabilityToolNameV1[] {
  if (session.revoked || session.mutationSucceeded || nowMs >= session.expiresAtMs) {
    return [];
  }
  const tools: CapabilityToolNameV1[] = [];
  if (session.queryInvocationCount < 4) {
    tools.push("authoring_query_context_v1");
  }
  if (session.mutationInvocationCount < 3) {
    tools.push(
      session.mutationRole === "propose-change"
        ? "authoring_propose_change_v1"
        : "authoring_submit_review_v1",
    );
  }
  return tools;
}

function invocationBindingFailureV1(
  session: CapabilitySessionV1,
  invocation: CapabilityInvocationV1,
): CapabilityInvocationFailureReasonV1 | null {
  if (
    invocation.runId !== session.runId ||
    invocation.workItemId !== session.workItemId ||
    invocation.capabilitySessionId !== session.capabilitySessionId
  ) {
    return "binding_mismatch";
  }
  if (invocation.tool === "authoring_query_context_v1") {
    return session.allowedSelectors.includes(invocation.selector)
      ? null
      : "selector_not_allowed";
  }
  return invocation.proposalSchemaIdentity === session.proposalSchemaIdentity
    ? null
    : "proposal_schema_mismatch";
}

export function recordCapabilityInvocationV1(
  session: CapabilitySessionV1,
  invocation: CapabilityInvocationV1,
  nowMs: number,
  succeeded: boolean,
): CapabilityInvocationResultV1 {
  if (session.revoked || session.mutationSucceeded) {
    return { accepted: false, reason: "revoked", session };
  }
  if (nowMs >= session.expiresAtMs) {
    return {
      accepted: false,
      reason: "expired",
      session: { ...session, revoked: true },
    };
  }
  const bindingFailure = invocationBindingFailureV1(session, invocation);
  if (bindingFailure !== null) {
    return { accepted: false, reason: bindingFailure, session };
  }
  if (!visibleCapabilityToolsV1(session, nowMs).includes(invocation.tool)) {
    const expectedMutation = session.mutationRole === "propose-change"
      ? "authoring_propose_change_v1"
      : "authoring_submit_review_v1";
    const limitReached =
      (invocation.tool === "authoring_query_context_v1" && session.queryInvocationCount >= 4) ||
      (invocation.tool === expectedMutation && session.mutationInvocationCount >= 3);
    return {
      accepted: false,
      reason: limitReached ? "invocation_limit" : "tool_not_exposed",
      session,
    };
  }

  if (invocation.tool === "authoring_query_context_v1") {
    return {
      accepted: true,
      session: {
        ...session,
        queryInvocationCount: session.queryInvocationCount + 1,
      },
    };
  }
  return {
    accepted: true,
    session: {
      ...session,
      mutationInvocationCount: session.mutationInvocationCount + 1,
      mutationSucceeded: succeeded,
      revoked: succeeded,
    },
  };
}

export function revokeCapabilitySessionV1(
  session: CapabilitySessionV1,
): CapabilitySessionV1 {
  return session.revoked ? session : { ...session, revoked: true };
}
