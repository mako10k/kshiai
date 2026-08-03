import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BattlefieldPreset, CharacterSheet } from "@kshiai/shared";
import { config } from "../config.js";
import { createImageProvider, type ImageProvider } from "../image/index.js";
import { putR2Image, type MediaKind } from "./r2-storage.js";

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
  variant: "primary" | "previous" = "primary",
): string {
  const file = variant === "previous" ? `${id}.prev.jpg` : `${id}.jpg`;
  return `/api/media/${kind}/${file}`;
}

export function absoluteMediaFile(
  kind: "characters" | "battlefields",
  id: string,
  variant: "primary" | "previous" = "primary",
): string {
  const file = variant === "previous" ? `${id}.prev.jpg` : `${id}.jpg`;
  return path.join(mediaDir(kind), file);
}

/**
 * Resolve a stored /api/media/... URL to an absolute file path under media root.
 */
export function absolutePathFromPublicMediaUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  try {
    const pathname = new URL(url, "http://local.invalid").pathname;
    const m = pathname.match(
      /^\/api\/media\/(characters|battlefields)\/([a-zA-Z0-9_.-]+\.jpe?g)$/i,
    );
    if (!m) return null;
    const kind = m[1] as "characters" | "battlefields";
    const file = m[2]!;
    const full = path.join(mediaDir(kind), file);
    if (!full.startsWith(mediaDir(kind))) return null;
    return full;
  } catch {
    return null;
  }
}

/**
 * Copy the currently active portrait to the previous slot before a re-gen.
 * Returns the public URL of the archived previous image, or null if nothing to archive.
 */
