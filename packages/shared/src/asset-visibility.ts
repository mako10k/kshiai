import { z } from "zod";

/** Who may pick this owner asset outside the owner account. */
export const AssetVisibilitySchema = z.enum([
  "public",
  "friends",
  "private",
]);
export type AssetVisibility = z.infer<typeof AssetVisibilitySchema>;

export function assetVisibilityOf(value: unknown): AssetVisibility {
  const parsed = AssetVisibilitySchema.safeParse(value);
  return parsed.success ? parsed.data : "public";
}

export function canExposeAssetByVisibility(input: {
  visibility?: AssetVisibility | null;
  isOwner: boolean;
  isSystem?: boolean;
  viewerIsFriendOfOwner: boolean;
}): boolean {
  if (input.isOwner || input.isSystem) return true;
  const visibility = input.visibility ?? "public";
  if (visibility === "public") return true;
  if (visibility === "private") return false;
  return input.viewerIsFriendOfOwner;
}

export function assetVisibilityLabel(value: AssetVisibility): string {
  if (value === "friends") return "フレンド";
  if (value === "private") return "非公開";
  return "公開";
}
