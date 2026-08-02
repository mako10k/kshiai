import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { CharacterPublic } from "@kshiai/shared";
import { api } from "../api";

export function CharactersPage() {
  const [list, setList] = useState<CharacterPublic[]>([]);
  const [q, setQ] = useState("");
  const [prompt, setPrompt] = useState(
    "名前は赤髪の剣士アキ。機転とスピードを武器にする都市の用心棒。",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload(query?: string) {
    const { characters } = await api.listCharacters(query);
    setList(characters);
  }

  useEffect(() => {
    void reload().catch((e) => setError(String(e)));
  }, []);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    await reload(q);
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.generateCharacter(prompt);
      setMessage(res.assistantMessage);
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
        <Link to="/">← メニュー</Link>
      </div>

      <div className="panel">
        <h2>自然文から生成</h2>
        <p className="muted">構造化データは裏側だけ。あなたには会話で伝わります。</p>
        <form className="grid" onSubmit={(e) => void onGenerate(e)}>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
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
                <img src={c.appearance.imageUrl} alt={c.displayName} />
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
              <Link className="btn" to={`/characters/${c.id}`}>
                詳細・調整
              </Link>
            </div>
          ))}
          {list.length === 0 && <p className="muted">キャラがまだいません。</p>}
        </div>
      </div>
    </>
  );
}
