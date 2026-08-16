import type { RefObject } from "react";
import { Link } from "react-router-dom";
import {
  formatRatingForDisplay,
  formatSpeech,
  narrativeEntries,
  type BattleAdvancePhase,
  type BattleNarrationEntryPublic,
  type BattlePublic,
  type SpeechLine,
} from "@kshiai/shared";
import { battleProgressText, battleStoryBlocks } from "../battle-screen";
import { mediaSrc } from "../media";

export function BattlePageView(input: {
  battle: BattlePublic;
  error: string | null;
  busy: boolean;
  advancePhase: BattleAdvancePhase | null;
  narrationEntries: BattleNarrationEntryPublic[];
  autoScrollHeld: boolean;
  paused: boolean;
  isResume: boolean;
  logEnd: RefObject<HTMLDivElement | null>;
  speechesVisibleForBlock: (blockKey: string, speeches: SpeechLine[]) => SpeechLine[];
  onTogglePaused: () => void;
  onRetryAdvance: () => void;
  onScrollToLatest: () => void;
}) {
  const {
    battle,
    error,
    busy,
    advancePhase,
    narrationEntries,
    autoScrollHeld,
    paused,
    isResume,
    logEnd,
    speechesVisibleForBlock,
  } = input;
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
  const story = battleStoryBlocks({
    entries: narrationEntries,
    legacyLog: battle.log,
  });
  const progressText = battleProgressText({
    paused,
    error,
    busy,
    phase: advancePhase,
  });

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
                  : `ターン ${battle.turn} / ${battle.turnLimit}${
                      battle.combatBeat && battle.combatBeatsPerTurn
                        ? ` · ${battle.combatBeat}/${battle.combatBeatsPerTurn}`
                        : ""
                    }`}
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
          </div>
        )}
        {battle.objectStates && battle.objectStates.length > 0 ? (
          <details className="battle-field-state">
            <summary>戦場の物（{battle.objectStates.length}）</summary>
            <ul className="object-state-list">
              {battle.objectStates.map((row) => (
                <li key={`${row.kind}-${row.label}-${row.placementSummary ?? ""}`}>
                  <strong>{row.label}</strong>
                  {row.placementSummary ? (
                    <span className="muted"> · {row.placementSummary}</span>
                  ) : null}
                  {row.states.length > 0 ? (
                    <span className="muted">
                      {" "}
                      {row.states.slice(0, 3).join(" / ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <div className="panel">
        <h2>物語</h2>
        <div className="log">
          {story.map((block) => (
            <div
              className={`log-block${block.streaming ? " log-block-streaming" : ""}`}
              key={block.key}
              aria-live={block.streaming ? "polite" : undefined}
            >
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                — {block.heading}{block.streaming ? "（ナレーション待機中）" : ""} —
              </div>
              {block.narrative
                ? narrativeEntries({
                    ...block.narrative,
                    speeches: speechesVisibleForBlock(
                      block.key,
                      block.narrative.speeches,
                    ),
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
                  )
                : (
                    <p className="muted" style={{ margin: "0.25rem 0" }}>
                      {block.pendingText}
                    </p>
                  )}
            </div>
          ))}
          <div ref={logEnd} className="battle-log-end" />
        </div>
      </div>

      {!finished ? (
        <div className="panel">
          <h2>進行</h2>
          {isResume && paused && (
            <p className="muted">続きから開きました。準備ができたら再開してください。</p>
          )}
          <div className="row">
            <span className={!busy && !paused && !error ? "ok" : "muted"}>
              {progressText}
            </span>
            <button
              className="btn primary"
              type="button"
              onClick={input.onTogglePaused}
            >
              {paused ? "再開する" : "一時停止"}
            </button>
            {error && (
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={input.onRetryAdvance}
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
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {autoScrollHeld ? (
        <button
          className="btn primary battle-scroll-latest"
          type="button"
          onClick={input.onScrollToLatest}
          title="最新位置へ戻って自動スクロールを再開"
        >
          最新へ戻る ↓
        </button>
      ) : null}
    </>
  );
}
