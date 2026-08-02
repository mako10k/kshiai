import type {
  BattlefieldPresetPublic,
  BattleListItem,
  BattlePolicyOption,
  BattlePolicyOptionPublic,
  BattlePublic,
  CharacterPublic,
  NarrationStylePublic,
  UserPublic,
} from "@kshiai/shared";

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
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });
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
  listCharacters: (q?: string) =>
    request<{ characters: CharacterPublic[] }>(
      `/api/characters${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
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
    request<{ character: CharacterPublic; assistantMessage: string }>(
      "/api/characters/generate",
      { method: "POST", body: JSON.stringify({ prompt }) },
    ),
  chatCharacter: (id: string, message: string) =>
    request<{ character: CharacterPublic; assistantMessage: string }>(
      `/api/characters/${id}/chat`,
      { method: "POST", body: JSON.stringify({ message }) },
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
  imageQuota: (id: string) =>
    request<{ quota: ImageGenQuota }>(`/api/characters/${id}/image-quota`),
  candidates: (q?: string) =>
    request<{ candidates: CharacterPublic[] }>(
      `/api/match/candidates${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
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
      body: JSON.stringify({}),
    }),
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
