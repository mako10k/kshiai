import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CharacterSheet } from "@kshiai/shared";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mediaRoot = path.resolve(__dirname, "../../data/media");
const logDir = path.resolve(__dirname, "../../data/logs");
const imageLogPath = path.join(logDir, "image-gen.jsonl");

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

/** Append one JSON line for image-gen diagnostics (no API keys). */
export function logImageEvent(
  event: Record<string, unknown>,
): void {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...event,
    });
    fs.appendFileSync(imageLogPath, line + "\n", "utf8");
    // Mirror short line to PM2 logs
    const level = event.ok === false || event.phase === "error" ? "error" : "info";
    const short = `[image] ${event.phase ?? "event"} char=${event.characterId ?? "?"} ${event.message ?? event.error ?? ""}`.trim();
    if (level === "error") console.error(short);
    else console.info(short);
  } catch (e) {
    console.error("[image] log write failed", e);
  }
}

/**
 * Strip wording that often trips xAI image moderation
 * (age ambiguity, clothing mishaps, exposure, excessive "cute girl").
 */
export function sanitizePortraitSource(text: string): string {
  let s = text.normalize("NFKC");

  // Age / minor-adjacent (EN + JA)
  const agePatterns: RegExp[] = [
    /\b(child|children|kid|kids|toddler|infant|baby|preteen|underage|minor)\b/gi,
    /\b(loli|shota|pedophile|jailbait)\b/gi,
    /\b(young\s*(girl|boy|child|teen|lady|woman|man|person)?)\b/gi,
    /\b(teen(age(d)?)?|adolescent|schoolgirl|schoolboy)\b/gi,
    /\b(little\s+(girl|boy|one))\b/gi,
    /\bvery\s+youthful\b/gi,
    /\byouthful\b/gi,
    /\b(girl|boy)\b/gi, // force adult framing later
    /子供|児童|幼児|幼女|幼い|未成年|ロリ|ショタ|少女|少年|女の子|男の子|ティーン|学生服|制服/g,
    /とても若い|若くて|幼げ|あどけない/g,
  ];
  for (const re of agePatterns) s = s.replace(re, " ");

  // Clothing mishap / suggestive (common false-positive + real policy hits)
  const nsfwPatterns: RegExp[] = [
    /\b(nude|naked|nsfw|explicit|erotic|sexy|seductive|cleavage|lingerie|underwear|panties|bra)\b/gi,
    /\b(torn|ripped|askew|slipping|slip off|falling off|wardrobe\s*malfunction)\b/gi,
    /\b(exposed|exposure|revealing|bare\s+skin|see-?through)\b/gi,
    /\b(embarrassed\s+blush|blush(ing)?)\b/gi,
    /露出|はだけ|乱れ|ずり落ち|破け|破れた|透け|下着|裸|セクシー|扇情/g,
    /服が引っかか|尊厳があっという間に危機/g,
  ];
  for (const re of nsfwPatterns) s = s.replace(re, " ");

  // Collapse whitespace / punctuation noise
  s = s
    .replace(/[「」『』【】]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*([,.;:!?])\s*/g, "$1 ")
    .trim();

  return s;
}

function asciiNameHint(name: string): string {
  // Keep Latin names; otherwise generic so moderation doesn't see odd tokens only
  const latin = name.replace(/[^a-zA-Z0-9 _-]/g, "").trim();
  if (latin.length >= 2) return latin.slice(0, 40);
  return "anime adventurer";
}

/**
 * Build a moderation-safer English portrait prompt.
 * xAI returns 400 for empty prompts and rejects many "young girl" / clothing-slip prompts.
 */
