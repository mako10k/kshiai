import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  type BattleAdvancePhase,
  type BattleNarrationEntryPublic,
  type BattlePublic,
  type SpeechLine,
} from "@kshiai/shared";
import { api } from "../api";
import {
  extendManualScrollHold,
  hasReachedLatestPosition,
} from "../battle-scroll";
import {
  narrationStateFromSnapshot,
  reduceNarrationEvent,
  type BattleNarrationClientState,
} from "../battle-narration";
import { battleStoryBlocks } from "../battle-screen";
import { BattlePageView } from "./BattlePageView";

/** Gap before requesting the next turn (does not wait for speech animation). */
const AUTO_TURN_DELAY_MS = 900;
const OPENING_DELAY_MS = 1000;
/** Stagger each public speech line after ground text is committed. */
const SPEECH_REVEAL_MS = 780;

/** Progressive reveal of the latest log block's speeches (does not block advance). */
type SpeechReveal = {
  key: string;
  visible: number;
  total: number;
};

/** Snapshot: GET + advance done. Story: narration follow. Progress: one advance loop. */
export function BattlePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isResume = searchParams.get("resume") === "1";
  const isViewOnly = searchParams.get("view") === "1";

  const [battle, setBattle] = useState<BattlePublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advancePhase, setAdvancePhase] = useState<BattleAdvancePhase | null>(null);
  const [narrationEntries, setNarrationEntries] = useState<BattleNarrationEntryPublic[]>([]);
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
  const advanceKeyRef = useRef<string | null>(null);
  const narrationStateRef = useRef<BattleNarrationClientState | null>(null);
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

  function bottomInset(): number {
    const marker = logEnd.current;
    if (!marker || typeof window === "undefined") return 80;
    return Number.parseFloat(getComputedStyle(marker).scrollMarginBottom) || 80;
  }

  function latestPositionReached(): boolean {
    const marker = logEnd.current;
    if (!marker || typeof window === "undefined") return true;
    const scrollport = marker.closest(".log");
    return hasReachedLatestPosition({
      latestTop: marker.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
      bottomInset: bottomInset(),
      scrollportBottom: scrollport?.getBoundingClientRect().bottom,
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
    const marker = logEnd.current;
    const log = marker?.closest(".log");
    if (log instanceof HTMLElement) {
      log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
    } else {
      marker?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
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
    advanceKeyRef.current = null;
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
    if (!id) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const followStory = async () => {
      try {
        if (!narrationStateRef.current) {
          const snapshot = await api.getBattleNarration(id);
          if (stopped) return;
          narrationStateRef.current = narrationStateFromSnapshot(snapshot);
        } else {
          await api.followBattleNarration(
            id,
            narrationStateRef.current.cursor,
            undefined,
            (event) => {
              if (stopped || !narrationStateRef.current) return;
              narrationStateRef.current = event.type === "reset"
                ? narrationStateFromSnapshot(event.snapshot)
                : reduceNarrationEvent(narrationStateRef.current, event);
              setNarrationEntries(narrationStateRef.current.entries);
            },
          );
        }
        if (!stopped && narrationStateRef.current) {
          setNarrationEntries(narrationStateRef.current.entries);
        }
      } catch (pollError) {
        console.warn("[battle] narration follow reconnect", pollError);
      } finally {
        if (!stopped) timer = setTimeout(followStory, 1500);
      }
    };
    void followStory();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      narrationStateRef.current = null;
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
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("wheel", onManualScrollIntent);
      window.removeEventListener("touchmove", onManualScrollIntent);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [id, battle?.id]);

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
    const last = [...battleStoryBlocks({
      entries: narrationEntries,
      legacyLog: battle?.log ?? [],
    })]
      .reverse()
      .find((block) => block.narrative);
    if (!last?.narrative) return;
    if (skipSpeechAnimRef.current) {
      skipSpeechAnimRef.current = false;
      setSpeechReveal(null);
      return;
    }
    startSpeechReveal(last.key, last.narrative.speeches.length);
    return () => clearSpeechTimers();
  }, [narrationEntries, battle?.log]);

  useEffect(() => {
    if (battle?.status !== "active" || isViewOnly) releaseAutoScrollHold();
  }, [battle?.status, isViewOnly]);

  useEffect(() => {
    if (!autoScrollHeldRef.current) scrollToLatest();
  }, [
    battle?.log,
    narrationEntries,
    speechReveal?.visible,
  ]);

  const canAdvance = Boolean(
    id && battle && battle.status === "active" && !paused && !error && !isViewOnly,
  );

  useEffect(() => {
    if (!id || !battle || !canAdvance) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settleWait: (() => void) | null = null;
    let nextDelay = battle.prologuePending ? OPENING_DELAY_MS : AUTO_TURN_DELAY_MS;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        settleWait = resolve;
        timer = setTimeout(() => {
          timer = null;
          settleWait = null;
          resolve();
        }, ms);
      });

    void (async () => {
      while (!stopped && !cancelledRef.current) {
        await wait(nextDelay);
        if (stopped || cancelledRef.current) return;
        setBusy(true);
        setAdvancePhase("resolving");
        try {
          const next = await advanceWithRetry(id, 2);
          if (cancelledRef.current) return;
          setBattle(next);
          setError(null);
          if (next.status !== "active") return;
          nextDelay = next.prologuePending ? OPENING_DELAY_MS : AUTO_TURN_DELAY_MS;
        } catch (err) {
          if (stopped || cancelledRef.current) return;
          setError(err instanceof Error ? err.message : "failed");
          return;
        } finally {
          if (!cancelledRef.current) {
            setBusy(false);
            setAdvancePhase(null);
          }
        }
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      settleWait?.();
    };
  }, [id, canAdvance]);

  async function advanceWithRetry(
    battleId: string,
    retries: number,
  ): Promise<BattlePublic> {
    let lastErr: unknown;
    const idempotencyKey = advanceKeyRef.current ?? crypto.randomUUID();
    advanceKeyRef.current = idempotencyKey;
    for (let i = 0; i <= retries; i++) {
      try {
        const battle = await api.advanceBattleStream(battleId, {
          idempotencyKey,
          onEvent: (event) => {
            if (cancelledRef.current) return;
            if (event.type === "phase") {
              setAdvancePhase(event.phase);
            }
            // Narration is owned by the separate receipt stream, not advance SSE.
          },
        });
        advanceKeyRef.current = null;
        return battle;
      } catch (err) {
        lastErr = err;
        // Brief pause then retry (LLM / tunnel blips)
        if (i < retries) {
          setAdvancePhase("resolving");
          await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("advance_failed");
  }

  function speechesVisibleForBlock(
    blockKey: string,
    speeches: SpeechLine[],
  ): SpeechLine[] {
    if (!speechReveal || speechReveal.key !== blockKey) return speeches;
    return speeches.slice(0, speechReveal.visible);
  }

  if (!battle && !error) return <p className="muted">読み込み中…</p>;
  if (!battle) return <p className="error">{error ?? "見つかりません"}</p>;

  return (
    <BattlePageView
      battle={battle}
      error={error}
      busy={busy}
      advancePhase={advancePhase}
      narrationEntries={narrationEntries}
      autoScrollHeld={autoScrollHeld}
      paused={paused}
      isResume={isResume}
      logEnd={logEnd}
      speechesVisibleForBlock={speechesVisibleForBlock}
      onTogglePaused={() => setPaused((value) => !value)}
      onRetryAdvance={() => setError(null)}
      onScrollToLatest={scrollToLatest}
    />
  );
}
