import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { BattlefieldPresetPublic } from "@kshiai/shared";
import { api, type BattlefieldAuthoringDraft } from "../api";
import { useLocalDraft } from "../hooks/useLocalDraft";
import { mediaSrc } from "../media";

const CHAT_PLACEHOLDER = "もっと霧を濃くして、障害物を増やして";

export function BattlefieldDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [field, setField] = useState<BattlefieldPresetPublic | null>(null);
  const [draft, setDraft] = useState<BattlefieldAuthoringDraft | null>(null);
  const [chat, setChat, clearChat] = useLocalDraft(
    `battlefields:chat:${id ?? "unknown"}`,
    "",
  );
  const [assistant, setAssistant] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    if (!id) return;
    await api
      .listBattlefields()
      .then(({ battlefields }) => {
        const found = battlefields.find((b) => b.id === id) ?? null;
        setField(found);
        if (!found) setError("not_found");
      });
  }

  useEffect(() => {
    void reload().catch((e) => setError(String(e)));
    void api.latestBattlefieldDraft().then((result) => {
      if (result.draft?.battlefield.id === id) {
        setDraft(result.draft);
      }
    }).catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onChat(e: FormEvent) {
    e.preventDefault();
    if (!id || field?.isSystem) return;
    const text = chat.trim();
    if (!text) {
      setError("調整内容を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.chatBattlefield(id, text);
      setDraft(res.draft);
      setAssistant(res.draft.assistantMessage);
      clearChat();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmDraft() {
    if (!draft) return;
    setBusy(true);
    try {
      const result = await api.confirmBattlefieldDraft(draft.id);
      setDraft(null);
      setField(result.battlefield);
      setAssistant(result.assistantMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDiscardDraft() {
    if (!draft) return;
    await api.discardBattlefieldDraft(draft.id);
    setDraft(null);
    clearChat();
    await reload();
  }

  async function onUpgrade() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.upgradeBattlefield(id);
      setDraft(result.draft);
      setAssistant(result.draft.assistantMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!id) return;
    const res = await api.copyBattlefield(id);
    nav(`/battlefields/${res.battlefield.id}`);
  }

  async function onDelete() {
    if (!id || field?.isSystem) return;
    if (!confirm("削除しますか？")) return;
    await api.deleteBattlefield(id);
    nav("/battlefields");
  }

  async function onImage() {
    if (!id || field?.isSystem) return;
    setBusy(true);
    try {
      const res = await api.generateBattlefieldImage(id);
      setField(res.battlefield);
      setAssistant(res.note ?? "画像を更新しました");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  if (!field && !error) return <p className="muted">読み込み中…</p>;
  if (!field) return <p className="error">戦場が見つかりません</p>;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{field.displayName}</h1>
        <div className="row" style={{ gap: "0.45rem" }}>
          {field.selectable ? (
            <Link
              className="btn primary"
              to={`/match?field=${encodeURIComponent(field.id)}`}
            >
              この戦場で対戦
            </Link>
          ) : null}
          <Link to="/battlefields">← 一覧</Link>
        </div>
      </div>

      <div className="panel grid" style={{ gap: "1rem" }}>
        {field.appearance.imageUrl ? (
          <img
            key={mediaSrc(field.appearance.imageUrl, field.updatedAt)}
            src={mediaSrc(field.appearance.imageUrl, field.updatedAt)}
            alt={field.displayName}
            style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 12 }}
          />
        ) : null}
        <div>
          <p>
            <span className="tag">{field.categoryLabel}</span>
            {field.isSystem && <span className="tag">システム（読み取り専用）</span>}
          </p>
          <p>{field.narrativeBlurb}</p>
          <p className="muted">{field.appearance.summary}</p>
          <p>
            地形のヒント: {field.terrainHints.join(" / ") || "—"}
            <br />
            障害物: {field.obstacleHints.join(" / ") || "—"}
            <br />
            状況: {field.conditionHints.join(" / ") || "—"}
          </p>
          <div className="row">
            {!field.isSystem && field.compatibility?.status === "ready" && (
              <button className="btn" type="button" disabled={busy} onClick={() => void onImage()}>
                画像を AI 生成
              </button>
            )}
            {!field.isSystem && field.upgradeAction && !draft ? (
              <button
                className="btn primary"
                type="button"
                disabled={busy}
                onClick={() => void onUpgrade()}
              >
                {field.upgradeAction.label}
              </button>
            ) : null}
            <button className="btn" type="button" onClick={() => void onCopy()}>
              コピーして編集
            </button>
            {!field.isSystem && (
              <button className="btn danger" type="button" onClick={() => void onDelete()}>
                削除
              </button>
            )}
          </div>
        </div>
      </div>

      {!field.isSystem && field.compatibility?.status === "ready" ? (
        <div className="panel">
          <h2>会話で微調整</h2>
          <p className="muted">雰囲気や地形、障害物を言葉で指定してください。</p>
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
          {draft ? (
            <div className="grid">
              <p>
                候補: <strong>{draft.battlefield.displayName}</strong>
                <br />
                {draft.battlefield.narrativeBlurb}
              </p>
              <div className="row">
                <button
                  className="btn primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void onConfirmDraft()}
                >
                  この候補を確定
                </button>
                <button
                  className="btn danger"
                  type="button"
                  disabled={busy}
                  onClick={() => void onDiscardDraft()}
                >
                  候補を破棄
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : !field.isSystem ? (
        <div className="panel">
          <p className="muted">
            この戦場は最新版への更新を確定するまで対戦・調整・画像生成には使えません。
          </p>
          {draft ? (
            <div className="grid">
              <p>
                更新候補: <strong>{draft.battlefield.displayName}</strong>
                <br />
                {draft.battlefield.narrativeBlurb}
              </p>
              <div className="row">
                <button
                  className="btn primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void onConfirmDraft()}
                >
                  更新候補を確定
                </button>
                <button
                  className="btn danger"
                  type="button"
                  disabled={busy}
                  onClick={() => void onDiscardDraft()}
                >
                  候補を破棄
                </button>
              </div>
            </div>
          ) : null}
          {assistant && <p className="ok">{assistant}</p>}
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <div className="panel">
          <p className="muted">
            システムプリセットは直接編集できません。「コピーして編集」で自分用に複製してください。
          </p>
        </div>
      )}
    </>
  );
}
