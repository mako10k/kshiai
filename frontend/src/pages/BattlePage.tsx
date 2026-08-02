import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { formatSpeech, type BattlePublic } from "@kshiai/shared";
import { api } from "../api";
import { mediaSrc } from "../media";

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

    const delay = battle.prologuePending
      ? OPENING_DELAY_MS
      : AUTO_TURN_DELAY_MS;
    const timer = setTimeout(() => {
      if (cancelledRef.current || advancingRef.current) return;
      advancingRef.current = true;
      setBusy(true);
      void advanceWithRetry(id, 2)
        .then((next) => {
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
  }, [
    id,
    battle?.status,
    battle?.turn,
    battle?.prologuePending,
    battle?.aftermathPending,
    battle?.log?.length,
    paused,
    error,
  ]);

  async function advanceWithRetry(
    battleId: string,
    retries: number,
  ): Promise<BattlePublic> {
    let lastErr: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        const { battle: next } = await api.advanceBattle(battleId);
        return next;
      } catch (err) {
        lastErr = err;
        // Brief pause then retry (LLM / tunnel blips)
        if (i < retries) {
          await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("advance_failed");
  }

  async function retryAdvance() {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      const next = await advanceWithRetry(id, 2);
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
  const winner =
    battle.winnerSide === "a"
      ? battle.sideA
      : battle.winnerSide === "b"
        ? battle.sideB
        : null;
  const imgA = mediaSrc(battle.sideA.imageUrl, battle.sideA.characterId);
  const imgB = mediaSrc(battle.sideB.imageUrl, battle.sideB.characterId);
  const imgWinner = winner
    ? mediaSrc(winner.imageUrl, winner.characterId)
    : undefined;
  const fieldImg = mediaSrc(
    bf?.imageUrl,
    bf?.displayName ?? battle.scene,
  );

  return (
    <>
      <div className="page-header">
        <h1>{finished ? "試合の記録" : "バトル"}</h1>
        <Link to="/history" className="btn ghost page-header-back">
          記録一覧
        </Link>
      </div>

      <div className="panel">
        <div
          className={`battle-faces${fieldImg ? " has-field" : ""}`}
          aria-label="対戦カード"
          style={
            fieldImg
              ? ({ ["--field-bg" as string]: `url(${fieldImg})` } as React.CSSProperties)
              : undefined
          }
        >
          {fieldImg ? (
            <div className="battle-faces-field" aria-hidden />
          ) : null}
          <div className="battle-faces-inner">
            <Link
              className="battle-face battle-face-link"
              to={`/characters/${battle.sideA.characterId}`}
            >
              {imgA ? (
                <img src={imgA} alt={battle.sideA.displayName} />
              ) : (
                <div className="battle-face-ph">?</div>
              )}
              <strong>{battle.sideA.displayName}</strong>
              <span className="muted">自分</span>
            </Link>
            <div className="battle-faces-vs" aria-hidden>
              VS
            </div>
            <Link
              className="battle-face battle-face-link"
              to={`/characters/${battle.sideB.characterId}`}
            >
              {imgB ? (
                <img src={imgB} alt={battle.sideB.displayName} />
              ) : (
                <div className="battle-face-ph">?</div>
              )}
              <strong>{battle.sideB.displayName}</strong>
              <span className="muted">相手</span>
            </Link>
          </div>
        </div>

        <div className="row" style={{ justifyContent: "space-between", marginTop: "0.75rem" }}>
          <span className="muted">
            {finished
              ? `${battle.turn} ターン`
              : battle.prologuePending
                ? `プロローグ…`
                : battle.aftermathPending
                  ? `決着の余波…`
                  : `ターン ${battle.turn} / ${battle.turnLimit}`}
          </span>
        </div>
        {battle.prologuePending && !finished ? (
          <p className="ok" style={{ margin: "0.35rem 0 0" }}>
            開幕 — 口上と因縁を語ります…
          </p>
        ) : null}
        {battle.aftermathPending && !finished ? (
          <p className="ok" style={{ margin: "0.35rem 0 0" }}>
            戦闘不能 — 倒れた者のその後を見届けます…
          </p>
        ) : null}
        {battle.priorMatchSummary ? (
          <p className="muted prior-match-hint">
            因縁の種: {battle.priorMatchSummary}
          </p>
        ) : null}
        {battle.policySummary ? (
          <p className="muted" style={{ marginBottom: "0.35rem" }}>
            方針: <strong>{battle.policySummary}</strong>
          </p>
        ) : null}
        {battle.narrationStyleName ? (
          <p className="muted" style={{ marginBottom: "0.35rem" }}>
            語り: <strong>{battle.narrationStyleName}</strong>
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
              {block.turn > 0 ? (
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  — ターン {block.turn} —
                </div>
              ) : block.narrator[0]?.includes("開幕") ||
                block.narrator[0]?.includes("プロローグ") ? (
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  — プロローグ —
                </div>
              ) : null}
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
          {battle.winnerSide === "draw" ? (
            <div className="battle-winner-row battle-winner-draw">
              <Link
                className="battle-face battle-face-sm battle-face-link"
                to={`/characters/${battle.sideA.characterId}`}
              >
                {imgA ? (
                  <img src={imgA} alt={battle.sideA.displayName} />
                ) : (
                  <div className="battle-face-ph">?</div>
                )}
              </Link>
              <Link
                className="battle-face battle-face-sm battle-face-link"
                to={`/characters/${battle.sideB.characterId}`}
              >
                {imgB ? (
                  <img src={imgB} alt={battle.sideB.displayName} />
                ) : (
                  <div className="battle-face-ph">?</div>
                )}
              </Link>
              <p className="ok" style={{ margin: 0 }}>
                引き分け
              </p>
            </div>
          ) : winner ? (
            <div className="battle-winner-row">
              <Link
                className="battle-face battle-face-winner battle-face-link"
                to={`/characters/${winner.characterId}`}
              >
                {imgWinner ? (
                  <img src={imgWinner} alt={winner.displayName} />
                ) : (
                  <div className="battle-face-ph">?</div>
                )}
                <strong>{winner.displayName}</strong>
                <span className="tag">勝利</span>
              </Link>
              <p className="ok" style={{ margin: "0.5rem 0 0" }}>
                {winner.displayName} の勝利
              </p>
            </div>
          ) : (
            <p className="ok">試合終了</p>
          )}
          {battle.resultSummary && <p>{battle.resultSummary}</p>}
          {battle.ratingSettlement?.applied ? (
            <div className="rating-settle muted">
              {battle.ratingSettlement.overall ? (
                <>
                  <p style={{ margin: "0 0 0.35rem" }}>
                    <strong>全体成績</strong>
                    <span className="muted">
                      （自分用・同一アカウント対戦を含む）
                    </span>
                  </p>
                  <p style={{ margin: 0 }}>
                    {battle.sideA.displayName}:{" "}
                    <strong>
                      {Math.round(battle.ratingSettlement.overall.sideA.before)}{" "}
                      →{" "}
                      {Math.round(battle.ratingSettlement.overall.sideA.after)}
                    </strong>{" "}
                    (
                    {battle.ratingSettlement.overall.sideA.delta >= 0
                      ? "+"
                      : ""}
                    {battle.ratingSettlement.overall.sideA.delta})
                    {battle.ratingSettlement.overall.sideA.provisionalAfter ? (
                      <span className="tag">暫定</span>
                    ) : null}
                  </p>
                  <p style={{ margin: "0.25rem 0 0.55rem" }}>
                    {battle.sideB.displayName}:{" "}
                    <strong>
                      {Math.round(battle.ratingSettlement.overall.sideB.before)}{" "}
                      →{" "}
                      {Math.round(battle.ratingSettlement.overall.sideB.after)}
                    </strong>{" "}
                    (
                    {battle.ratingSettlement.overall.sideB.delta >= 0
                      ? "+"
                      : ""}
                    {battle.ratingSettlement.overall.sideB.delta})
                    {battle.ratingSettlement.overall.sideB.provisionalAfter ? (
                      <span className="tag">暫定</span>
                    ) : null}
                  </p>
                </>
              ) : null}
              {battle.ratingSettlement.public ? (
                <>
                  <p style={{ margin: "0 0 0.35rem" }}>
                    <strong>公開成績</strong>
                    <span className="muted">（他アカウント対戦・誰でも見える）</span>
                  </p>
                  <p style={{ margin: 0 }}>
                    {battle.sideA.displayName}:{" "}
                    <strong>
                      {Math.round(battle.ratingSettlement.public.sideA.before)}{" "}
                      →{" "}
                      {Math.round(battle.ratingSettlement.public.sideA.after)}
                    </strong>{" "}
                    (
                    {battle.ratingSettlement.public.sideA.delta >= 0
                      ? "+"
                      : ""}
                    {battle.ratingSettlement.public.sideA.delta})
                  </p>
                  <p style={{ margin: "0.25rem 0 0" }}>
                    {battle.sideB.displayName}:{" "}
                    <strong>
                      {Math.round(battle.ratingSettlement.public.sideB.before)}{" "}
                      →{" "}
                      {Math.round(battle.ratingSettlement.public.sideB.after)}
                    </strong>{" "}
                    (
                    {battle.ratingSettlement.public.sideB.delta >= 0
                      ? "+"
                      : ""}
                    {battle.ratingSettlement.public.sideB.delta})
                  </p>
                </>
              ) : battle.ratingSettlement.sameOwner ? (
                <p className="help-text" style={{ margin: "0.35rem 0 0" }}>
                  同一アカウント同士の対戦のため、公開成績・公開レーティングは動きません。
                </p>
              ) : null}
              <p className="help-text" style={{ margin: "0.45rem 0 0" }}>
                「暫定」は試合数が少ないあいだの表示です（5試合で確定寄り）。
              </p>
            </div>
          ) : null}
          <div className="row">
            <Link
              className="btn primary"
              to={`/match?my=${encodeURIComponent(battle.sideA.characterId)}&opp=${encodeURIComponent(battle.sideB.characterId)}`}
            >
              再戦セットアップ
            </Link>
            <Link className="btn" to="/match">
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