export function archiveActiveCharacterPortrait(
  sheet: CharacterSheet,
): string | null {
  const activeUrl = sheet.appearance.imageUrl ?? null;
  const activePath =
    absolutePathFromPublicMediaUrl(activeUrl) ??
    absoluteMediaFile("characters", sheet.id, "primary");
  if (!fs.existsSync(activePath)) return null;

  const prevPath = absoluteMediaFile("characters", sheet.id, "previous");
  // Avoid no-op copy when already writing over the same file later.
  try {
    fs.copyFileSync(activePath, prevPath);
  } catch (e) {
    logImageEvent({
      phase: "archive_failed",
      ok: false,
      characterId: sheet.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
  const previousUrl = publicMediaPath("characters", sheet.id, "previous");
  logImageEvent({
    phase: "archived_previous",
    ok: true,
    characterId: sheet.id,
    previousUrl,
  });
  return previousUrl;
}

/** Append one JSON line for image-gen diagnostics (no API keys). */
export function logImageEvent(
  event: Record<string, unknown>,
): void {
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...event,
    });
    if (process.env.NODE_ENV !== "production") {
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(imageLogPath, line + "\n", "utf8");
    }
    // Mirror short line to PM2 logs
    const level = event.ok === false || event.phase === "error" ? "error" : "info";
    const assetId = event.assetId ?? event.characterId ?? "?";
    const short = `[image] ${event.phase ?? "event"} asset=${assetId} ${event.message ?? event.error ?? ""}`.trim();
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

type ImageGenResult = {
  url: string;
  /** Public URL of the archived previous portrait, if any. */
  previousUrl: string | null;
  note: string;
  ok: boolean;
};

async function generateWithProvider(
  prompt: string,
  aspectRatio: "1:1" | "16:9",
  meta: { assetId: string; attempt: number; tag: string },
  provider: ImageProvider,
): Promise<string> {
  const started = Date.now();
  logImageEvent({
    phase: "request",
    assetId: meta.assetId,
    attempt: meta.attempt,
    tag: meta.tag,
    provider: provider.name,
    aspectRatio,
    promptLen: prompt.length,
    promptPreview: prompt.slice(0, 240),
  });
  try {
    const result = await provider.generate({ prompt, aspectRatio });
    logImageEvent({
      phase: "response_ok",
      ok: true,
      assetId: meta.assetId,
      attempt: meta.attempt,
      tag: meta.tag,
      provider: provider.name,
      ms: Date.now() - started,
    });
    return result.sourceUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logImageEvent({
      phase: "error",
      ok: false,
      assetId: meta.assetId,
      attempt: meta.attempt,
      tag: meta.tag,
      provider: provider.name,
      error: message,
      ms: Date.now() - started,
    });
    throw error;
  }
}

async function downloadImage(
  sourceUrl: string,
): Promise<Buffer> {
  let buffer: Buffer;
  if (sourceUrl.startsWith("data:")) {
    const b64 = sourceUrl.split(",")[1] ?? "";
    buffer = Buffer.from(b64, "base64");
  } else {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`download_failed:${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  }
  if (buffer.length < 100) throw new Error("download_too_small");
  return buffer;
}

async function persistImage(
  sourceUrl: string,
  kind: MediaKind,
  id: string,
): Promise<string> {
  const buffer = await downloadImage(sourceUrl);
  if (config.mediaStorage === "r2") {
    const url = await putR2Image({ kind, id, body: buffer });
    logImageEvent({
      phase: "saved",
      ok: true,
      assetId: id,
      bytes: buffer.length,
      source: sourceUrl.startsWith("data:") ? "b64" : "url",
      dest: url,
      storage: "r2",
    });
    return url;
  }

  const destPath = absoluteMediaFile(kind, id, "primary");
  const tempPath = `${destPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, destPath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
  logImageEvent({
    phase: "saved",
    ok: true,
    assetId: id,
    bytes: buffer.length,
    source: sourceUrl.startsWith("data:") ? "b64" : "url",
    dest: path.basename(destPath),
    storage: "local",
  });
  return publicMediaPath(kind, id, "primary");
}

function isModerationError(msg: string): boolean {
  return /moderation|content.?policy|rejected|filtered|safety/i.test(msg);
}

/**
 * Generate a character portrait, persist to configured shared storage, and return its URL.
 * On moderation rejection, retries once with a ultra-safe fallback prompt.
 */
export async function generateAndStoreCharacterPortrait(
  sheet: CharacterSheet,
  extra?: string,
  provider: ImageProvider = createImageProvider(),
): Promise<ImageGenResult> {
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

  // Archive the portrait currently shown so the owner can toggle back.
  const previousUrl = config.mediaStorage === "r2"
    ? sheet.appearance.imageUrl ?? null
    : archiveActiveCharacterPortrait(sheet);

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
      const remote = await generateWithProvider(
        a.prompt,
        "1:1",
        {
          assetId: sheet.id,
          attempt: i + 1,
          tag: a.tag,
        },
        provider,
      );
      const url = await persistImage(remote, "characters", sheet.id);
      logImageEvent({
        phase: "done",
        ok: true,
        characterId: sheet.id,
        tag: a.tag,
        attempt: i + 1,
        message: "portrait_saved",
        previousUrl,
      });
      return {
        url,
        previousUrl,
        note:
          a.tag === "safe_fallback"
            ? previousUrl
              ? "顔画像を生成しました（安全寄りの再試行）。直前の画像は切り替えで戻せます。"
              : "顔画像を生成しました（安全寄りの再試行プロンプト）。"
            : previousUrl
              ? "顔画像を生成しました。直前の画像はプレビュー切替で戻せます。"
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
      if (/401|403|unauthorized|provider_unavailable/i.test(msg)) break;
      if (!isModerationError(msg) && !/empty|invalid/i.test(msg) && i === 0) {
        // still try fallback once for empty-ish failures
        continue;
      }
    }
  }

  throw new Error(lastErr);
}

export function buildBattlefieldImagePrompt(
  preset: BattlefieldPreset,
  extra?: string,
): string {
  const parts = [
    "Cinematic anime fantasy battlefield environment",
    preset.appearance.visualPrompt.trim(),
    preset.appearance.summary.trim(),
    preset.terrainHints.length > 0
      ? `terrain: ${preset.terrainHints.join(", ")}`
      : null,
    preset.obstacleHints.length > 0
      ? `obstacles: ${preset.obstacleHints.join(", ")}`
      : null,
    preset.conditionHints.length > 0
      ? `environmental conditions: ${preset.conditionHints.join(", ")}`
      : null,
    preset.narrativeBlurb.trim(),
    extra?.trim() || null,
    "wide establishing shot, clear traversable arena, dramatic depth and lighting",
    "environment only, no characters, no text, no watermark, no UI, no collage",
  ].filter((part): part is string => Boolean(part));
  return parts.join(". ").replace(/\s+/g, " ").slice(0, 1800).trim();
}

export async function generateAndStoreBattlefieldImage(
  preset: BattlefieldPreset,
  extra?: string,
  provider: ImageProvider = createImageProvider(),
): Promise<ImageGenResult> {
  const prompt = buildBattlefieldImagePrompt(preset, extra);
  const remote = await generateWithProvider(
    prompt,
    "16:9",
    { assetId: preset.id, attempt: 1, tag: "battlefield" },
    provider,
  );
  const url = await persistImage(remote, "battlefields", preset.id);
  return {
    url,
    previousUrl: null,
    note: "戦場画像を生成しました。",
    ok: true,
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
