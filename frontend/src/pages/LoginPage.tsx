import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";

type Mode = "login" | "register" | "forgot";

export function LoginPage() {
  const {
    user,
    login,
    register,
    loginWithGoogle,
    requestPasswordReset,
    confirmationSent,
    supabaseConfigured,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "認証に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (mode === "login") await login(email, password);
      else if (mode === "register") await register(email, password);
      else await requestPasswordReset(email);
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 440, margin: "2rem auto" }}>
      <h1>AI闘技場 に入る</h1>
      <p className="muted">AIが紡ぐ物語バトルへようこそ。</p>

      {supabaseConfigured && (
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={() => void run(loginWithGoogle)}
          style={{ width: "100%", marginBottom: "1rem" }}
        >
          Googleでログイン
        </button>
      )}

      <form className="grid" onSubmit={(event) => void onSubmit(event)}>
        <label>
          {supabaseConfigured ? "メールアドレス" : "ユーザー名"}
          <input
            type={supabaseConfigured ? "email" : "text"}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        {mode !== "forgot" && (
          <label>
            パスワード
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
            />
          </label>
        )}
        {confirmationSent && (
          <p className="muted">
            確認メールを送信しました。メール内のリンクを開いて続行してください。
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>
          {mode === "login" ? "ログイン" : mode === "register" ? "登録" : "再設定メールを送る"}
        </button>
        <div className="row">
          <button
            type="button"
            className="btn ghost"
            onClick={() => setMode(mode === "register" ? "login" : "register")}
          >
            {mode === "register" ? "ログインへ" : "新規登録へ"}
          </button>
          {supabaseConfigured && mode !== "forgot" && (
            <button type="button" className="btn ghost" onClick={() => setMode("forgot")}>
              パスワードを忘れた
            </button>
          )}
          {mode === "forgot" && (
            <button type="button" className="btn ghost" onClick={() => setMode("login")}>
              ログインへ戻る
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
