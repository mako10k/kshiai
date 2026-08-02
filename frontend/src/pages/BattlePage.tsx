import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { formatSpeech, type BattlePublic } from "@kshiai/shared";
import { api } from "../api";

const AUTO_TURN_DELAY_MS = 1600;
const OPENING_DELAY_MS = 1200;

export function BattlePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isResume = searchParams.get("resume") === "1";
  const isViewOnly = searchParams.get("view") === "1";

  const [battle, setBattle] = useState<BattlePublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  /** Resume opens paused so the player can catch up on the log. */
  const [paused, setPaused] = useState(isResume || isViewOnly);
  const logEnd = useRef<HTMLDivElement>(null);
  const advancingRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void api
      .getBattle(id)
      .then((r) => {
        setBattle(r.battle);
        if (r.battle.status === "finished") setPaused(true);
      })
      .catch((e) => setError(String(e)));
  }, [id]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [battle?.log]);

  useEffect(() => {
    if (!id || !battle || battle.status !== "active") return;
    if (paused || error) return;

    const delay = battle.turn === 0 ? OPENING_DELAY_MS : AUTO_TURN_DELAY_MS;
    const timer = setTimeout(() => {
      if (cancelledRef.current || advancingRef.current) return;
      advancingRef.current = true;
      setBusy(true);
      void api
        .advanceBattle(id)
        .then(({ battle: next }) => {
          if (cancelledRef.current) return;
          setBattle(next);
          setError(null);
        })
        .catch((err) => {
          if (cancelledRef.current) return;
          setError(err instanceof Error ? err.message : "failed");
        })
        .finally(() => {
          advancingRef.current = false;
          if (!cancelledRef.current) setBusy(false);
        });
    }, delay);

    return () => clearTimeout(timer);
  }, [id, battle?.status, battle?.turn, paused, error]);

  async function retryAdvance() {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      const { battle: next } = await api.advanceBattle(id);
      setBattle(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveField() {
    if (!id) return;
    setBusy(true);
    setSaveMsg(null);
    try {
      const name = battle?.battlefield?.displayName
        ? `${battle.battlefield.displayName}（試合より）`
        : undefined;
      const res = await api.saveBattlefieldFromBattle(id, name);
      setSaveMsg(`「${res.battlefield.displayName}」を戦場として保存しました。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  if (!battle && !error) return <p className="muted">読み込み中…</p>;
  if (!battle) return <p className="error">{error ?? "見つかりません"}</p>;

  const bf = battle.battlefield;
  const finished = battle.status === "finished";

  return (
    <>
      <div className="page-header">
        <h1>{finished ? "試合の記録" : "バトル"}</h1>
        <Link to="/history" className="btn ghost page-header-back">
          記録一覧
        </Link>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <strong>{battle.sideA.displayName}</strong>
            <span className="muted"> vs </span>
            <strong>{battle.sideB.displayName}</strong>
          </div>
          <span className="muted">
            {finished
              ? `${battle.turn} ターン`
              : `ターン ${battle.turn} / ${battle.turnLimit}`}
          </span>
        </div>
        {battle.policySummary ? (
          <p className="muted" style={{ marginBottom: "0.35rem" }}>
            方針: <strong>{battle.policySummary}</strong>
          </p>
        ) : null}
        <p className="muted" style={{ margin: 0 }}>
          {battle.scene}
          {battle.situationNotes ? ` — ${battle.situationNotes}` : ""}
        </p>
        {bf && (
          <div style={{ marginTop: "0.75rem" }}>
            <strong>{bf.displayName}</strong>
            {bf.categoryLabel ? (
              <span className="tag" style={{ marginLeft: 8 }}>
                {bf.categoryLabel}
              </span>
            ) : null}
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              {[bf.terrain, ...bf.obstacles, ...bf.conditions]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="row" style={{ marginTop: "0.5rem" }}>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => void saveField()}
              >
                この戦場を保存
              </button>
            </div>
            {saveMsg && <p className="ok">{saveMsg}</p>}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>物語</h2>
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

      {!finished ? (
        <div className="panel">
          <h2>進行</h2>
          {isResume && paused && (
            <p className="muted">続きから開きました。準備ができたら再開してください。</p>
          )}
          <div className="row">
            {busy && !paused && <span className="muted">進めています…</span>}
            {!busy && !paused && !error && <span className="ok">自動進行中</span>}
            {paused && <span className="muted">一時停止中</span>}
            <button
              className="btn primary"
              type="button"
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? "再開する" : "一時停止"}
            </button>
            {error && (
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => void retryAdvance()}
              >
                再試行
              </button>
            )}
            <Link className="btn ghost" to="/history">
              記録一覧へ
            </Link>
          </div>
        </div>
      ) : (
        <div className="panel">
          <h2>結果</h2>
          <p className="ok">
            {battle.winnerSide === "draw"
              ? "引き分け"
              : battle.winnerSide === "a"
                ? `${battle.sideA.displayName} の勝利`
                : `${battle.sideB.displayName} の勝利`}
          </p>
          {battle.resultSummary && <p>{battle.resultSummary}</p>}
          <div className="row">
            <Link className="btn primary" to="/match">
              別の試合へ
            </Link>
            <Link className="btn" to="/history">
              記録一覧
            </Link>
            {bf && (
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => void saveField()}
              >
                戦場を保存
              </button>
            )}
          </div>
          {saveMsg && <p className="ok">{saveMsg}</p>}
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </>
  );
}