export function buildCharacterPortraitPrompt(
  sheet: CharacterSheet,
  extra?: string,
): string {
  const name = sheet.displayName?.trim() || "hero";
  const nameHint = asciiNameHint(name);
  const summary = sanitizePortraitSource(sheet.appearance?.summary ?? "");
  const visual = sanitizePortraitSource(sheet.appearance?.visualPrompt ?? "");
  const traits = sanitizePortraitSource(
    (sheet.traits ?? []).filter(Boolean).join(", "),
  );
  const weapon = sanitizePortraitSource(sheet.weapon?.name?.trim() ?? "");
  const armor = sanitizePortraitSource(sheet.armor?.name?.trim() ?? "");
  const extraText = sanitizePortraitSource(extra?.trim() ?? "");

  const parts = [
    "Safe-for-work anime style character portrait",
    "adult character, clearly 20s age appearance, mature proportions",
    "upper body bust shot, face clearly visible, detailed eyes and hair",
    `character name vibe: ${nameHint}`,
    visual || null,
    summary || null,
    traits ? `personality vibe: ${traits}` : null,
    weapon ? `associated with ${weapon}` : null,
    armor ? `wearing modest ${armor}` : null,
    extraText || null,
    "fully clothed, intact outfit, no torn clothes, no nudity, no sexualization",
    "single character only, soft dramatic lighting, clean simple background",
    "no text, no watermark, no UI, no collage, no blood, no gore",
  ].filter((p): p is string => Boolean(p && p.length > 0));

  let prompt = parts.join(". ").replace(/\s+/g, " ").trim();
  if (prompt.length < 24) {
    prompt = safeFallbackPrompt(nameHint);
  }
  if (prompt.length > 1800) prompt = prompt.slice(0, 1800);
  return prompt;
}

function safeFallbackPrompt(nameHint: string): string {
  return [
    "Safe-for-work anime style character portrait",
    "adult character in their twenties, mature face",
    "upper body bust, detailed eyes and hair",
    `adventurer named ${nameHint}`,
    "modest fantasy outfit fully clothed",
    "soft lighting, clean background, single character, no text, no watermark",
  ].join(". ");
}

type ImageGenResult = { url: string; note: string; ok: boolean };

async function generateWithXai(
  prompt: string,
  meta: { characterId: string; attempt: number; tag: string },
): Promise<string> {
  const apiKey = config.xai.apiKey || process.env.XAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not set on the server");
  }
  if (!prompt.trim()) {
    throw new Error("empty_prompt");
  }

  const body: Record<string, unknown> = {
    model: config.xai.imageModel || "grok-imagine-image",
    prompt: prompt.trim(),
    aspect_ratio: "1:1",
  };

  const baseUrl = (config.xai.baseUrl || "https://api.x.ai/v1").replace(
    /\/$/,
    "",
  );
  const url = `${baseUrl}/images/generations`;
  const started = Date.now();

  logImageEvent({
    phase: "request",
    characterId: meta.characterId,
    attempt: meta.attempt,
    tag: meta.tag,
    model: body.model,
    promptLen: prompt.length,
    promptPreview: prompt.slice(0, 240),
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const ms = Date.now() - started;

  if (!res.ok) {
    let detail = text.slice(0, 500);
    let code: string | undefined;
    try {
      const j = JSON.parse(text) as {
        error?: string | { message?: string };
        code?: string;
        message?: string;
      };
      if (typeof j.error === "string") detail = j.error;
      else if (j.error && typeof j.error === "object")
        detail = j.error.message || detail;
      else if (j.message) detail = j.message;
      code = j.code;
    } catch {
      /* keep raw */
    }
    logImageEvent({
      phase: "error",
      ok: false,
      characterId: meta.characterId,
      attempt: meta.attempt,
      tag: meta.tag,
      status: res.status,
      code,
      error: detail,
      ms,
      responsePreview: text.slice(0, 400),
    });
    throw new Error(`xai_${res.status}:${detail}`);
  }

  let data: {
    data?: Array<{
      url?: string;
      b64_json?: string;
      respect_moderation?: boolean;
    }>;
  };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    logImageEvent({
      phase: "error",
      ok: false,
      characterId: meta.characterId,
      attempt: meta.attempt,
      tag: meta.tag,
      error: "invalid_json_response",
      ms,
      responsePreview: text.slice(0, 400),
    });
    throw new Error("xai_invalid_json");
  }

  const item = data.data?.[0];
  if (item && item.respect_moderation === false) {
    logImageEvent({
      phase: "error",
      ok: false,
      characterId: meta.characterId,
      attempt: meta.attempt,
      tag: meta.tag,
      error: "respect_moderation=false",
      ms,
    });
    throw new Error("xai_moderation_filtered");
  }
  if (item?.url) {
    logImageEvent({
      phase: "response_ok",
      ok: true,
      characterId: meta.characterId,
      attempt: meta.attempt,
      tag: meta.tag,
      ms,
      hasUrl: true,
    });
    return item.url;
  }
  if (item?.b64_json) {
    logImageEvent({
      phase: "response_ok",
      ok: true,
      characterId: meta.characterId,
      attempt: meta.attempt,
      tag: meta.tag,
      ms,
      hasB64: true,
      b64Len: item.b64_json.length,
    });
    return `data:image/jpeg;base64,${item.b64_json}`;
  }

  logImageEvent({
    phase: "error",
    ok: false,
    characterId: meta.characterId,
    attempt: meta.attempt,
    tag: meta.tag,
    error: "empty_data",
    ms,
    responsePreview: text.slice(0, 400),
  });
  throw new Error("xai_image_empty_response");
}

