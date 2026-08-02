import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { CharacterPublic } from "@kshiai/shared";
import { api } from "../api";
import { useLocalDraft } from "../hooks/useLocalDraft";
import { mediaSrc } from "../media";

const PROMPT_PLACEHOLDER =
  "名前はカエデ。紅葉色の髪の弓使い。森の案内人として旅人と獣の間を取り持つ。";

export function CharactersPage() {
  const [list, setList] = useState<CharacterPublic[]>([]);
  const [q, setQ] = useLocalDraft("characters:search", "");
  const [prompt, setPrompt, clearPrompt] = useLocalDraft("characters:create", "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload(query?: string) {
    const { characters } = await api.listCharacters(query);
    setList(characters);
  }

  useEffect(() => {
    void reload(q || undefined).catch((e) => setError(String(e)));
    // initial load with restored search only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    await reload(q);
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) {
      setError("生成する内容を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.generateCharacter(text);
      setMessage(res.assistantMessage);
      clearPrompt();
      await reload(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>キャラ管理</h1>
        <div className="row" style={{ gap: "0.45rem" }}>
          <Link className="btn primary" to="/match">
            対戦セットアップ
          </Link>
          <Link to="/">← メニュー</Link>
        </div>
      </div>

      <div className="panel">
        <h2>自然文から生成</h2>
        <p className="muted">自然文で伝えてください。会話でも調整できます。</p>
        <form className="grid" onSubmit={(e) => void onGenerate(e)}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={PROMPT_PLACEHOLDER}
            rows={4}
          />
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "生成中…" : "生成する"}
          </button>
        </form>
        {message && <p className="ok">{message}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      <div className="panel">
        <form className="row" onSubmit={(e) => void onSearch(e)}>
          <input
            placeholder="検索…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn" type="submit">
            検索
          </button>
        </form>
        <div className="grid cards" style={{ marginTop: "1rem" }}>
          {list.map((c) => (
            <div className="card" key={c.id}>
              {c.appearance.imageUrl ? (
                <img
                  key={mediaSrc(c.appearance.imageUrl, c.updatedAt)}
                  src={mediaSrc(c.appearance.imageUrl, c.updatedAt)}
                  alt={c.displayName}
                />
              ) : (
                <div
                  style={{
                    aspectRatio: 1,
                    borderRadius: 8,
                    background: "#0b0e14",
                    display: "grid",
                    placeItems: "center",
                    color: "#5b6780",
                  }}
                >
                  No Image
                </div>
              )}
              <strong>{c.displayName}</strong>
              <p className="record-line">
                <span className="rating">
                  {Math.round(c.record.rating)}
                  {c.record.provisional ? (
                    <span className="tag">暫定</span>
                  ) : null}
                </span>
                <span className="muted">
                  {c.record.wins}勝 {c.record.losses}敗
                  {c.record.draws ? ` ${c.record.draws}分` : ""}
                  {c.record.gamesPlayed
                    ? `（${c.record.gamesPlayed}試合）`
                    : ""}
                </span>
              </p>
              <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                {c.narrativeBlurb}
              </p>
              <div>
                {c.tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
              <div className="row" style={{ marginTop: "0.5rem", gap: "0.4rem" }}>
                <Link className="btn primary" to={`/match?my=${encodeURIComponent(c.id)}`}>
                  このキャラで対戦
                </Link>
                <Link className="btn" to={`/characters/${c.id}`}>
                  詳細・調整
                </Link>
              </div>
            </div>
          ))}
          {list.length === 0 && <p className="muted">キャラがまだいません。</p>}
        </div>
      </div>
    </>
  );
}
