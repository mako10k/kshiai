import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { BattlefieldPresetPublic } from "@kshiai/shared";
import { api } from "../api";
import { AuthoringProgressNotice } from "../components/AuthoringProgressNotice";
import { useLocalDraft } from "../hooks/useLocalDraft";
import { mediaSrc } from "../media";

const CHAT_PLACEHOLDER = "もっと霧を濃くして、障害物を増やして";

function BattlefieldOwnerActions(props: {
  field: BattlefieldPresetPublic;
  busy: boolean;
  onImage: () => void;
  onUpgrade: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const field = props.field;
  return (
    <div className="row">
      {!field.isSystem && field.compatibility?.status === "ready" ? (
        <button className="btn" type="button" disabled={props.busy} onClick={props.onImage}>
          画像を AI 生成
        </button>
      ) : null}
      {!field.isSystem && field.upgradeAction ? (
        <button
          className="btn primary"
          type="button"
          disabled={props.busy}
          onClick={props.onUpgrade}
        >
          {field.upgradeAction.label}
        </button>
      ) : null}
      <button className="btn" type="button" onClick={props.onCopy}>
        コピーして編集
      </button>
      {!field.isSystem ? (
        <button className="btn danger" type="button" onClick={props.onDelete}>
          削除
        </button>
      ) : null}
    </div>
  );
}

function BattlefieldOwnerEditor(props: {
  field: BattlefieldPresetPublic;
  busy: boolean;
  chat: string;
  setChat: (value: string) => void;
  assistant: string | null;
  error: string | null;
  onChat: (event: FormEvent) => void;
}) {
  const field = props.field;
  if (field.isSystem) {
    return (
      <div className="panel">
        <p className="muted">
          システムプリセットは直接編集できません。「コピーして編集」で自分用に複製してください。
        </p>
      </div>
    );
  }
  if (field.compatibility?.status !== "ready") {
    return (
      <div className="panel">
        <p className="muted">
          この戦場は最新版への更新を確定するまで対戦・調整・画像生成には使えません。
        </p>
        <AuthoringProgressNotice active={props.busy} fallbackLabel="戦場を更新中…" />
        {props.assistant ? <p className="ok">{props.assistant}</p> : null}
        {props.error ? <p className="error">{props.error}</p> : null}
      </div>
    );
  }
  return (
    <div className="panel">
      <h2>会話で微調整</h2>
      <p className="muted">雰囲気や地形、障害物を言葉で指定してください。</p>
      <form className="grid" onSubmit={props.onChat}>
        <textarea
          value={props.chat}
          onChange={(event) => props.setChat(event.target.value)}
          placeholder={CHAT_PLACEHOLDER}
          rows={3}
        />
        <button className="btn primary" type="submit" disabled={props.busy}>
          送信
        </button>
      </form>
      <AuthoringProgressNotice active={props.busy} fallbackLabel="戦場を更新中…" />
      {props.assistant ? <p className="ok">{props.assistant}</p> : null}
      {props.error ? <p className="error">{props.error}</p> : null}
    </div>
  );
}

function BattlefieldDetailSummary(props: {
  field: BattlefieldPresetPublic;
  busy: boolean;
  onImage: () => void;
  onUpgrade: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const field = props.field;
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
            {field.isSystem ? <span className="tag">システム（読み取り専用）</span> : null}
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
          <BattlefieldOwnerActions
            field={field}
            busy={props.busy}
            onImage={props.onImage}
            onUpgrade={props.onUpgrade}
            onCopy={props.onCopy}
            onDelete={props.onDelete}
          />
        </div>
      </div>
    </>
  );
}

function openBattlefieldReview(
  nav: ReturnType<typeof useNavigate>,
  setAssistant: (value: string) => void,
  res: { draft?: { id: string }; attemptId?: string },
): void {
  const attemptId = res.draft?.id ?? res.attemptId;
  if (attemptId) nav(`/reviews/battlefields/${attemptId}`);
  else setAssistant("受け付けました。準備できたら確認できます。");
}

async function loadBattlefield(
  id: string,
  setField: (field: BattlefieldPresetPublic | null) => void,
  setError: (value: string | null) => void,
): Promise<void> {
  const { battlefields } = await api.listBattlefields();
  const found = battlefields.find((item) => item.id === id) ?? null;
  setField(found);
  if (!found) setError("not_found");
}

async function chatBattlefieldDetail(
  id: string,
  message: string,
  nav: ReturnType<typeof useNavigate>,
  clearChat: () => void,
  setBusy: (value: boolean) => void,
  setError: (value: string | null) => void,
  setAssistant: (value: string) => void,
): Promise<void> {
  setBusy(true);
  setError(null);
  try {
    openBattlefieldReview(nav, setAssistant, await api.chatBattlefield(id, message));
    clearChat();
  } catch (err) {
    setError(err instanceof Error ? err.message : "failed");
  } finally {
    setBusy(false);
  }
}

async function runBattlefieldMutation(
  work: () => Promise<{ draft?: { id: string }; attemptId?: string } | BattlefieldPresetPublic>,
  nav: ReturnType<typeof useNavigate>,
  setBusy: (value: boolean) => void,
  setError: (value: string | null) => void,
  setAssistant: (value: string) => void,
  setField?: (field: BattlefieldPresetPublic) => void,
): Promise<void> {
  setBusy(true);
  setError(null);
  try {
    const result = await work();
    if ("id" in result && "narrativeBlurb" in result) {
      setField?.(result);
      return;
    }
    openBattlefieldReview(nav, setAssistant, result);
  } catch (err) {
    setError(err instanceof Error ? err.message : "failed");
  } finally {
    setBusy(false);
  }
}

export function BattlefieldDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [field, setField] = useState<BattlefieldPresetPublic | null>(null);
  const [chat, setChat, clearChat] = useLocalDraft(
    `battlefields:chat:${id ?? "unknown"}`,
    "",
  );
  const [assistant, setAssistant] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    void loadBattlefield(id, setField, setError).catch((err) => setError(String(err)));
    void api.latestBattlefieldDraft().then((result) => {
      const attemptId = result.draft?.id ?? result.progress?.attemptId ??
        result.failed?.attemptId;
      const assetId = result.draft?.battlefield.id ?? result.failed?.characterId;
      if (attemptId && assetId === id) nav(`/reviews/battlefields/${attemptId}`);
    }).catch((err) => setError(String(err)));
  }, [id, nav]);

  if (!field && !error) return <p className="muted">読み込み中…</p>;
  if (!field) return <p className="error">戦場が見つかりません</p>;

  return (
    <>
      <BattlefieldDetailSummary
        field={field}
        busy={busy}
        onImage={() => {
          if (!id || field.isSystem) return;
          void runBattlefieldMutation(
            async () => {
              const res = await api.generateBattlefieldImage(id);
              setAssistant(res.note ?? "画像を更新しました");
              return res.battlefield;
            },
            nav,
            setBusy,
            setError,
            setAssistant,
            setField,
          );
        }}
        onUpgrade={() => {
          if (!id) return;
          void runBattlefieldMutation(
            () => api.upgradeBattlefield(id),
            nav,
            setBusy,
            setError,
            setAssistant,
          );
        }}
        onCopy={() => {
          if (!id) return;
          void api.copyBattlefield(id).then((res) => nav(`/battlefields/${res.battlefield.id}`));
        }}
        onDelete={() => {
          if (!id || field.isSystem || !confirm("削除しますか？")) return;
          void api.deleteBattlefield(id).then(() => nav("/battlefields"));
        }}
      />
      <BattlefieldOwnerEditor
        field={field}
        busy={busy}
        chat={chat}
        setChat={setChat}
        assistant={assistant}
        error={error}
        onChat={(event) => {
          event.preventDefault();
          if (!id || field.isSystem || !chat.trim()) {
            if (!chat.trim()) setError("調整内容を入力してください");
            return;
          }
          void chatBattlefieldDetail(
            id,
            chat.trim(),
            nav,
            clearChat,
            setBusy,
            setError,
            setAssistant,
          );
        }}
      />
    </>
  );
}
