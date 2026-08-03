import { timingSafeEqual } from "node:crypto";

export const ORIGIN_VERIFICATION_HEADER = "x-kshiai-origin";

export function verifyOriginSecret(
  configuredSecret: string,
  suppliedSecret: string | undefined,
): boolean {
  if (!configuredSecret) return true;
  if (!suppliedSecret) return false;
  const expected = Buffer.from(configuredSecret);
  const supplied = Buffer.from(suppliedSecret);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
