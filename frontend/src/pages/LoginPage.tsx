import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";

export function LoginPage() {
  const { user, login, register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(username, password);
      else await register(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ maxWidth: 420, margin: "2rem auto" }}>
      <h1>AI闘技場 に入る</h1>
      <p className="muted">AIが紡ぐ物語バトルへようこそ。</p>
      <form className="grid" onSubmit={(e) => void onSubmit(e)}>
        <label>
          ユーザー名
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={3}
          />
        </label>
        <label>
          パスワード
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={6}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy}>
            {mode === "login" ? "ログイン" : "登録"}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "新規登録へ" : "ログインへ"}
          </button>
        </div>
      </form>
    </div>
  );
}