async function downloadToFile(
  sourceUrl: string,
  destPath: string,
  characterId: string,
): Promise<void> {
  if (sourceUrl.startsWith("data:")) {
    const b64 = sourceUrl.split(",")[1] ?? "";
    const buf = Buffer.from(b64, "base64");
    fs.writeFileSync(destPath, buf);
    logImageEvent({
      phase: "saved",
      ok: true,
      characterId,
      bytes: buf.length,
      source: "b64",
      dest: path.basename(destPath),
    });
    return;
  }
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`download_failed:${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error("download_too_small");
  fs.writeFileSync(destPath, buf);
  logImageEvent({
    phase: "saved",
    ok: true,
    characterId,
    bytes: buf.length,
    source: "url",
    dest: path.basename(destPath),
  });
}

function isModerationError(msg: string): boolean {
  return /moderation|content.?policy|rejected|filtered|safety/i.test(msg);
}

/**
 * Generate a character portrait, persist under data/media, return public URL path.
 * On moderation rejection, retries once with a ultra-safe fallback prompt.
 */
export async function generateAndStoreCharacterPortrait(
  sheet: CharacterSheet,
  extra?: string,
): Promise<ImageGenResult> {
  const dest = absoluteMediaFile("characters", sheet.id);
  const primary = buildCharacterPortraitPrompt(sheet, extra);
  const fallback = safeFallbackPrompt(asciiNameHint(sheet.displayName ?? "hero"));

  logImageEvent({
    phase: "start",
    characterId: sheet.id,
    displayName: sheet.displayName,
    primaryLen: primary.length,
    hasVisual: Boolean(sheet.appearance?.visualPrompt?.trim()),
    hasSummary: Boolean(sheet.appearance?.summary?.trim()),
  });

  const attempts: Array<{ tag: string; prompt: string }> = [
    { tag: "sanitized", prompt: primary },
  ];
  // Always prepare fallback for moderation
  if (fallback !== primary) {
    attempts.push({ tag: "safe_fallback", prompt: fallback });
  }

  let lastErr = "unknown";
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i]!;
    try {
      const remote = await generateWithXai(a.prompt, {
        characterId: sheet.id,
        attempt: i + 1,
        tag: a.tag,
      });
      await downloadToFile(remote, dest, sheet.id);
      const url = publicMediaPath("characters", sheet.id);
      logImageEvent({
        phase: "done",
        ok: true,
        characterId: sheet.id,
        tag: a.tag,
        attempt: i + 1,
        message: "portrait_saved",
      });
      return {
        url,
        note:
          a.tag === "safe_fallback"
            ? "顔画像を生成しました（安全寄りの再試行プロンプト）。"
            : "顔画像を生成しました。",
        ok: true,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = msg;
      logImageEvent({
        phase: "attempt_failed",
        ok: false,
        characterId: sheet.id,
        attempt: i + 1,
        tag: a.tag,
        error: msg,
      });
      // Retry only on moderation / empty; hard auth errors stop early
      if (/XAI_API_KEY|401|403|unauthorized/i.test(msg)) break;
      if (!isModerationError(msg) && !/empty|invalid/i.test(msg) && i === 0) {
        // still try fallback once for empty-ish failures
        continue;
      }
    }
  }

  // Soft fallback: dicebear so UI still has a face
  const seed = encodeURIComponent(
    [sheet.displayName, ...(sheet.traits ?? []).slice(0, 3)].join("|") ||
      sheet.id,
  );
  const url = `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=1a2744,2a1b3d&radius=20`;
  logImageEvent({
    phase: "fallback_avatar",
    ok: false,
    characterId: sheet.id,
    error: lastErr,
    message: "using_dicebear",
  });
  return {
    url,
    note: `画像生成に失敗したため代替画像を使いました（${lastErr.slice(0, 140)}）`,
    ok: false,
  };
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
