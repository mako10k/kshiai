import type {
  BattlePublic,
  CharacterPublic,
  UserPublic,
} from "@kshiai/shared";

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `http_${res.status}`);
  }
  return data;
}

export const api = {
  health: () => request<{ ok: boolean; llm: string }>("/api/health"),
  me: () => request<{ user: UserPublic }>("/api/me"),
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
  generateImage: (id: string) =>
    request<{ character: CharacterPublic; note?: string }>(
      `/api/characters/${id}/image`,
      { method: "POST" },
    ),
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
  createBattle: (myCharacterId: string, opponentCharacterId: string) =>
    request<{ battle: BattlePublic }>("/api/battles", {
      method: "POST",
      body: JSON.stringify({ myCharacterId, opponentCharacterId }),
    }),
  getBattle: (id: string) =>
    request<{ battle: BattlePublic }>(`/api/battles/${id}`),
  battleAction: (
    id: string,
    action: { kind: "skill" | "defend" | "wait"; skillId?: string },
  ) =>
    request<{ battle: BattlePublic }>(`/api/battles/${id}/action`, {
      method: "POST",
      body: JSON.stringify(action),
    }),
};
