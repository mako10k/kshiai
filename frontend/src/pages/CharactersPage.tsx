import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  formatRatingForDisplay,
  type CharacterPublic,
} from "@kshiai/shared";
import { api } from "../api";
import { useLocalDraft } from "../hooks/useLocalDraft";
import { mediaSrc } from "../media";

const PAGE_SIZE = 10;

export function CharactersPage() {
  const [list, setList] = useState<CharacterPublic[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useLocalDraft("characters:search", "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload(query: string, pageOffset: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.listCharacters(query || undefined, {
        limit: PAGE_SIZE,
        offset: pageOffset,
      });
      setList(res.characters);
      setTotal(res.total);
      setOffset(res.offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void reload(q, 0);
    // initial load with restored search only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    await reload(q, 0);
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>キャラ管理</h1>
        <div className="row" style={{ gap: "0.45rem" }}>
          <Link className="btn primary" to="/characters/new">
            新規作成
          </Link>
          <Link className="btn" to="/match">
            対戦
          </Link>
          <Link to="/">← メニュー</Link>
        </div>
      </div>

      <div className="panel">
        <form className="row" onSubmit={(e) => void onSearch(e)}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="名前・紹介・タグで検索"
            style={{ flex: 1 }}
          />
          <button className="btn" type="submit" disabled={busy}>
            検索
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <p className="muted" style={{ marginTop: "0.75rem" }}>
          {total} 件中 {total === 0 ? 0 : offset + 1}–
          {Math.min(offset + list.length, total)} を表示
        </p>
      </div>

      <div className="grid cards">
        {list.map((character) => (
          <div className="card" key={character.id}>
            <Link className="char-card-face" to={`/characters/${character.id}`}>
              {character.appearance.imageUrl ? (
                <img
                  src={mediaSrc(character.appearance.imageUrl)}
                  alt={character.displayName}
                />
              ) : (
                <div className="card-ph">{character.displayName.slice(0, 1)}</div>
              )}
            </Link>
            <Link className="char-card-name" to={`/characters/${character.id}`}>
              <strong>{character.displayName}</strong>
            </Link>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              {character.narrativeBlurb.slice(0, 80)}
              {character.narrativeBlurb.length > 80 ? "…" : ""}
            </p>
            <p className="muted" style={{ marginBottom: 0, fontSize: "0.8rem" }}>
              公開: {visibilityLabel(character.visibility)} / レート{" "}
              {formatRatingForDisplay(character.record.rating)}
            </p>
          </div>
        ))}
      </div>

      {list.length === 0 && !busy && (
        <p className="muted">キャラがありません。新規作成から始めましょう。</p>
      )}

      <div className="row pager" style={{ justifyContent: "center", gap: "0.75rem" }}>
        <button
          type="button"
          className="btn ghost"
          disabled={!canPrev || busy}
          onClick={() => void reload(q, Math.max(0, offset - PAGE_SIZE))}
        >
          前へ
        </button>
        <span className="muted">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          className="btn ghost"
          disabled={!canNext || busy}
          onClick={() => void reload(q, offset + PAGE_SIZE)}
        >
          次へ
        </button>
      </div>
    </>
  );
}

function visibilityLabel(value: CharacterPublic["visibility"]): string {
  switch (value) {
    case "friends":
      return "フレンド";
    case "private":
      return "非公開";
    default:
      return "公開";
  }
}
