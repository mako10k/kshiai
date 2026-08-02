import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CharacterPublic } from "@kshiai/shared";
import { api, ApiError, type ImageGenQuota } from "../api";
import { useLocalDraft } from "../hooks/useLocalDraft";
import { mediaSrc } from "../media";

const CHAT_PLACEHOLDER = "もっと防御寄りにして";

function formatNextAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function quotaHint(q: ImageGenQuota | null): string {
  if (!q) return "";
  if (q.allowed) {
    return `顔生成の残り: 1時間 ${q.remainingHour}/${q.limitHour} ・ 本日 ${q.remainingDay}/${q.limitDay}`;
  }
  const next = formatNextAt(q.nextAllowedAt);
  return next
    ? `顔生成は上限です。次回可能: ${next}`
    : "顔生成は上限です。しばらく待ってから再度お試しください。";
}

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
  const [imageBusy, setImageBusy] = useState(false);
  const [quota, setQuota] = useState<ImageGenQuota | null>(null);

  const reloadQuota = useCallback(async (charId: string) => {
    try {
      const res = await api.imageQuota(charId);
      setQuota(res.quota);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    void api
      .listCharacters()
      .then(({ characters }) => {
        const found = characters.find((c) => c.id === id) ?? null;
        setCharacter(found);
        if (!found) setError("not_found");
        else void reloadQuota(id);
      })
      .catch((e) => setError(String(e)));
  }, [id, reloadQuota]);

  // Refresh countdown label while waiting for next slot
  useEffect(() => {
    if (!quota || quota.allowed || !quota.nextAllowedAt || !id) return;
    const tick = () => {
      const t = Date.parse(quota.nextAllowedAt!);
      if (Number.isFinite(t) && Date.now() >= t) {
        void reloadQuota(id);
      }
    };
    const idTimer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(idTimer);
  }, [quota, id, reloadQuota]);

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
    if (quota && !quota.allowed) {
      setError(quotaHint(quota));
      return;
    }
    setImageBusy(true);
    setError(null);
    try {
      const res = await api.generateImage(id);
      setCharacter(res.character);
      setAssistant(res.note ?? "画像を更新しました");
      if (res.quota) setQuota(res.quota);
      else void reloadQuota(id);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.quota) setQuota(err.quota);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "failed");
      }
    } finally {
      setImageBusy(false);
    }
  }

  if (!character && !error) return <p className="muted">読み込み中…</p>;
  if (!character) return <p className="error">キャラが見つかりません</p>;

  const imageBlocked = Boolean(quota && !quota.allowed);
  const imageLabel = imageBusy
    ? "生成中…"
    : imageBlocked
      ? "顔生成は上限です"
      : character.appearance.imageUrl
        ? "顔を再生成"
        : "顔を AI 生成";

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{character.displayName}</h1>
        <div className="row" style={{ gap: "0.45rem" }}>
          <Link
            className="btn primary"
            to={`/match?my=${encodeURIComponent(character.id)}`}
          >
            このキャラで対戦
          </Link>
          <Link to="/characters">← 一覧</Link>
        </div>
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
            <Link
              className="btn primary"
              to={`/match?my=${encodeURIComponent(character.id)}`}
            >
              対戦する
            </Link>
            <button
              className="btn"
              type="button"
              disabled={imageBusy || busy || imageBlocked}
              onClick={() => void onImage()}
              title={quotaHint(quota)}
            >
              {imageLabel}
            </button>
            <button className="btn" type="button" onClick={() => void onCopy()}>
              コピー
            </button>
            <button className="btn danger" type="button" onClick={() => void onDelete()}>
              削除
            </button>
          </div>
          {quota && (
            <p className={`image-quota-hint${imageBlocked ? " is-blocked" : ""}`}>
              {quotaHint(quota)}
              {imageBlocked && quota.nextAllowedAt ? (
                <>
                  <br />
                  <span className="muted">
                    （制限: 1時間に{quota.limitHour}回 / 1日に{quota.limitDay}回）
                  </span>
                </>
              ) : null}
            </p>
          )}
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
          <button className="btn primary" type="submit" disabled={busy || imageBusy}>
            送信
          </button>
        </form>
        {assistant && <p className="ok">{assistant}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
