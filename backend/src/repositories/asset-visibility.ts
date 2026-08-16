import {
  assetVisibilityOf,
  canExposeAssetByVisibility,
  type AssetVisibility,
} from "@kshiai/shared";
import { isViewerFriendedByOwner } from "./friends.js";

export async function filterAssetsByVisibility<T extends {
  ownerUserId: string | null;
  isSystem?: boolean;
  visibility?: AssetVisibility;
}>(viewerUserId: string, items: T[]): Promise<T[]> {
  const friendCache = new Map<string, boolean>();
  const visible: T[] = [];
  for (const item of items) {
    if (await canViewOwnedAsset(viewerUserId, item, friendCache)) {
      visible.push(item);
    }
  }
  return visible;
}

export async function canViewOwnedAsset(
  viewerUserId: string,
  item: {
    ownerUserId: string | null;
    isSystem?: boolean;
    visibility?: AssetVisibility;
  },
  friendCache = new Map<string, boolean>(),
): Promise<boolean> {
  const isOwner = item.ownerUserId === viewerUserId;
  const isSystem = Boolean(item.isSystem) || item.ownerUserId == null;
  let viewerIsFriendOfOwner = false;
  if (
    !isOwner &&
    !isSystem &&
    item.ownerUserId &&
    assetVisibilityOf(item.visibility) === "friends"
  ) {
    let cached = friendCache.get(item.ownerUserId);
    if (cached === undefined) {
      cached = await isViewerFriendedByOwner(item.ownerUserId, viewerUserId);
      friendCache.set(item.ownerUserId, cached);
    }
    viewerIsFriendOfOwner = cached;
  }
  return canExposeAssetByVisibility({
    visibility: assetVisibilityOf(item.visibility),
    isOwner,
    isSystem,
    viewerIsFriendOfOwner,
  });
}
