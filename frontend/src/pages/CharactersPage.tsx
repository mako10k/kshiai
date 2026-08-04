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
  const [draft, setDraft] = useState<{
    id: string;
    character: CharacterPublic;
    assistantMessage: string;
  } | null>(null);
  const [draftMessage, setDraftMessage] = useState("");

  async function reload(query?: string) {
    const { characters } = await api.listCharacters(query);
    setList(characters);
  }

  useEffect(() => {
    void reload(q || undefined).catch((e) => setError(String(e)));
    void api.latestCharacterDraft()
      .then((result) => setDraft(result.draft))
      .catch((e) => setError(String(e)));
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
      setDraft(res.draft);
      setMessage("内容を確認し、必要なら会話で調整してから確定してください。");
      clearPrompt();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDraftChat(e: FormEvent) {
    e.preventDefault();
    if (!draft || !draftMessage.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.chatCharacterDraft(draft.id, draftMessage.trim());
      setDraft(res.draft);
      setDraftMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDraft() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.confirmCharacterDraft(draft.id);
      setDraft(null);
      setMessage(res.assistantMessage);
      await reload(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function discardDraft() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await api.discardCharacterDraft(draft.id);
      setDraft(null);
      setMessage("下書きを破棄しました。");
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

      {draft && (
        <div className="panel">
          <h2>生成内容を確認</h2>
          <div className="card" style={{ padding: "1rem" }}>
            <strong>{draft.character.displayName}</strong>
            <p>{draft.character.narrativeBlurb}</p>
            <p className="muted">{draft.character.appearance.summary}</p>
            <p>
              <strong>{draft.character.basicAttackName}</strong> — {draft.character.basicAttackDescription}
            </p>
            {draft.character.skillSummaries.map((skill) => (
              <p key={skill.name} style={{ margin: "0.35rem 0" }}>
                <strong>{skill.name}</strong> — {skill.description}
              </p>
            ))}
            {(draft.character.weaponName || draft.character.armorName) && (
              <p className="muted">
                {[draft.character.weaponName, draft.character.armorName]
                  .filter(Boolean)
                  .join(" / ")}
              </p>
            )}
            <div>
              {draft.character.tags.map((tag) => (
                <span className="tag" key={tag}>{tag}</span>
              ))}
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              {draft.assistantMessage}
            </p>
          </div>
          <form className="grid" onSubmit={(e) => void onDraftChat(e)}>
            <textarea
              value={draftMessage}
              onChange={(e) => setDraftMessage(e.target.value)}
              placeholder="例: もっと防御寄りに。髪色を暗い赤に。"
              rows={3}
              disabled={busy}
            />
            <button className="btn" type="submit" disabled={busy || !draftMessage.trim()}>
              会話で調整
            </button>
          </form>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button className="btn primary" type="button" disabled={busy} onClick={() => void confirmDraft()}>
              この内容で確定
            </button>
            <button className="btn danger" type="button" disabled={busy} onClick={() => void discardDraft()}>
              下書きを破棄
            </button>
          </div>
        </div>
      )}

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
              <Link
                to={`/characters/${c.id}`}
                className="char-card-face"
                aria-label={`${c.displayName} の詳細`}
              >
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
              </Link>
              <Link to={`/characters/${c.id}`} className="char-card-name">
                <strong>{c.displayName}</strong>
              </Link>
              <p className="record-line">
                <span className="rating" title="公開（他アカウント対戦のみ）">
                  公開 {Math.round(c.record.rating)}
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
              {c.recordOverall ? (
                <p className="record-line record-overall">
                  <span className="rating" title="本人のみ見える全試合統計">
                    全体 {Math.round(c.recordOverall.rating)}
                    {c.recordOverall.provisional ? (
                      <span className="tag">暫定</span>
                    ) : null}
                  </span>
                  <span className="muted">
                    {c.recordOverall.wins}勝 {c.recordOverall.losses}敗
                    {c.recordOverall.draws
                      ? ` ${c.recordOverall.draws}分`
                      : ""}
                    {c.recordOverall.gamesPlayed
                      ? `（${c.recordOverall.gamesPlayed}試合）`
                      : ""}
                  </span>
                </p>
              ) : null}
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
