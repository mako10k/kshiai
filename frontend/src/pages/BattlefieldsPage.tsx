import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { BattlefieldPresetPublic } from "@kshiai/shared";
import { api } from "../api";
import { useLocalDraft } from "../hooks/useLocalDraft";
import { mediaSrc } from "../media";

const PROMPT_PLACEHOLDER =
  "名前は霧深い鎮守の森。足元はぬかるみ、古い鳥居が傾いている。";

type CreateDraft = {
  prompt: string;
  category: string;
};

const DEFAULT_CREATE: CreateDraft = {
  prompt: "",
  category: "forest",
};

export function BattlefieldsPage() {
  const [list, setList] = useState<BattlefieldPresetPublic[]>([]);
  const [q, setQ] = useLocalDraft("battlefields:search", "");
  const [createDraft, setCreateDraft, clearCreate] = useLocalDraft<CreateDraft>(
    "battlefields:create",
    DEFAULT_CREATE,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const prompt = createDraft.prompt;
  const category = createDraft.category;

  async function reload(query?: string) {
    const { battlefields } = await api.listBattlefields(query);
    setList(battlefields);
  }

  useEffect(() => {
    void reload(q || undefined).catch((e) => setError(String(e)));
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
      const res = await api.generateBattlefield(text, category);
      setMessage(res.assistantMessage);
      clearCreate();
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
        <h1>戦場管理</h1>
        <div className="row" style={{ gap: "0.45rem" }}>
          <Link className="btn primary" to="/match">
            対戦セットアップ
          </Link>
          <Link to="/">← メニュー</Link>
        </div>
      </div>

      <div className="panel">
        <h2>自然文からプリセット生成</h2>
        <p className="muted">
          森・闘技場・海などのテンプレを編集できます。試合時はここから具体的な地形・障害・状況が決まります。
        </p>
        <form className="grid" onSubmit={(e) => void onGenerate(e)}>
          <label>
            カテゴリ
            <select
              value={category}
              onChange={(e) =>
                setCreateDraft((d) => ({ ...d, category: e.target.value }))
              }
            >
              <option value="forest">森</option>
              <option value="arena">闘技場</option>
              <option value="sea">海</option>
              <option value="urban">市街地</option>
              <option value="school">学校</option>
              <option value="mountain">山岳</option>
              <option value="ruins">廃墟</option>
              <option value="custom">その他</option>
            </select>
          </label>
          <textarea
            value={prompt}
            onChange={(e) =>
              setCreateDraft((d) => ({ ...d, prompt: e.target.value }))
            }
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
          {list.map((b) => (
            <div className="card" key={b.id}>
              {b.appearance.imageUrl ? (
                <img
                  key={mediaSrc(b.appearance.imageUrl, b.updatedAt)}
                  src={mediaSrc(b.appearance.imageUrl, b.updatedAt)}
                  alt={b.displayName}
                />
              ) : (
                <div
                  style={{
                    aspectRatio: "16/10",
                    borderRadius: 8,
                    background: "#0b0e14",
                    display: "grid",
                    placeItems: "center",
                    color: "#5b6780",
                  }}
                >
                  {b.categoryLabel}
                </div>
              )}
              <strong>
                {b.displayName}
                {b.isSystem ? (
                  <span className="tag" style={{ marginLeft: 6 }}>
                    システム
                  </span>
                ) : null}
              </strong>
              <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                {b.narrativeBlurb}
              </p>
              <div>
                <span className="tag">{b.categoryLabel}</span>
                {b.tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
              <div className="row" style={{ marginTop: "0.5rem", gap: "0.4rem" }}>
                <Link
                  className="btn primary"
                  to={`/match?field=${encodeURIComponent(b.id)}`}
                >
                  この戦場で対戦
                </Link>
                <Link className="btn" to={`/battlefields/${b.id}`}>
                  詳細・調整
                </Link>
              </div>
            </div>
          ))}
          {list.length === 0 && <p className="muted">プリセットがありません。</p>}
        </div>
      </div>
    </>
  );
}
