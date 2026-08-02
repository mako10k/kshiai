import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatSpeech, type BattlePublic } from "@kshiai/shared";
import { api } from "../api";

export function BattlePage() {
  const { id } = useParams();
  const [battle, setBattle] = useState<BattlePublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    void api
      .getBattle(id)
      .then((r) => setBattle(r.battle))
      .catch((e) => setError(String(e)));
  }, [id]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [battle?.log]);

  async function act(kind: "skill" | "defend" | "wait", skillId?: string) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const { battle } = await api.battleAction(id, { kind, skillId });
      setBattle(battle);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  if (!battle && !error) return <p className="muted">読み込み中…</p>;
  if (!battle) return <p className="error">{error ?? "not found"}</p>;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>バトル</h1>
        <Link to="/match">相手選択へ</Link>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <strong>{battle.sideA.displayName}</strong>
            <span className="muted"> vs </span>
            <strong>{battle.sideB.displayName}</strong>
          </div>
          <span className="muted">
            ターン {battle.turn} / {battle.turnLimit}
          </span>
        </div>
        <p className="muted">
          シーン: {battle.scene} — {battle.situationNotes}
        </p>
      </div>

      <div className="panel">
        <h2>ナレーション</h2>
        <div className="log">
          {battle.log.map((block, i) => (
            <div className="log-block" key={`${block.turn}-${i}`}>
              {block.turn > 0 && (
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  — ターン {block.turn} —
                </div>
              )}
              {block.narrator.map((line, j) => (
                <p key={j} style={{ margin: "0.25rem 0" }}>
                  {line}
                </p>
              ))}
              {block.speeches.map((s, j) => (
                <p key={`s-${j}`} className="speaker" style={{ margin: "0.25rem 0" }}>
                  {formatSpeech(s)}
                </p>
              ))}
            </div>
          ))}
          <div ref={logEnd} />
        </div>
      </div>

      {battle.status === "active" ? (
        <div className="panel">
          <h2>行動</h2>
          <p className="muted">パラメータは表示しません。技名と結果の物語だけが手がかりです。</p>
          <div className="row">
            {battle.availableActions.map((a) => (
              <button
                key={`${a.kind}-${a.skillId ?? a.label}`}
                className="btn primary"
                type="button"
                disabled={busy}
                onClick={() => void act(a.kind, a.skillId)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="panel">
          <h2>決着</h2>
          <p className="ok">
            {battle.winnerSide === "draw"
              ? "引き分け"
              : battle.winnerSide === "a"
                ? `${battle.sideA.displayName} の勝利`
                : `${battle.sideB.displayName} の勝利`}
            {battle.finishReason ? `（${battle.finishReason}）` : ""}
          </p>
          {battle.resultSummary && <p>{battle.resultSummary}</p>}
          <Link className="btn" to="/match">
            別の試合へ
          </Link>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </>
  );
}
