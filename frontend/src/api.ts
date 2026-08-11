import type {
  BattlefieldPresetPublic,
  BattleAdvanceStreamEvent,
  BattleListItem,
  BattlePolicyOption,
  BattlePolicyOptionPublic,
  BattlePublic,
  CharacterActionProposalValidationReceipt,
  EnvironmentProcessReceipt,
  CharacterImprovementPublic,
  CharacterPublic,
  CharacterVisibility,
  FriendPublic,
  UserProfilePublic,
  DialoguePipelineSettings,
  NarrationStylePublic,
  UserPublic,
} from "@kshiai/shared";
import { authenticatedFetch } from "./authenticated-fetch";
import { supabase } from "./supabase";

export type ImageGenQuota = {
  allowed: boolean;
  limitHour: number;
  limitDay: number;
  usedHour: number;
  usedDay: number;
  remainingHour: number;
  remainingDay: number;
  nextAllowedAt: string | null;
  message: string;
};

export type InternalBattleObservationSummary = {
  battleId: string;
  createdAt: string;
  updatedAt: string;
  status: string | null;
  turn: number | null;
  turnLimit: number | null;
  sideAName: string | null;
  sideBName: string | null;
  winnerSide: string | null;
  finishReason: string | null;
  battlefieldName: string | null;
  observationRunId: string | null;
  observedAt: string | null;
};

export type InternalAgentInvocationTrace = {
  input: unknown | null;
  providerStatus: "fulfilled" | "rejected" | "skipped";
  providerOutput: unknown | null;
  actionProposalValidation?: CharacterActionProposalValidationReceipt | null;
  acceptedOutput: unknown | null;
};

export type InternalBattlePipelineTrace = {
  schemaVersion: 1;
  environmentProcess?: EnvironmentProcessReceipt;
  characterAgents?: {
    phase: "prologue" | "turn" | "aftermath";
    a: InternalAgentInvocationTrace;
    b: InternalAgentInvocationTrace;
  };
  narrator?: {
    input: unknown | null;
    disposition: "provider" | "fallback";
    providerOutput: unknown;
    publicOutput: unknown;
  };
};

export type InternalBattleObservationDetail = {
  role: "admin" | "developer" | "test" | "e2e";
  summary: InternalBattleObservationSummary;
  observation: Record<string, unknown> | null;
  rawBattleState: Record<string, unknown>;
  canonicalTimeline: Array<{
    turn: number | null;
    actions: unknown[];
    events: unknown[];
    sideAChange: unknown;
    sideBChange: unknown;
    worldImpact: unknown | null;
    canonicalTransition: unknown | null;
    pipelineTrace: InternalBattlePipelineTrace | null;
  }>;
  canonicalCurrent: {
    semanticState: unknown | null;
    worldState: unknown | null;
    latestSemanticTransition: unknown | null;
    latestWorldTransition: unknown | null;
  };
  capabilities: {
    turnRecordCount: number;
    canonicalTransitionCount: number;
    pipelineTraceCount: number;
    perTurnCanonicalTransitions: "complete" | "partial" | "unavailable";
  };
};

export class ApiError extends Error {
  status: number;
  code?: string;
  quota?: ImageGenQuota;
  constructor(
    message: string,
    opts: { status: number; code?: string; quota?: ImageGenQuota },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.quota = opts.quota;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body != null) {
    headers.set("Content-Type", "application/json");
  }
  const res = await authenticatedFetch(path, {
    ...init,
    headers,
  }, currentAccessToken);
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
    quota?: ImageGenQuota;
  };
  if (!res.ok) {
    const msg =
      data.message ||
      data.error ||
      `http_${res.status}`;
    throw new ApiError(msg, {
      status: res.status,
      code: data.error,
      quota: data.quota,
    });
  }
  return data;
}

