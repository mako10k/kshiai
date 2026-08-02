/**
 * Append a cache-busting query param to local media URLs.
 * External URLs (https://, data:) are left unchanged.
 *
 * Prefer a stable version (e.g. updatedAt ISO / file mtime) so the same
 * content reuses cache, while regenerations always get a new URL for iOS Safari.
 */
export function cacheBustMediaUrl(
  url: string | null | undefined,
  version?: string | number | null,
): string | null {
  if (url == null || url === "") return null;

  const isLocal =
    url.startsWith("/api/media/") ||
    url.startsWith("/battlefields/") ||
    url.includes("/api/media/");

  if (!isLocal) return url;

  const v =
    version == null || version === ""
      ? String(Date.now())
      : String(version);

  // Relative URL: parse with a dummy base
  try {
    const u = new URL(url, "http://local.invalid");
    u.searchParams.delete("t");
    u.searchParams.set("v", v);
    return `${u.pathname}${u.search}`;
  } catch {
    const bare = url.split("?")[0] ?? url;
    return `${bare}?v=${encodeURIComponent(v)}`;
  }
}

/** Strip cache-bust query params for storage (keep a clean path in DB). */
export function stripMediaCacheBust(
  url: string | null | undefined,
): string | null {
  if (url == null || url === "") return null;
  if (!url.startsWith("/") && !url.includes("/api/media/")) return url;
  try {
    const u = new URL(url, "http://local.invalid");
    if (!u.pathname.startsWith("/api/media/") && !u.pathname.startsWith("/battlefields/")) {
      return url;
    }
    return u.pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}
