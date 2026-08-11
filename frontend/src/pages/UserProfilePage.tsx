import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type { UserProfilePublic } from "@kshiai/shared";
import { api } from "../api";
import { useAuth } from "../auth";

export function UserProfilePage() {
  const { id } = useParams();
  const { user: me, refresh } = useAuth();
  const [profile, setProfile] = useState<UserProfilePublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");

  const reload = useCallback(async () => {
    if (!id) return;
    const res = await api.getUser(id);
    setProfile(res.user);
    setDisplayNameDraft(res.user.displayName);
  }, [id]);

  useEffect(() => {
    void reload().catch((e) => setError(String(e)));
  }, [reload]);

  async function run(action: () => Promise<void>, okMessage: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await reload();
      setMessage(okMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveDisplayName(e: FormEvent) {
    e.preventDefault();
    if (!profile?.relation?.isSelf) return;
    await run(async () => {
      await api.updateDisplayName(displayNameDraft.trim());
      await refresh();
    }, "公開名を更新しました");
  }

  if (!profile) {
    return (
      <div className="panel">
        {error ? <p className="error">{error}</p> : <p className="muted">読み込み中…</p>}
      </div>
    );
  }

  const relation = profile.relation;
  const isSelf = relation?.isSelf ?? me?.id === profile.id;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{profile.displayName}</h1>
        <Link to="/">← メニュー</Link>
      </div>

      <div className="panel">
        <p>
          <strong>公開名:</strong> {profile.displayName}
        </p>
        <p className="muted">
          ログイン名: @{profile.username}
          {profile.characterCount != null
            ? ` · キャラ ${profile.characterCount} 体`
            : ""}
        </p>

        {isSelf ? (
          <form className="row" onSubmit={(e) => void onSaveDisplayName(e)}>
            <input
              value={displayNameDraft}
              onChange={(e) => setDisplayNameDraft(e.target.value)}
              maxLength={32}
              placeholder="公開名"
              style={{ flex: 1 }}
            />
            <button className="btn primary" type="submit" disabled={busy}>
              公開名を保存
            </button>
          </form>
        ) : (
          <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            {relation?.isFriend ? (
              <button
                type="button"
                className="btn ghost danger"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => api.removeFriend(profile.id).then(() => undefined),
                    "フレンドを解除しました",
                  )
                }
              >
                フレンド解除
              </button>
            ) : relation?.outgoingFriendRequest ? (
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      api.cancelFriendRequest(profile.id).then(() => undefined),
                    "フレンド申請を取り消しました",
                  )
                }
              >
                申請を取り消す
              </button>
            ) : relation?.incomingFriendRequest ? (
              <>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        api.acceptFriendRequest(profile.id).then(() => undefined),
                      "フレンド申請を承認しました",
                    )
                  }
                >
                  申請を承認
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        api.rejectFriendRequest(profile.id).then(() => undefined),
                      "申請を却下しました",
                    )
                  }
                >
                  却下
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      api
                        .sendFriendRequest({ userId: profile.id })
                        .then(() => undefined),
                    "フレンド申請を送りました",
                  )
                }
              >
                フレンド申請
              </button>
            )}

            {relation?.isFavorite ? (
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => api.removeFavorite(profile.id).then(() => undefined),
                    "お気に入りを解除しました",
                  )
                }
              >
                お気に入り解除
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => api.addFavorite(profile.id).then(() => undefined),
                    "お気に入りに追加しました",
                  )
                }
              >
                お気に入り
              </button>
            )}

            <button
              type="button"
              className="btn"
              disabled={busy || relation?.isFriend}
              onClick={() =>
                void run(
                  () =>
                    api.addFriend({ userId: profile.id }).then(() => undefined),
                  "フレンドに追加しました",
                )
              }
            >
              すぐフレンド追加
            </button>
          </div>
        )}

        {message && <p className="ok">{message}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
