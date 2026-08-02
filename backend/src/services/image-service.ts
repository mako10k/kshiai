import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CharacterSheet } from "@kshiai/shared";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mediaRoot = path.resolve(__dirname, "../../data/media");

export function mediaDir(...parts: string[]): string {
  const dir = path.join(mediaRoot, ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function publicMediaPath(
  kind: "characters" | "battlefields",
  id: string,
): string {
  return `/api/media/${kind}/${id}.jpg`;
}

export function absoluteMediaFile(
  kind: "characters" | "battlefields",
  id: string,
): string {
  return path.join(mediaDir(kind), `${id}.jpg`);
}

/**
 * Build a non-empty English-leaning portrait prompt.
 * xAI returns 400 for empty prompts.
 */
export function buildCharacterPortraitPrompt(
  sheet: CharacterSheet,
  extra?: string,
): string {
  const summary = (sheet.appearance?.summary ?? "").trim();
  const visual = (sheet.appearance?.visualPrompt ?? "").trim();
  const traits = (sheet.traits ?? []).filter(Boolean).join(", ");
  const weapon = sheet.weapon?.name?.trim();
  const armor = sheet.armor?.name?.trim();
  const name = sheet.displayName?.trim() || "anime hero";
  const extraText = extra?.trim() ?? "";

  const parts = [
    "Anime style character portrait, upper body bust shot, face clearly visible",
    `character: ${name}`,
    visual || null,
    summary || null,
    traits ? `traits and vibe: ${traits}` : null,
    weapon ? `holding or associated with ${weapon}` : null,
    armor ? `wearing ${armor}` : null,
    extraText || null,
    "single character only, detailed eyes and hair, soft dramatic lighting, clean background, no text, no watermark, no UI, no collage",
  ].filter((p): p is string => Boolean(p && p.length > 0));

  let prompt = parts.join(". ").replace(/\s+/g, " ").trim();
  // Hard guarantee non-empty for xAI
  if (prompt.length < 8) {
    prompt =
      "Anime character portrait bust, detailed face, expressive eyes, soft lighting, single character, no text";
  }
  // API-friendly length
  if (prompt.length > 2000) prompt = prompt.slice(0, 2000);
  return prompt;
}

type ImageGenResult = { url: string; note: string };

async function generateWithXai(prompt: string): Promise<string> {
  const apiKey = config.xai.apiKey || process.env.XAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not set on the server");
  }
  if (!prompt.trim()) {
    throw new Error("empty_prompt");
  }

  // Official shape per docs: model + prompt (+ optional aspect_ratio).
  // Empty prompt → xAI HTTP 400 "Prompt cannot be empty".
  const body: Record<string, unknown> = {
    model: config.xai.imageModel || "grok-imagine-image",
    prompt: prompt.trim(),
    aspect_ratio: "1:1",
  };

  const baseUrl = (config.xai.baseUrl || "https://api.x.ai/v1").replace(
    /\/$/,
    "",
  );
  const res = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    // Surface xAI message for debugging (truncated)
    let detail = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { error?: string; code?: string };
      detail = j.error || j.code || detail;
    } catch {
      /* keep raw */
    }
    throw new Error(`xai_${res.status}:${detail}`);
  }

  const data = JSON.parse(text) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };
  const item = data.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:image/jpeg;base64,${item.b64_json}`;
  throw new Error("xai_image_empty_response");
}

async function downloadToFile(
  sourceUrl: string,
  destPath: string,
): Promise<void> {
  if (sourceUrl.startsWith("data:")) {
    const b64 = sourceUrl.split(",")[1] ?? "";
    fs.writeFileSync(destPath, Buffer.from(b64, "base64"));
    return;
  }
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`download_failed:${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error("download_too_small");
  fs.writeFileSync(destPath, buf);
}

/**
 * Generate a character portrait, persist under data/media, return public URL path.
 */
export async function generateAndStoreCharacterPortrait(
  sheet: CharacterSheet,
  extra?: string,
): Promise<ImageGenResult> {
  const prompt = buildCharacterPortraitPrompt(sheet, extra);
  const dest = absoluteMediaFile("characters", sheet.id);

  try {
    const remote = await generateWithXai(prompt);
    await downloadToFile(remote, dest);
    // Clean path only — cache-bust query is added in toPublicCharacter via updatedAt
    const url = publicMediaPath("characters", sheet.id);
    return {
      url,
      note: "顔画像を生成しました。",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[image] generation failed:", msg, "promptLen=", prompt.length);

    // Only use dicebear if API truly unavailable — still return 200 to client
    // with clear note so UI isn't a hard failure.
    const seed = encodeURIComponent(
      [sheet.displayName, ...(sheet.traits ?? []).slice(0, 3)].join("|") ||
        sheet.id,
    );
    const url = `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=1a2744,2a1b3d&radius=20`;
    return {
      url,
      note: `画像生成に失敗したため代替画像を使いました（${msg.slice(0, 120)}）`,
    };
  }
}

export function resolveMediaFile(
  kind: string,
  file: string,
): string | null {
  if (kind !== "characters" && kind !== "battlefields") return null;
  if (!/^[a-zA-Z0-9_.-]+\.jpe?g$/i.test(file)) return null;
  const base = mediaDir(kind);
  const full = path.join(base, file);
  if (!full.startsWith(base)) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}
