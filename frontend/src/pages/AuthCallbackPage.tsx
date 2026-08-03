import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { requireSupabase } from "../supabase";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const parameters = new URLSearchParams(window.location.search);
        const code = parameters.get("code");
        if (!code) throw new Error("認証コードがありません");
        const { error: exchangeError } = await requireSupabase().auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        await refresh();
        const requested = parameters.get("next") ?? "/";
        const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
        if (active) navigate(next, { replace: true });
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "認証に失敗しました");
      }
    })();
    return () => {
      active = false;
    };
  }, [navigate, refresh]);

  return (
    <div className="panel" style={{ maxWidth: 440, margin: "2rem auto" }}>
      <h1>認証しています</h1>
      {error ? <p className="error">{error}</p> : <p className="muted">少しお待ちください…</p>}
    </div>
  );
}
