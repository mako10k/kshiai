import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { FriendPublic } from "@kshiai/shared";
import { api } from "../api";

export function FriendsPage() {
  const [friends, setFriends] = useState<FriendPublic[]>([]);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const res = await api.listFriends();
    setFriends(res.friends);
  }

  useEffect(() => {
    void reload().catch((e) => setError(String(e)));
  }, []);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name) {
      setError("ユーザー名を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.addFriend({ username: name });
      setUsername("");
      setMessage(`${name} をフレンドに追加しました`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(friend: FriendPublic) {
    setBusy(true);
    setError(null);
    try {
      await api.removeFriend(friend.id);
      setMessage(`${friend.username} を解除しました`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>フレンド</h1>
        <Link to="/">← メニュー</Link>
      </div>

      <div className="panel">
        <p className="muted">
          フレンドに追加した相手のキャラは、公開範囲が「フレンド」のとき対戦相手として選べます。
        </p>
        <form className="row" onSubmit={(e) => void onAdd(e)}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ユーザー名"
            autoComplete="username"
            style={{ flex: 1 }}
          />
          <button className="btn primary" type="submit" disabled={busy}>
            追加
          </button>
        </form>
        {message && <p className="ok">{message}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      <div className="panel">
        <h2>一覧 ({friends.length})</h2>
        {friends.length === 0 ? (
          <p className="muted">まだフレンドがいません。</p>
        ) : (
          <ul className="friend-list">
            {friends.map((friend) => (
              <li key={friend.id} className="friend-list-item">
                <div>
                  <Link to={`/users/${friend.id}`}>
                    <strong>{friend.displayName}</strong>
                  </Link>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    @{friend.username} · 追加:{" "}
                    {new Date(friend.createdAt).toLocaleString("ja-JP")}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn ghost danger"
                  disabled={busy}
                  onClick={() => void onRemove(friend)}
                >
                  解除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
