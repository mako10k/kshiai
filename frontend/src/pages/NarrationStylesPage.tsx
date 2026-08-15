import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  perspectiveLabel,
  type NarrationStylePublic,
} from "@kshiai/shared";
import { api } from "../api";
import { AuthoringProgressNotice } from "../components/AuthoringProgressNotice";
import { useAuthoringProgressPoll } from "../hooks/useAuthoringProgressPoll";
import { useLocalDraft } from "../hooks/useLocalDraft";
import { AssetReviewMark } from "./CharacterReviewMark";
import { pollLatestAuthoring } from "./asset-review-shared";

const GEN_PLACEHOLDER =
  "昭和のラジオ実況みたいに熱く、でも下品にならない感じで";

function NarrationGenerateForm(props: {
  prompt: string;
  setPrompt: (value: string) => void;
  revisingId: string | null;
  busy: boolean;
  onGenerate: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <div className="panel">
      <h2>{props.revisingId ? "最新版の修正候補" : "自然文から候補を生成"}</h2>
      <form className="grid" onSubmit={props.onGenerate}>
        <textarea
          value={props.prompt}
          onChange={(event) => props.setPrompt(event.target.value)}
          placeholder={GEN_PLACEHOLDER}
          rows={3}
        />
        <div className="row">
          <button className="btn primary" type="submit" disabled={props.busy}>
            {props.busy ? "生成中…" : props.revisingId ? "修正候補を生成" : "候補を生成"}
          </button>
          {props.revisingId ? (
            <button className="btn" type="button" onClick={props.onCancel}>
              キャンセル
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function NarrationStyleCard(props: {
  style: NarrationStylePublic;
  busy: boolean;
  onRevise: (id: string) => void;
  onUpgrade: (style: NarrationStylePublic) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const style = props.style;
  return (
    <div className="card" style={{ padding: "0.85rem" }}>
      <AssetReviewMark
        reviewState={style.reviewState}
        href={
          style.reviewAttemptId
            ? `/reviews/narration-styles/${style.reviewAttemptId}`
            : "/narration-styles"
        }
      />
      <strong>
        {style.displayName}
        {style.isSystem ? <span className="tag" style={{ marginLeft: 6 }}>システム</span> : null}
        <span className="tag" style={{ marginLeft: 6 }}>
          {style.selectable ? "選択可能" : "更新が必要"}
        </span>
      </strong>
      <p className="muted" style={{ margin: "0.35rem 0" }}>
        {style.description || "—"}
        <span className="tag" style={{ marginLeft: 6 }}>
          {perspectiveLabel(style.perspective)}
        </span>
      </p>
      <div>
        {style.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
      </div>
      {!style.isSystem ? (
        <div className="row" style={{ marginTop: "0.65rem" }}>
          {style.selectable ? (
            <button className="btn" type="button" onClick={() => props.onRevise(style.id)}>
              修正候補を作る
            </button>
          ) : (
            <button
              className="btn primary"
              type="button"
              disabled={props.busy}
              onClick={() => props.onUpgrade(style)}
            >
              最新版に更新
            </button>
          )}
          <button
            className="btn danger"
            type="button"
            onClick={() => props.onDelete(style.id, style.displayName)}
          >
            削除
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function NarrationStylesPage() {
  const nav = useNavigate();
  const [list, setList] = useState<NarrationStylePublic[]>([]);
  const [prompt, setPrompt, clearPrompt] = useLocalDraft(
    "narration-styles:generate",
    "",
  );
  const [readyAttemptId, setReadyAttemptId] = useState<string | null>(null);
  const [revisingId, setRevisingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resumeInFlight, setResumeInFlight] = useState(false);
  const [trackedAttemptId, setTrackedAttemptId] = useState<string | null>(null);
  const progress = useAuthoringProgressPoll({
    enabled: busy || resumeInFlight,
    poll: () => pollLatestAuthoring(api.latestNarrationStyleDraft, {
      trackedAttemptId,
      onReady: (attemptId) => nav(`/reviews/narration-styles/${attemptId}`),
      setResumeInFlight,
      setError,
    }),
  });

  async function reload() {
    const { styles } = await api.listNarrationStyles();
    setList(styles);
  }

  useEffect(() => {
    void Promise.all([
      reload(),
      api.latestNarrationStyleDraft().then((latest) => {
        if (latest.failed) {
          setError(latest.failed.errorCode ?? "生成に失敗しました");
          return;
        }
        if (latest.draft) {
          setReadyAttemptId(latest.draft.id);
          return;
        }
        if (latest.progress) {
          setTrackedAttemptId(latest.progress.attemptId ?? null);
          setResumeInFlight(true);
        }
      }),
    ]).catch((e) => setError(String(e)));
  }, []);

  function openReview(res: { draft?: { id: string }; attemptId?: string }) {
    const attemptId = res.draft?.id ?? res.attemptId;
    if (attemptId && res.draft) {
      nav(`/reviews/narration-styles/${attemptId}`);
      return;
    }
    if (attemptId) {
      setTrackedAttemptId(attemptId);
      setResumeInFlight(true);
      setMessage("受け付けました。準備できたら確認できます。");
      return;
    }
    setError("受け付けに失敗しました");
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) {
      setError("語り口の希望を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      openReview(
        revisingId
          ? await api.reviseNarrationStyle(revisingId, text)
          : await api.generateNarrationStyle(text),
      );
      setRevisingId(null);
      clearPrompt();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onUpgrade(style: NarrationStylePublic) {
    setBusy(true);
    setError(null);
    try {
      openReview(await api.upgradeNarrationStyle(style.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    await api.deleteNarrationStyle(id);
    await reload();
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>ナレーションスタイル</h1>
        <div className="row" style={{ gap: "0.45rem" }}>
          <Link className="btn primary" to="/match">対戦セットアップ</Link>
          <Link to="/">← メニュー</Link>
        </div>
      </div>

      <p className="muted">
        自然文から視点・声・テンポ・フェーズ別方針を構造化し、公開説明と一緒に確認してから確定します。
      </p>

      <NarrationGenerateForm
        prompt={prompt}
        setPrompt={setPrompt}
        revisingId={revisingId}
        busy={busy || resumeInFlight}
        onGenerate={(event) => void onGenerate(event)}
        onCancel={() => setRevisingId(null)}
      />

      {readyAttemptId ? (
        <div className="panel">
          <h2>確認待ちの案があります</h2>
          <Link className="btn primary" to={`/reviews/narration-styles/${readyAttemptId}`}>
            確認画面を開く
          </Link>
        </div>
      ) : null}

      <AuthoringProgressNotice
        active={busy || resumeInFlight}
        progress={progress}
        fallbackLabel="語り口を生成中…"
      />
      {message && <p className="ok">{message}</p>}
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <h2>一覧</h2>
        <div className="grid" style={{ gap: "0.75rem" }}>
          {list.map((style) => (
            <NarrationStyleCard
              key={style.id}
              style={style}
              busy={busy}
              onRevise={setRevisingId}
              onUpgrade={(item) => void onUpgrade(item)}
              onDelete={(id, name) => void onDelete(id, name)}
            />
          ))}
          {list.length === 0 && <p className="muted">スタイルがありません。</p>}
        </div>
      </div>
    </>
  );
}
