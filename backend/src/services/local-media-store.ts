// R: Resolve and archive local media files under a caller-owned filesystem root.
import fs from "node:fs";
import path from "node:path";

type LocalMediaKind = "characters" | "battlefields";
type LocalMediaVariant = "primary" | "previous";

export type LocalMediaArchiveEvent =
  | { phase: "archive_failed"; ok: false; characterId: string; error: string }
  | { phase: "archived_previous"; ok: true; characterId: string; previousUrl: string };

export type LocalMediaStore = {
  mediaDir(...parts: string[]): string;
  absoluteMediaFile(kind: LocalMediaKind, id: string, variant?: LocalMediaVariant): string;
  absolutePathFromPublicMediaUrl(url: string | null | undefined): string | null;
  archivePortrait(id: string, imageUrl: string | null | undefined): string | null;
  resolveMediaFile(kind: string, file: string): string | null;
};

export function publicMediaPath(
  kind: LocalMediaKind,
  id: string,
  variant: LocalMediaVariant = "primary",
): string {
  const file = variant === "previous" ? `${id}.prev.jpg` : `${id}.jpg`;
  return `/api/media/${kind}/${file}`;
}

/** Real local media operations; the root and archive log sink belong to the caller. */
export function createLocalMediaStore(
  root: string,
  recordArchiveEvent: (event: LocalMediaArchiveEvent) => void,
): LocalMediaStore {
  function mediaDir(...parts: string[]): string {
    const dir = path.join(root, ...parts);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function absoluteMediaFile(
    kind: LocalMediaKind,
    id: string,
    variant: LocalMediaVariant = "primary",
  ): string {
    const file = variant === "previous" ? `${id}.prev.jpg` : `${id}.jpg`;
    return path.join(mediaDir(kind), file);
  }

  function absolutePathFromPublicMediaUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
      const pathname = new URL(url, "http://local.invalid").pathname;
      const match = pathname.match(
        /^\/api\/media\/(characters|battlefields)\/([a-zA-Z0-9_.-]+\.jpe?g)$/i,
      );
      const kind = match?.[1];
      const file = match?.[2];
      if (!kind || !file) return null;
      const base = mediaDir(kind);
      const full = path.join(base, file);
      if (!full.startsWith(base)) return null;
      return full;
    } catch {
      return null;
    }
  }

  function archivePortrait(id: string, imageUrl: string | null | undefined): string | null {
    const activePath = absolutePathFromPublicMediaUrl(imageUrl)
      ?? absoluteMediaFile("characters", id, "primary");
    if (!fs.existsSync(activePath)) return null;
    const previousPath = absoluteMediaFile("characters", id, "previous");
    try {
      fs.copyFileSync(activePath, previousPath);
    } catch (error) {
      recordArchiveEvent({
        phase: "archive_failed",
        ok: false,
        characterId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
    const previousUrl = publicMediaPath("characters", id, "previous");
    recordArchiveEvent({ phase: "archived_previous", ok: true, characterId: id, previousUrl });
    return previousUrl;
  }

  function resolveMediaFile(kind: string, file: string): string | null {
    if (kind !== "characters" && kind !== "battlefields") return null;
    if (!/^[a-zA-Z0-9_.-]+\.jpe?g$/i.test(file)) return null;
    const base = mediaDir(kind);
    const full = path.join(base, file);
    if (!full.startsWith(base)) return null;
    if (!fs.existsSync(full)) return null;
    return full;
  }

  return { mediaDir, absoluteMediaFile, absolutePathFromPublicMediaUrl, archivePortrait, resolveMediaFile };
}
