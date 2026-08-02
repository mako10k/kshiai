import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { BattleListItem } from "@kshiai/shared";
import { api } from "../api";
import { useLocalDraft } from "../hooks/useLocalDraft";

type StatusFilter = "all" | "active" | "finished";

type HistoryDraft = {
  q: string;
  status: StatusFilter;
};

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function HistoryPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<BattleListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [draft, setDraft] = useLocalDraft<HistoryDraft>("history:filters", {
    q: "",
    status: "all",
  });
  const { q, status } = draft;
  const setQ = (value: string) => setDraft((d) => ({ ...d, q: value }));
  const setStatus = (value: StatusFilter) =>
    setDraft((d) => ({ ...d, status: value }));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(
    async (query?: string, st?: StatusFilter) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.listBattles({
          q: query ?? q,
          status: st ?? status,
        });
        setItems(res.battles);
        setTotal(res.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "failed");
      } finally {
        setLoading(false);
      }
    },
    [q, status],
  );

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    await reload(q, status);
  }

  async function onFilter(st: StatusFilter) {
    setStatus(st);
    await reload(q, st);
  }

  function openBattle(b: BattleListItem) {
    if (b.canResume) {
      nav(`/battles/${b.id}?resume=1`);
    } else {
      nav(`/battles/${b.id}?view=1`);
    }
  }

  async function removeBattle(id: string) {
    if (!confirm("この試合記録を削除しますか？")) return;
    setBusyId(id);
    try {
      await api.deleteBattle(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = items.filter((b) => b.canResume).length;

  return (
    <div className="history-page">
      <div className="page-header">
        <h1>試合記録</h1>
        <div className="row" style={{ gap: "0.45rem" }}>
          <Link className="btn primary" to="/match">
            新しい試合
          </Link>
          <Link to="/" className="btn ghost page-header-back">
            メニュー
          </Link>
        </div>
      </div>

      <div className="panel history-panel">
        <form className="history-search" onSubmit={(e) => void onSearch(e)}>
          <input
            type="search"
            enterKeyHint="search"
            placeholder="名前・戦場・場面で検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="試合を検索"
          />
          <button className="btn" type="submit">
            検索
          </button>
        </form>

        <div className="filter-chips" role="group" aria-label="状態">
          {(
            [
              ["all", "すべて"],
              ["active", "進行中"],
              ["finished", "終了"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`chip${status === id ? " is-on" : ""}`}
              onClick={() => void onFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="muted help-text">
          {loading
            ? "読み込み中…"
            : total === 0
              ? "まだ試合がありません"
              : `${total} 件${activeCount && status !== "finished" ? `（進行中 ${activeCount}）` : ""}`}
        </p>

        {error && <p className="error">{error}</p>}

        <div className="history-list">
          {items.map((b) => (
            <article
              key={b.id}
              className={`history-card${b.canResume ? " is-active" : ""}`}
            >
              <button
                type="button"
                className="history-card-main"
                onClick={() => openBattle(b)}
              >
                <div className="history-card-top">
                  <strong className="history-vs">
                    {b.sideAName}
                    <span className="muted"> vs </span>
                    {b.sideBName}
                  </strong>
                  <span className={`status-pill${b.canResume ? " live" : ""}`}>
                    {b.canResume ? "進行中" : (b.resultLabel ?? "終了")}
                  </span>
                </div>
                <p className="history-meta muted">
                  {b.battlefieldName || b.scene}
                  {b.canResume
                    ? ` · ターン ${b.turn}/${b.turnLimit}`
                    : b.turn > 0
                      ? ` · ${b.turn} ターン`
                      : ""}
                </p>
                <p className="history-when muted">{formatWhen(b.updatedAt)}</p>
                <span className="history-cta">
                  {b.canResume ? "続きから再開 →" : "記録を見る →"}
                </span>
              </button>
              <button
                type="button"
                className="btn ghost history-delete"
                disabled={busyId === b.id}
                onClick={() => void removeBattle(b.id)}
                aria-label="削除"
              >
                削除
              </button>
            </article>
          ))}
        </div>

        {!loading && items.length === 0 && (
          <div className="empty-hint">
            <Link to="/match">新しい試合を始める</Link>
          </div>
        )}
      </div>

      <div className="match-action-bar">
        <Link className="btn primary match-start-btn" to="/match">
          新しい試合
        </Link>
      </div>
    </div>
  );
}
