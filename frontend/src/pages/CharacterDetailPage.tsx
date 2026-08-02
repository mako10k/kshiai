import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CharacterPublic } from "@kshiai/shared";
import { api } from "../api";
import { useLocalDraft } from "../hooks/useLocalDraft";
import { mediaSrc } from "../media";

const CHAT_PLACEHOLDER = "もっと防御寄りにして";

export function CharacterDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [character, setCharacter] = useState<CharacterPublic | null>(null);
  const [chat, setChat, clearChat] = useLocalDraft(
    `characters:chat:${id ?? "unknown"}`,
    "",
  );
  const [assistant, setAssistant] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    void api
      .listCharacters()
      .then(({ characters }) => {
        const found = characters.find((c) => c.id === id) ?? null;
        setCharacter(found);
        if (!found) setError("not_found");
      })
      .catch((e) => setError(String(e)));
  }, [id]);

  async function onChat(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    const text = chat.trim();
    if (!text) {
      setError("調整内容を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.chatCharacter(id, text);
      setCharacter(res.character);
      setAssistant(res.assistantMessage);
      clearChat();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!id) return;
    const res = await api.copyCharacter(id);
    nav(`/characters/${res.character.id}`);
  }

  async function onDelete() {
    if (!id) return;
    if (!confirm("削除しますか？")) return;
    await api.deleteCharacter(id);
    nav("/characters");
  }

  async function onImage() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.generateImage(id);
      setCharacter(res.character);
      setAssistant(res.note ?? "画像を更新しました");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  if (!character && !error) return <p className="muted">読み込み中…</p>;
  if (!character) return <p className="error">キャラが見つかりません</p>;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{character.displayName}</h1>
        <Link to="/characters">← 一覧</Link>
      </div>

      <div className="panel grid" style={{ gridTemplateColumns: "160px 1fr", gap: "1rem" }}>
        {character.appearance.imageUrl ? (
          <img
            key={mediaSrc(character.appearance.imageUrl, character.updatedAt)}
            src={mediaSrc(character.appearance.imageUrl, character.updatedAt)}
            alt={character.displayName}
            style={{ width: 160, borderRadius: 12 }}
          />
        ) : (
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: 12,
              background: "#0b0e14",
              display: "grid",
              placeItems: "center",
              color: "#5b6780",
            }}
          >
            No Image
          </div>
        )}
        <div>
          <p>{character.narrativeBlurb}</p>
          <p className="muted">{character.appearance.summary}</p>
          <p className="record-line">
            <span className="rating">
              レーティング {Math.round(character.record.rating)}
              {character.record.provisional ? (
                <span className="tag">暫定</span>
              ) : (
                <span className="tag">確定寄り</span>
              )}
            </span>
            <br />
            <span className="muted">
              成績 {character.record.wins}勝 {character.record.losses}敗
              {character.record.draws ? ` ${character.record.draws}分` : ""}
              ／ {character.record.gamesPlayed} 試合
              {character.record.provisional
                ? "（しばらくは変動が大きく、暫定扱い）"
                : ""}
            </span>
          </p>
          <p>
            特技: {character.skillNames.join(" / ") || "—"}
            <br />
            武器: {character.weaponName ?? "—"} / 防具: {character.armorName ?? "—"}
          </p>
          <div className="row">
            <button className="btn" type="button" disabled={busy} onClick={() => void onImage()}>
              {busy ? "生成中…" : character.appearance.imageUrl ? "顔を再生成" : "顔を AI 生成"}
            </button>
            <button className="btn" type="button" onClick={() => void onCopy()}>
              コピー
            </button>
            <button className="btn danger" type="button" onClick={() => void onDelete()}>
              削除
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>会話で微調整</h2>
        <p className="muted">印象や戦い方の雰囲気を言葉で伝えてください。</p>
        <form className="grid" onSubmit={(e) => void onChat(e)}>
          <textarea
            value={chat}
            onChange={(e) => setChat(e.target.value)}
            placeholder={CHAT_PLACEHOLDER}
            rows={3}
          />
          <button className="btn primary" type="submit" disabled={busy}>
            送信
          </button>
        </form>
        {assistant && <p className="ok">{assistant}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
