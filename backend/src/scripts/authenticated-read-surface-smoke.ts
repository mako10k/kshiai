import { z } from "zod";

const PageSchema = z.object({
  total: z.number().int().nonnegative(),
});

const ReadSurfaceSchema = {
  me: z.object({ user: z.object({ id: z.string().min(1) }) }),
  notifications: z.object({
    notifications: z.array(z.unknown()),
    unreadCount: z.number().int().nonnegative(),
  }),
  characters: PageSchema.extend({ characters: z.array(z.unknown()) }),
  friends: z.object({ friends: z.array(z.unknown()) }),
  favorites: z.object({ favorites: z.array(z.unknown()) }),
  candidates: PageSchema.extend({ candidates: z.array(z.unknown()) }),
  battlefields: z.object({ battlefields: z.array(z.unknown()) }),
  narrationStyles: z.object({ styles: z.array(z.unknown()) }),
  battles: PageSchema.extend({ battles: z.array(z.unknown()) }),
  character: z.object({
    character: z.object({ id: z.string().min(1) }),
    isOwner: z.boolean(),
  }),
  characterBattles: PageSchema.extend({ battles: z.array(z.unknown()) }),
} as const;

type SmokeInput = {
  apiBaseUrl: string;
  accessToken: string;
  originSecret?: string;
  fixtureCharacterId: string;
  fetchImpl?: typeof fetch;
};

export async function smokeAuthenticatedReadSurface(input: SmokeInput): Promise<void> {
  const baseUrl = input.apiBaseUrl.replace(/\/$/, "");
  const request = input.fetchImpl ?? fetch;
  const encodedCharacterId = encodeURIComponent(input.fixtureCharacterId);
  const probes = [
    ["me", "/api/me", ReadSurfaceSchema.me],
    ["notifications", "/api/notifications?limit=20", ReadSurfaceSchema.notifications],
    ["characters", "/api/characters?limit=10&offset=0", ReadSurfaceSchema.characters],
    ["friends", "/api/friends", ReadSurfaceSchema.friends],
    ["favorites", "/api/favorites", ReadSurfaceSchema.favorites],
    ["match candidates", "/api/match/candidates?limit=10&offset=0", ReadSurfaceSchema.candidates],
    ["battlefields", "/api/battlefields", ReadSurfaceSchema.battlefields],
    ["selectable battlefields", "/api/battlefields?selectable=true", ReadSurfaceSchema.battlefields],
    ["narration styles", "/api/narration-styles", ReadSurfaceSchema.narrationStyles],
    ["selectable narration styles", "/api/narration-styles?selectable=true", ReadSurfaceSchema.narrationStyles],
    ["battles", "/api/battles?status=all&limit=10&offset=0", ReadSurfaceSchema.battles],
    ["character detail", `/api/characters/${encodedCharacterId}`, ReadSurfaceSchema.character],
    ["character battles", `/api/characters/${encodedCharacterId}/battles?limit=10`, ReadSurfaceSchema.characterBattles],
  ] as const;

  for (const [label, path, schema] of probes) {
    const response = await request(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        ...(input.originSecret ? { "x-kshiai-origin": input.originSecret } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      throw new Error(`Authenticated ${label} smoke failed: ${response.status}: ${detail}`);
    }
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(`Authenticated ${label} smoke returned an invalid response shape`);
    }
  }
}
