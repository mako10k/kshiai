import { config } from "./config.js";
import { query } from "./db.js";

export const ACCOUNT_KINDS = ["general", "developer", "test", "e2e"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export type AccountRealm = "general" | "test";

export type UserAccessProfile = {
  userId: string;
  email: string | null;
  accountKind: AccountKind;
  realm: AccountRealm;
  isAdmin: boolean;
};

export function normalizeAccountKind(value: unknown): AccountKind {
  return ACCOUNT_KINDS.includes(value as AccountKind)
    ? value as AccountKind
    : "general";
}

export function accountRealm(kind: AccountKind): AccountRealm {
  return kind === "general" ? "general" : "test";
}

export function adminIdentityMatches(input: {
  userId: string;
  email: string | null;
  allowedUserIds?: readonly string[];
  allowedEmails?: readonly string[];
}): boolean {
  const allowedUserIds = input.allowedUserIds ?? config.adminUserIds;
  const allowedEmails = input.allowedEmails ?? config.adminEmails;
  if (allowedUserIds.includes(input.userId)) return true;
  const email = input.email?.trim().toLowerCase();
  return Boolean(email && allowedEmails.includes(email));
}

export async function getUserAccessProfile(
  userId: string,
): Promise<UserAccessProfile> {
  const result = await query<{
    email: string | null;
    account_kind: string | null;
  }>(
    `SELECT email, account_kind FROM users WHERE id = $1`,
    [userId],
  );
  const row = result.rows[0];
  const accountKind = normalizeAccountKind(row?.account_kind);
  const email = row?.email ?? null;
  return {
    userId,
    email,
    accountKind,
    realm: accountRealm(accountKind),
    isAdmin: adminIdentityMatches({ userId, email }),
  };
}

export function canAccessAccountKind(
  viewer: Pick<UserAccessProfile, "isAdmin" | "realm">,
  ownerKind: AccountKind,
): boolean {
  if (viewer.isAdmin) return true;
  return viewer.realm === accountRealm(ownerKind);
}

export type InternalObservabilityRole =
  | "admin"
  | "developer"
  | "test"
  | "e2e";

export function internalObservabilityRole(
  viewer: Pick<UserAccessProfile, "accountKind" | "isAdmin">,
): InternalObservabilityRole | null {
  if (viewer.isAdmin) return "admin";
  return viewer.accountKind === "general" ? null : viewer.accountKind;
}

export function canAccessSharedAsset(input: {
  viewer: Pick<UserAccessProfile, "userId" | "isAdmin" | "realm">;
  ownerUserId: string | null;
  ownerKind: AccountKind;
  isSystem?: boolean;
}): boolean {
  if (input.isSystem || input.ownerUserId === null) return true;
  if (input.ownerUserId === input.viewer.userId) return true;
  return accountRealm(input.ownerKind) === "test" &&
    (input.viewer.isAdmin || input.viewer.realm === "test");
}

export async function canUserAccessOwner(
  viewerUserId: string,
  ownerUserId: string,
): Promise<boolean> {
  if (viewerUserId === ownerUserId) return true;
  const [viewer, owner] = await Promise.all([
    getUserAccessProfile(viewerUserId),
    getUserAccessProfile(ownerUserId),
  ]);
  return canAccessAccountKind(viewer, owner.accountKind);
}

export async function setAccountKind(
  userId: string,
  kind: AccountKind,
): Promise<void> {
  const result = await query(
    `UPDATE users SET account_kind = $1 WHERE id = $2`,
    [kind, userId],
  );
  if (result.rowCount !== 1) throw new Error("USER_NOT_FOUND");
}
