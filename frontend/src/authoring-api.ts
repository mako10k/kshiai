import type {
  BattlefieldAuthoringReview,
  CharacterAuthoringReview,
  NarrationStyleAuthoringReview,
  OwnerNotificationPublic,
} from "@kshiai/shared";
import { request } from "./api";

export function listNotifications(limit?: number) {
  return request<{ notifications: OwnerNotificationPublic[]; unreadCount: number }>(
    `/api/notifications${limit != null ? `?limit=${limit}` : ""}`,
  );
}

export function markNotificationRead(id: string) {
  return request<{ ok: boolean }>(`/api/notifications/${id}/read`, {
    method: "POST",
  });
}

export function getCharacterReview(id: string) {
  return request<CharacterAuthoringReview>(`/api/character-drafts/${id}`);
}

export function getBattlefieldReview(id: string) {
  return request<BattlefieldAuthoringReview>(`/api/battlefield-drafts/${id}`);
}

export function getNarrationStyleReview(id: string) {
  return request<NarrationStyleAuthoringReview>(`/api/narration-style-drafts/${id}`);
}