async function currentAccessToken(): Promise<string | undefined> {
  if (!supabase) return undefined;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

export const api = {
  health: () => request<{ ok: boolean; llm: string }>("/api/health"),
  me: () => request<{ user: UserPublic }>("/api/me"),
  /** Operator balance metrics (aggregates; no combat effect). */
  balanceSummary: (limit?: number) =>
    request<{
      summary: {
        battles: {
          total: number;
          avgCombatTurns: number | null;
          earlyKoRate: number | null;
          oneShotSuspectRate: number | null;
          shortMatchRate: number | null;
          avgMaxHitRatio: number | null;
        };
        sheets: {
          total: number;
          avgSharpness: number | null;
          highSharpnessRate: number | null;
          inflatedPowerRate: number | null;
        };
        recentFlags: Array<{
          battleId: string;
          createdAt: string;
          earlyKo: boolean;
          oneShotSuspect: boolean;
          shortMatch: boolean;
          maxHitRatio: number;
          combatTurns: number;
          winnerSide: string | null;
        }>;
        logPath: string;
      };
    }>(
      `/api/balance/summary${limit != null ? `?limit=${limit}` : ""}`,
    ),
  getDialoguePipelineSettings: () =>
    request<{ settings: DialoguePipelineSettings }>("/api/admin/dialogue-pipeline"),
  updateDialoguePipelineSettings: (input: {
    expectedRevision: number;
    enabled: boolean;
    conversationHistoryLimit: number;
    contextProjectionMode: "legacy" | "compact";
    recentExchangeLimit: number;
    relevantMemoryLimit: number;
    psychologyGuidance: string;
  }) =>
    request<{ settings: DialoguePipelineSettings }>("/api/admin/dialogue-pipeline", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  listInternalBattleObservations: (limit?: number) =>
    request<{
      role: "admin" | "developer" | "test" | "e2e";
      battles: InternalBattleObservationSummary[];
    }>(
      `/api/internal/observations${limit != null ? `?limit=${limit}` : ""}`,
    ),
  getInternalBattleObservation: (battleId: string) =>
    request<InternalBattleObservationDetail>(
      `/api/internal/observations/${encodeURIComponent(battleId)}`,
    ),
  register: (username: string, password: string) =>
    request<{ user: UserPublic }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ user: UserPublic }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () =>
    request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  listCharacters: (q?: string, page?: { limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (page?.limit != null) sp.set("limit", String(page.limit));
    if (page?.offset != null) sp.set("offset", String(page.offset));
    const qs = sp.toString();
    return request<{
      characters: CharacterPublic[];
      total: number;
      limit: number;
      offset: number;
    }>(`/api/characters${qs ? `?${qs}` : ""}`);
  },
  listFriends: () => request<{ friends: FriendPublic[] }>("/api/friends"),
  addFriend: (target: { username?: string; userId?: string }) =>
    request<{ friend: FriendPublic }>("/api/friends", {
      method: "POST",
      body: JSON.stringify(target),
    }),
  getUser: (id: string) =>
    request<{ user: UserProfilePublic }>(`/api/users/${id}`),
  updateDisplayName: (displayName: string) =>
    request<{ user: UserPublic }>("/api/me/display-name", {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
    }),
  listFavorites: () =>
    request<{ favorites: Array<UserPublic & { createdAt: string }> }>(
      "/api/favorites",
    ),
  addFavorite: (userId: string) =>
    request<{ favorite: UserPublic & { createdAt: string } }>(
      `/api/favorites/${userId}`,
      { method: "POST" },
    ),
  removeFavorite: (userId: string) =>
    request<{ ok: boolean }>(`/api/favorites/${userId}`, { method: "DELETE" }),
  sendFriendRequest: (target: { userId?: string; username?: string }) =>
    request<{ request: { createdAt: string }; targetUserId: string }>(
      "/api/friend-requests",
      { method: "POST", body: JSON.stringify(target) },
    ),
  acceptFriendRequest: (fromUserId: string) =>
    request<{ ok: boolean }>(`/api/friend-requests/${fromUserId}/accept`, {
      method: "POST",
    }),
  rejectFriendRequest: (fromUserId: string) =>
    request<{ ok: boolean }>(`/api/friend-requests/${fromUserId}/reject`, {
      method: "POST",
    }),
  cancelFriendRequest: (toUserId: string) =>
    request<{ ok: boolean }>(`/api/friend-requests/${toUserId}`, {
      method: "DELETE",
    }),
  removeFriend: (userId: string) =>
    request<{ ok: boolean }>(`/api/friends/${userId}`, { method: "DELETE" }),
  setCharacterVisibility: (id: string, visibility: CharacterVisibility) =>
    request<{ character: CharacterPublic }>(`/api/characters/${id}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({ visibility }),
    }),
  getCharacter: (id: string) =>
    request<{ character: CharacterPublic; isOwner: boolean }>(
      `/api/characters/${id}`,
    ),
  listCharacterBattles: (
    id: string,
    opts?: { limit?: number },
  ) => {
    const sp = new URLSearchParams();
    if (opts?.limit != null) sp.set("limit", String(opts.limit));
    const qs = sp.toString();
    return request<{ battles: BattleListItem[]; total: number }>(
      `/api/characters/${id}/battles${qs ? `?${qs}` : ""}`,
    );
  },
  generateCharacter: (prompt: string) =>
    request<{
      draft: {
        id: string;
        character: CharacterPublic;
        assistantMessage: string;
      };
    }>(
      "/api/characters/generate",
      { method: "POST", body: JSON.stringify({ prompt }) },
    ),
  chatCharacterDraft: (id: string, message: string) =>
    request<{
      draft: {
        id: string;
        character: CharacterPublic;
        assistantMessage: string;
      };
    }>(`/api/character-drafts/${id}/chat`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  latestCharacterDraft: () =>
    request<{
      draft: {
        id: string;
        character: CharacterPublic;
        assistantMessage: string;
      } | null;
    }>("/api/character-drafts/latest"),
  confirmCharacterDraft: (id: string) =>
    request<{ character: CharacterPublic; assistantMessage: string }>(
      `/api/characters/${id}/confirm`,
      { method: "POST" },
    ),
  discardCharacterDraft: (id: string) =>
    request<{ ok: boolean }>(`/api/character-drafts/${id}`, {
      method: "DELETE",
    }),
  chatCharacter: (id: string, message: string) =>
    request<{ character: CharacterPublic; assistantMessage: string }>(
      `/api/characters/${id}/chat`,
      { method: "POST", body: JSON.stringify({ message }) },
    ),
  restoreCharacterRevision: (id: string) =>
    request<{ character: CharacterPublic; assistantMessage: string }>(
      `/api/characters/${id}/restore-revision`,
      { method: "POST" },
    ),
  getCharacterImprovement: (id: string) =>
    request<CharacterImprovementPublic>(`/api/characters/${id}/improvement`),
  analyzeCharacterImprovement: (id: string) =>
    request<
      CharacterImprovementPublic & { assistantMessage: string }
    >(`/api/characters/${id}/improvement/analyze`, { method: "POST" }),
  generateCharacterImprovementPrompt: (id: string) =>
    request<{ prompt: string; assistantMessage: string }>(
      `/api/characters/${id}/improvement/prompt`,
      { method: "POST" },
    ),
  copyCharacter: (id: string) =>
    request<{ character: CharacterPublic }>(`/api/characters/${id}/copy`, {
      method: "POST",
    }),
  deleteCharacter: (id: string) =>
    request<{ ok: boolean }>(`/api/characters/${id}`, { method: "DELETE" }),
  generateImage: (id: string, extra?: string) =>
    request<{
      character: CharacterPublic;
      note?: string;
      ok?: boolean;
      quota?: ImageGenQuota;
    }>(`/api/characters/${id}/image`, {
      method: "POST",
      body: JSON.stringify(extra ? { extra } : {}),
    }),
  toggleCharacterImage: (id: string) =>
    request<{ character: CharacterPublic; assistantMessage: string }>(
      `/api/characters/${id}/image/toggle`,
      { method: "POST" },
    ),
  imageQuota: (id: string) =>
    request<{ quota: ImageGenQuota }>(`/api/characters/${id}/image-quota`),
  candidates: (q?: string, page?: { limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (page?.limit != null) sp.set("limit", String(page.limit));
    if (page?.offset != null) sp.set("offset", String(page.offset));
    const qs = sp.toString();
    return request<{
      candidates: CharacterPublic[];
      total: number;
      limit: number;
      offset: number;
    }>(`/api/match/candidates${qs ? `?${qs}` : ""}`);
  },
  randomOpponent: (myCharacterId: string) =>
    request<{ opponent: CharacterPublic }>("/api/match/random", {
      method: "POST",
      body: JSON.stringify({ myCharacterId }),
    }),
  autoOpponent: (myCharacterId: string) =>
    request<{ opponent: CharacterPublic }>("/api/match/auto", {
      method: "POST",
      body: JSON.stringify({ myCharacterId }),
    }),
  generatePolicies: (body: {
    myCharacterId: string;
    opponentCharacterId?: string;
    battlefieldMode?: "random" | "preset";
    battlefieldPresetId?: string;
  }) =>
    request<{
      options: BattlePolicyOptionPublic[];
      engineOptions: BattlePolicyOption[];
      defaultSelectedIds: string[];
      rationale: string;
      fieldHint: string;
    }>("/api/match/policies", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listNarrationStyles: () =>
    request<{ styles: NarrationStylePublic[] }>("/api/narration-styles"),
  createNarrationStyle: (body: {
    displayName: string;
    description?: string;
    instruction: string;
    perspective?: string;
    tags?: string[];
  }) =>
    request<{ style: NarrationStylePublic }>("/api/narration-styles", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  generateNarrationStyle: (prompt: string) =>
    request<{ style: NarrationStylePublic }>("/api/narration-styles/generate", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }),
  updateNarrationStyle: (
    id: string,
    body: {
      displayName?: string;
      description?: string;
      instruction?: string;
      perspective?: string;
      tags?: string[];
    },
  ) =>
    request<{ style: NarrationStylePublic }>(`/api/narration-styles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteNarrationStyle: (id: string) =>
    request<{ ok: boolean }>(`/api/narration-styles/${id}`, {
      method: "DELETE",
    }),
  createBattle: (
    myCharacterId: string,
    opponentCharacterId: string,
    opts?: {
      battlefieldMode?: "random" | "preset";
      battlefieldPresetId?: string;
      stance?: "aggressive" | "balanced" | "defensive" | "opportunistic";
      policies?: BattlePolicyOption[];
      selectedPolicyIds?: string[];
      narrationStyleId?: string;
    },
  ) =>
    request<{ battle: BattlePublic }>("/api/battles", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        myCharacterId,
        opponentCharacterId,
        ...opts,
      }),
    }),
  getBattle: (id: string) =>
    request<{ battle: BattlePublic }>(`/api/battles/${id}`),
  listBattles: (opts?: {
    q?: string;
    status?: "all" | "active" | "finished";
    limit?: number;
    offset?: number;
  }) => {
    const sp = new URLSearchParams();
    if (opts?.q) sp.set("q", opts.q);
    if (opts?.status) sp.set("status", opts.status);
    if (opts?.limit != null) sp.set("limit", String(opts.limit));
    if (opts?.offset != null) sp.set("offset", String(opts.offset));
    const qs = sp.toString();
    return request<{ battles: BattleListItem[]; total: number }>(
      `/api/battles${qs ? `?${qs}` : ""}`,
    );
  },
  deleteBattle: (id: string) =>
    request<{ ok: boolean }>(`/api/battles/${id}`, { method: "DELETE" }),
  /** Advance one turn (actions chosen automatically from stance). */
  advanceBattle: (id: string) =>
    request<{ battle: BattlePublic }>(`/api/battles/${id}/advance`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({}),
    }),
  /**
   * Stream one advance via SSE. Invokes onEvent for phase/narrator progress;
   * resolves with the final battle from the `done` event.
   */
  advanceBattleStream: async (
    id: string,
    opts?: {
      onEvent?: (event: BattleAdvanceStreamEvent) => void;
      signal?: AbortSignal;
    },
  ): Promise<BattlePublic> => {
    const res = await authenticatedFetch(`/api/battles/${id}/advance/stream`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: "{}",
      signal: opts?.signal,
    }, currentAccessToken);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      throw new ApiError(data.message || data.error || `http_${res.status}`, {
        status: res.status,
        code: data.error,
      });
    }
    if (!res.body) {
      throw new ApiError("stream_unavailable", { status: 500 });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalBattle: BattlePublic | null = null;
    let streamError: string | null = null;

    const handleDataLine = (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith(":")) return;
      let event: BattleAdvanceStreamEvent;
      try {
        event = JSON.parse(trimmed) as BattleAdvanceStreamEvent;
      } catch {
        return;
      }
      opts?.onEvent?.(event);
      if (event.type === "done") finalBattle = event.battle;
      if (event.type === "error") streamError = event.message;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by blank lines
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of frame.split("\n")) {
          if (line.startsWith("data:")) {
            handleDataLine(line.slice(5).trimStart());
          }
        }
      }
    }
    // Trailing frame without final blank line
    if (buffer.trim()) {
      for (const line of buffer.split("\n")) {
        if (line.startsWith("data:")) {
          handleDataLine(line.slice(5).trimStart());
        }
      }
    }

    if (streamError) {
      throw new ApiError(streamError, { status: 500, code: streamError });
    }
    if (!finalBattle) {
      throw new ApiError("stream_incomplete", { status: 500 });
    }
    return finalBattle;
  },
  listBattlefields: (q?: string) =>
    request<{ battlefields: BattlefieldPresetPublic[] }>(
      `/api/battlefields${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  generateBattlefield: (prompt: string, category?: string) =>
    request<{ battlefield: BattlefieldPresetPublic; assistantMessage: string }>(
      "/api/battlefields/generate",
      { method: "POST", body: JSON.stringify({ prompt, category }) },
    ),
  chatBattlefield: (id: string, message: string) =>
    request<{ battlefield: BattlefieldPresetPublic; assistantMessage: string }>(
      `/api/battlefields/${id}/chat`,
      { method: "POST", body: JSON.stringify({ message }) },
    ),
  copyBattlefield: (id: string) =>
    request<{ battlefield: BattlefieldPresetPublic }>(
      `/api/battlefields/${id}/copy`,
      { method: "POST" },
    ),
  deleteBattlefield: (id: string) =>
    request<{ ok: boolean }>(`/api/battlefields/${id}`, { method: "DELETE" }),
  generateBattlefieldImage: (id: string) =>
    request<{ battlefield: BattlefieldPresetPublic; note?: string }>(
      `/api/battlefields/${id}/image`,
      { method: "POST" },
    ),
  saveBattlefieldFromBattle: (battleId: string, displayName?: string) =>
    request<{ battlefield: BattlefieldPresetPublic }>(
      "/api/battlefields/from-battle",
      {
        method: "POST",
        body: JSON.stringify({ battleId, displayName }),
      },
    ),
};
