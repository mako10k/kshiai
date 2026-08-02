import { cacheBustMediaUrl } from "@kshiai/shared";

/**
 * Resolve an image URL for <img src>, always applying a cache-bust for local media.
 * Pass entity `updatedAt` (or any changing version) so regenerations load on iOS Safari.
 */
export function mediaSrc(
  url: string | null | undefined,
  version?: string | number | null,
): string | undefined {
  const busted = cacheBustMediaUrl(url, version);
  return busted ?? undefined;
}
