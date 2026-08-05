import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  formatRatingForDisplay,
  formatSpeech,
  narrativeEntries,
  type BattleAdvancePhase,
  type BattlePublic,
  type SpeechLine,
} from "@kshiai/shared";
import { api } from "../api";
import {
  extendManualScrollHold,
  hasReachedLatestPosition,
} from "../battle-scroll";
import { mediaSrc } from "../media";

/** Gap before requesting the next turn (does not wait for speech animation). */
const AUTO_TURN_DELAY_MS = 900;
const OPENING_DELAY_MS = 1000;
/** Stagger each public speech line after ground text is committed. */
const SPEECH_REVEAL_MS = 780;

type StreamDraft = {
  phase: BattleAdvancePhase | null;
  turn: number;
  lines: string[];
  draft: string | null;
};

/** Progressive reveal of the latest log block's speeches (does not block advance). */
type SpeechReveal = {
  key: string;
  visible: number;
  total: number;
};

const PHASE_LABEL: Record<BattleAdvancePhase, string> = {
  resolving: "局面を解決しています…",
  agents: "キャラの反応を紡いでいます…",
  narrating: "語りを生成しています…",
  finalizing: "記録しています…",
};

export function BattlePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isResume = searchParams.get("resume") === "1";
  const isViewOnly = searchParams.get("view") === "1";

  const [battle, setBattle] = useState<BattlePublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [streamDraft, setStreamDraft] = useState<StreamDraft | null>(null);
  const [speechReveal, setSpeechReveal] = useState<SpeechReveal | null>(null);
  const [autoScrollHeld, setAutoScrollHeld] = useState(false);
  /** Resume opens paused so the player can catch up on the log. */
  const [paused, setPaused] = useState(isResume || isViewOnly);
  const logEnd = useRef<HTMLDivElement>(null);
  const autoScrollEligibleRef = useRef(false);
  const autoScrollHeldRef = useRef(false);
  const autoScrollHoldUntilRef = useRef(0);
  const autoScrollHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const programmaticScrollRef = useRef(false);
  const programmaticScrollTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const manualScrollFrameRef = useRef<number | null>(null);
  const advancingRef = useRef(false);
  const cancelledRef = useRef(false);
  /** First battle payload shows all speeches; later log growth animates. */
  const skipSpeechAnimRef = useRef(true);
  const speechTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  autoScrollEligibleRef.current = Boolean(
    battle?.status === "active" && !isViewOnly,
  );

  function clearSpeechTimers() {
    for (const t of speechTimersRef.current) clearTimeout(t);
    speechTimersRef.current = [];
  }

  function setAutoScrollHold(held: boolean) {
    if (autoScrollHeldRef.current === held) return;
    autoScrollHeldRef.current = held;
    setAutoScrollHeld(held);
  }

  function clearAutoScrollHoldTimer() {
    if (autoScrollHoldTimerRef.current) {
      clearTimeout(autoScrollHoldTimerRef.current);
      autoScrollHoldTimerRef.current = null;
    }
  }

  function clearProgrammaticScrollTimer() {
    if (programmaticScrollTimerRef.current) {
      clearTimeout(programmaticScrollTimerRef.current);
      programmaticScrollTimerRef.current = null;
    }
  }

  function latestPositionReached(): boolean {
    const marker = logEnd.current;
    if (!marker || typeof window === "undefined") return true;
    return hasReachedLatestPosition({
      latestTop: marker.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
    });
  }

  function releaseAutoScrollHold() {
    autoScrollHoldUntilRef.current = 0;
    clearAutoScrollHoldTimer();
    if (autoScrollHeldRef.current) setAutoScrollHold(false);
  }

  function finishProgrammaticScrollSoon(delay = 1200) {
    clearProgrammaticScrollTimer();
    programmaticScrollTimerRef.current = setTimeout(() => {
      programmaticScrollRef.current = false;
      programmaticScrollTimerRef.current = null;
    }, delay);
  }

  function scrollToLatest() {
    releaseAutoScrollHold();
    programmaticScrollRef.current = true;
    logEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    finishProgrammaticScrollSoon();
  }

  function scheduleAutoScrollResume() {
    clearAutoScrollHoldTimer();
    const remaining = Math.max(
      0,
      autoScrollHoldUntilRef.current - Date.now(),
    );
    autoScrollHoldTimerRef.current = setTimeout(() => {
      autoScrollHoldTimerRef.current = null;
      if (Date.now() < autoScrollHoldUntilRef.current) {
        scheduleAutoScrollResume();
        return;
      }
      scrollToLatest();
    }, remaining);
  }

  function holdAutoScrollForManualPosition() {
    if (!autoScrollEligibleRef.current) {
      releaseAutoScrollHold();
      return;
    }
    if (latestPositionReached()) {
      releaseAutoScrollHold();
      return;
    }
    programmaticScrollRef.current = false;
    clearProgrammaticScrollTimer();
    autoScrollHoldUntilRef.current = extendManualScrollHold(Date.now());
    setAutoScrollHold(true);
    scheduleAutoScrollResume();
  }

  function startSpeechReveal(key: string, total: number) {
    clearSpeechTimers();
    if (total <= 0) {
      setSpeechReveal(null);
      return;
    }
    setSpeechReveal({ key, visible: 0, total });
    for (let n = 1; n <= total; n += 1) {
      const timer = setTimeout(() => {
        if (cancelledRef.current) return;
        setSpeechReveal({ key, visible: n, total });
      }, n * SPEECH_REVEAL_MS);
      speechTimersRef.current.push(timer);
    }
  }

  useEffect(() => {
    cancelledRef.current = false;
    skipSpeechAnimRef.current = true;
    releaseAutoScrollHold();
    programmaticScrollRef.current = false;
    return () => {
      cancelledRef.current = true;
      clearSpeechTimers();
      clearAutoScrollHoldTimer();
      clearProgrammaticScrollTimer();
      if (manualScrollFrameRef.current != null) {
        cancelAnimationFrame(manualScrollFrameRef.current);
        manualScrollFrameRef.current = null;
      }
    };
  }, [id]);

  useEffect(() => {
    const onManualScrollIntent = () => {
      programmaticScrollRef.current = false;
      clearProgrammaticScrollTimer();
      if (manualScrollFrameRef.current != null) {
        cancelAnimationFrame(manualScrollFrameRef.current);
      }
      manualScrollFrameRef.current = requestAnimationFrame(() => {
        manualScrollFrameRef.current = null;
        holdAutoScrollForManualPosition();
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      ) {
        onManualScrollIntent();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.clientX >= document.documentElement.clientWidth - 24) {
        programmaticScrollRef.current = false;
        clearProgrammaticScrollTimer();
      }
    };
    const onScroll = () => {
      if (latestPositionReached()) {
        releaseAutoScrollHold();
        return;
      }
      if (programmaticScrollRef.current) {
        finishProgrammaticScrollSoon(250);
        return;
      }
      holdAutoScrollForManualPosition();
    };

    window.addEventListener("wheel", onManualScrollIntent, { passive: true });
    window.addEventListener("touchmove", onManualScrollIntent, {
      passive: true,
    });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", onManualScrollIntent);
      window.removeEventListener("touchmove", onManualScrollIntent);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll);
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

  // Stagger speeches on the newest log block; next turn may already be resolving.
  useEffect(() => {
    if (!battle?.log.length) return;
    const last = battle.log[battle.log.length - 1]!;
    const key = `${battle.log.length}:${last.turn}:${last.speeches.length}`;
    if (skipSpeechAnimRef.current) {
      skipSpeechAnimRef.current = false;
      setSpeechReveal(null);
      return;
    }
    startSpeechReveal(key, last.speeches.length);
    return () => clearSpeechTimers();
  }, [
    battle?.log.length,
    battle?.turn,
    battle?.prologuePending,
    battle?.aftermathPending,
  ]);

  useEffect(() => {
    if (battle?.status !== "active" || isViewOnly) releaseAutoScrollHold();
  }, [battle?.status, isViewOnly]);

  useEffect(() => {
    if (!autoScrollHeldRef.current) scrollToLatest();
  }, [
    battle?.log,
    streamDraft?.lines.length,
    streamDraft?.draft,
    speechReveal?.visible,
  ]);

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
      setStreamDraft({
        phase: "resolving",
        turn: battle.prologuePending ? 0 : battle.turn + 1,
        lines: [],
        draft: null,
      });
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
          if (!cancelledRef.current) {
            setBusy(false);
            setStreamDraft(null);
          }
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
        return await api.advanceBattleStream(battleId, {
          onEvent: (event) => {
            if (cancelledRef.current) return;
            if (event.type === "phase") {
              setStreamDraft((prev) =>
                prev
                  ? { ...prev, phase: event.phase }
                  : {
                      phase: event.phase,
                      turn: 0,
                      lines: [],
                      draft: null,
                    },
              );
            } else if (event.type === "narrator") {
              setStreamDraft((prev) => ({
                phase: prev?.phase ?? "narrating",
                turn: event.turn ?? prev?.turn ?? 0,
                lines: event.lines,
                draft: event.draft ?? null,
              }));
            }
            // Speeches: ignore bulk SSE dump — reveal slowly after log commit.
          },
        });
      } catch (err) {
        lastErr = err;
        // Brief pause then retry (LLM / tunnel blips)
        if (i < retries) {
          setStreamDraft((prev) =>
            prev
              ? { ...prev, lines: [], draft: null, phase: "resolving" }
              : null,
          );
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
    setStreamDraft({
      phase: "resolving",
      turn: battle?.prologuePending ? 0 : (battle?.turn ?? 0) + 1,
      lines: [],
      draft: null,
    });
    try {
      const next = await advanceWithRetry(id, 2);
      setBattle(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
      setStreamDraft(null);
    }
  }

  function speechesVisibleForBlock(
    blockIndex: number,
    speeches: SpeechLine[],
  ): SpeechLine[] {
    if (!battle) return speeches;
    const lastIndex = battle.log.length - 1;
    if (blockIndex !== lastIndex || !speechReveal) return speeches;
    const last = battle.log[lastIndex]!;
    const key = `${battle.log.length}:${last.turn}:${last.speeches.length}`;
    if (speechReveal.key !== key) return speeches;
    return speeches.slice(0, speechReveal.visible);
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
        {battle.semanticState ? (
          <details style={{ marginTop: "0.75rem" }}>
            <summary>
              現在の戦場状態（更新 {battle.semanticState.snapshot.revision}）
            </summary>
            <p className="muted" style={{ margin: "0.5rem 0" }}>
              {battle.semanticState.snapshot.scene.summary}
            </p>
            <div className="row" style={{ alignItems: "flex-start" }}>
              {Object.entries(battle.semanticState.snapshot.entities)
                .filter(([id, entity]) =>
                  id !== "character.a" && id !== "character.b" && entity.active,
                )
                .map(([id, entity]) => (
                  <span className="tag" key={id} title={id}>
                    {entity.label}
                    {entity.location.type === "held"
                      ? `（${entity.location.side === "a" ? battle.sideA.displayName : battle.sideB.displayName}が所持）`
                      : entity.location.type === "scene"
                        ? `（${entity.location.area}）`
                        : entity.location.type === "attached"
                          ? "（付着）"
                          : "（消失）"}
                  </span>
                ))}
            </div>
          </details>
        ) : null}
      </div>

      <div className="panel">
        <h2>物語</h2>
        <div className="log">
          {battle.log.map((block, i) => (
            <div className="log-block" key={`${block.turn}-${i}`}>
              {block.narrator[0]?.includes("判定") ? (
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  — 最終判定 —
                </div>
              ) : block.turn > 0 ? (
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  — ターン {block.turn} —
                </div>
              ) : block.narrator[0]?.includes("開幕") ||
                block.narrator[0]?.includes("プロローグ") ? (
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  — プロローグ —
                </div>
              ) : null}
              {narrativeEntries({
                ...block,
                speeches: speechesVisibleForBlock(i, block.speeches),
              }).map((entry) =>
                entry.kind === "narrator" ? (
                  <p
                    key={`n-${entry.narratorLine}`}
                    style={{ margin: "0.25rem 0" }}
                  >
                    {entry.text}
                  </p>
                ) : (
                  <p
                    key={`s-${entry.speechLine}`}
                    className="speaker speech-enter"
                    style={{ margin: "0.25rem 0" }}
                  >
                    {formatSpeech(entry.speech)}
                  </p>
                )
              )}
            </div>
          ))}
          {streamDraft &&
            (streamDraft.lines.length > 0 ||
              streamDraft.draft ||
              streamDraft.phase) && (
              <div className="log-block log-block-streaming" aria-live="polite">
                {streamDraft.turn > 0 ? (
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    — ターン {streamDraft.turn}（生成中）—
                  </div>
                ) : streamDraft.phase === "narrating" ||
                  streamDraft.lines.length > 0 ? (
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    — プロローグ（生成中）—
                  </div>
                ) : null}
                {streamDraft.phase &&
                streamDraft.lines.length === 0 &&
                !streamDraft.draft ? (
                  <p className="muted" style={{ margin: "0.25rem 0" }}>
                    {PHASE_LABEL[streamDraft.phase]}
                  </p>
                ) : null}
                {streamDraft.lines.map((line, j) => (
                  <p key={`st-${j}`} style={{ margin: "0.25rem 0" }}>
                    {line}
                  </p>
                ))}
                {streamDraft.draft ? (
                  <p className="stream-draft" style={{ margin: "0.25rem 0" }}>
                    {streamDraft.draft}
                    <span className="stream-caret" aria-hidden>
                      ▍
                    </span>
                  </p>
                ) : null}
              </div>
            )}
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
            {busy && !paused && (
              <span className="muted">
                {streamDraft?.phase
                  ? PHASE_LABEL[streamDraft.phase]
                  : "進めています…"}
              </span>
            )}
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
                      {formatRatingForDisplay(
                        battle.ratingSettlement.overall.sideA.before,
                      )}{" "}
                      →{" "}
                      {formatRatingForDisplay(
                        battle.ratingSettlement.overall.sideA.after,
                      )}
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
                      {formatRatingForDisplay(
                        battle.ratingSettlement.overall.sideB.before,
                      )}{" "}
                      →{" "}
                      {formatRatingForDisplay(
                        battle.ratingSettlement.overall.sideB.after,
                      )}
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
                      {formatRatingForDisplay(
                        battle.ratingSettlement.public.sideA.before,
                      )}{" "}
                      →{" "}
                      {formatRatingForDisplay(
                        battle.ratingSettlement.public.sideA.after,
                      )}
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
                      {formatRatingForDisplay(
                        battle.ratingSettlement.public.sideB.before,
                      )}{" "}
                      →{" "}
                      {formatRatingForDisplay(
                        battle.ratingSettlement.public.sideB.after,
                      )}
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
                「暫定」は試合数が少ないあいだの表示ラベルです。K値は一律20です。
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

      {autoScrollHeld ? (
        <button
          className="btn primary battle-scroll-latest"
          type="button"
          onClick={scrollToLatest}
          title="最新位置へ戻って自動スクロールを再開"
        >
          最新へ戻る ↓
        </button>
      ) : null}
    </>
  );
}
