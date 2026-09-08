import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { smokeAuthenticatedReadSurface } from "./authenticated-read-surface-smoke.js";

describe("authenticated read-surface smoke", () => {
  it("exercises the retained-data and screen-facing read endpoints", async () => {
    const paths: string[] = [];
    const fixtureCharacterId = "chr retained/data";
    const responses = new Map<string, unknown>([
      ["/api/me", { user: { id: "user-smoke" } }],
      ["/api/notifications?limit=20", { notifications: [], unreadCount: 0 }],
      ["/api/characters?limit=10&offset=0", { characters: [], total: 0 }],
      ["/api/friends", { friends: [] }],
      ["/api/favorites", { favorites: [] }],
      ["/api/match/candidates?limit=10&offset=0", { candidates: [], total: 0 }],
      ["/api/battlefields", { battlefields: [] }],
      ["/api/battlefields?selectable=true", { battlefields: [] }],
      ["/api/narration-styles", { styles: [] }],
      ["/api/narration-styles?selectable=true", { styles: [] }],
      ["/api/battles?status=all&limit=10&offset=0", { battles: [], total: 0 }],
      ["/api/characters/chr%20retained%2Fdata", {
        character: { id: fixtureCharacterId },
        isOwner: true,
      }],
      ["/api/characters/chr%20retained%2Fdata/battles?limit=10", {
        battles: [],
        total: 0,
      }],
    ]);
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      paths.push(`${url.pathname}${url.search}`);
      assert.equal(init?.headers && new Headers(init.headers).get("authorization"), "Bearer token");
      const body = responses.get(`${url.pathname}${url.search}`);
      assert.notEqual(body, undefined);
      return Response.json(body);
    };

    await smokeAuthenticatedReadSurface({
      apiBaseUrl: "https://example.test/",
      accessToken: "token",
      fixtureCharacterId,
      fetchImpl,
    });

    assert.deepEqual(paths, [...responses.keys()]);
  });

  it("fails with the endpoint identity when one screen read fails", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/characters") {
        return new Response("legacy candidate rejected", { status: 400 });
      }
      if (url.pathname === "/api/me") return Response.json({ user: { id: "user-smoke" } });
      return Response.json({ notifications: [], unreadCount: 0 });
    };

    await assert.rejects(
      smokeAuthenticatedReadSurface({
        apiBaseUrl: "https://example.test",
        accessToken: "token",
        fixtureCharacterId: "chr-smoke",
        fetchImpl,
      }),
      /Authenticated characters smoke failed: 400: legacy candidate rejected/,
    );
  });
});
