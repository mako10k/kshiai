import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

const TARGETS = [
  { id: "observer" as const, label: "E2E観測者として入り直す" },
  { id: "opponent" as const, label: "E2E対照役として入り直す" },
];

export function E2eSessionReentry({ role }: { role: string | null }) {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"observer" | "opponent" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (role !== "admin" && role !== "developer") return null;

  async function reenter(target: "observer" | "opponent") {
    if (
      !window.confirm(
        "現在のセッションを終了し、選択したE2Eアカウントで入り直します。実行中のObserveジョブがあるときは中止してください。",
      )
    ) {
      return;
    }
    setBusy(target);
    setError(null);
    try {
      const session = await api.createE2eSession(target);
      await logout();
      await login(session.email, session.password);
      navigate("/history", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "入り直しに失敗しました");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel e2e-session-reentry">
      <h2>E2Eとして入り直す</h2>
      <p className="muted">
        本物のE2E身分で戦闘画面を開きます。管理者セッションは終了します。
      </p>
      <div className="row">
        {TARGETS.map((target) => (
          <button
            key={target.id}
            className="btn"
            type="button"
            disabled={busy !== null}
            onClick={() => void reenter(target.id)}
          >
            {busy === target.id ? "切り替え中…" : target.label}
          </button>
        ))}
      </div>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
