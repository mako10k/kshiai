import { z } from "zod";

// R: Resolve asset publication settings and viewer eligibility under ADR0060.

/** Who may pick this owner asset outside the owner account. */
export const AssetVisibilitySchema = z.enum([
  "public",
  "friends",
  "private",
]);
export type AssetVisibility = z.infer<typeof AssetVisibilitySchema>;

export function assetVisibilityOf(value: unknown): AssetVisibility {
  const parsed = AssetVisibilitySchema.safeParse(value);
  return parsed.success ? parsed.data : "private";
}

export function canExposeAssetByVisibility(input: {
  visibility?: AssetVisibility | null;
  isOwner: boolean;
  isSystem?: boolean;
  viewerIsFriendOfOwner: boolean;
}): boolean {
  if (input.isOwner || input.isSystem) return true;
  const visibility = assetVisibilityOf(input.visibility);
  if (visibility === "public") return true;
  if (visibility === "private") return false;
  return input.viewerIsFriendOfOwner;
}

export function assetVisibilityLabel(value: AssetVisibility): string {
  if (value === "friends") return "フレンド";
  if (value === "private") return "非公開";
  return "公開";
}
