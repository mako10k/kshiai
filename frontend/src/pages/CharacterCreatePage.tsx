import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CharacterPublic } from "@kshiai/shared";
import { api } from "../api";
import { useLocalDraft } from "../hooks/useLocalDraft";

const PROMPT_PLACEHOLDER =
  "名前はカエデ。紅葉色の髪の弓使い。森の案内人として旅人と獣の間を取り持つ。";

export function CharacterCreatePage() {
  const nav = useNavigate();
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

  useEffect(() => {
    void api.latestCharacterDraft()
      .then((result) => setDraft(result.draft))
      .catch((e) => setError(String(e)));
  }, []);

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
      nav(`/characters/${res.character.id}`);
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
        <h1>キャラ作成</h1>
        <Link to="/characters">← 一覧</Link>
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
              <strong>{draft.character.basicAttackName}</strong> —{" "}
              {draft.character.basicAttackDescription}
            </p>
            {draft.character.skillSummaries.map((skill) => (
              <p key={skill.name} style={{ margin: "0.35rem 0" }}>
                <strong>{skill.name}</strong> — {skill.description}
              </p>
            ))}
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
            />
            <button className="btn" type="submit" disabled={busy || !draftMessage.trim()}>
              会話で調整
            </button>
          </form>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button
              className="btn primary"
              type="button"
              disabled={busy}
              onClick={() => void confirmDraft()}
            >
              確定して保存
            </button>
            <button
              className="btn ghost danger"
              type="button"
              disabled={busy}
              onClick={() => void discardDraft()}
            >
              破棄
            </button>
          </div>
        </div>
      )}
    </>
  );
}
