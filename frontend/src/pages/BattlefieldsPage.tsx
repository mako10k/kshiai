import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { BattlefieldPresetPublic } from "@kshiai/shared";
import { api } from "../api";
import { AuthoringProgressNotice } from "../components/AuthoringProgressNotice";
import { useAuthoringProgressPoll } from "../hooks/useAuthoringProgressPoll";
import { useLocalDraft } from "../hooks/useLocalDraft";
import { mediaSrc } from "../media";
import { AssetReviewMark } from "./CharacterReviewMark";
import { pollLatestAuthoring } from "./asset-review-shared";

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

function BattlefieldGenerateForm(props: {
  category: string;
  prompt: string;
  setCreateDraft: (updater: (draft: CreateDraft) => CreateDraft) => void;
  busy: boolean;
  onGenerate: (event: FormEvent) => void;
}) {
  return (
    <form className="grid" onSubmit={props.onGenerate}>
      <label>
        カテゴリ
        <select
          value={props.category}
          onChange={(event) =>
            props.setCreateDraft((draft) => ({ ...draft, category: event.target.value }))
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
        value={props.prompt}
        onChange={(event) =>
          props.setCreateDraft((draft) => ({ ...draft, prompt: event.target.value }))
        }
        placeholder={PROMPT_PLACEHOLDER}
        rows={4}
      />
      <button className="btn primary" type="submit" disabled={props.busy}>
        {props.busy ? "生成中…" : "生成する"}
      </button>
    </form>
  );
}

function BattlefieldCard(props: { field: BattlefieldPresetPublic }) {
  const field = props.field;
  return (
    <div className="card">
      <AssetReviewMark
        reviewState={field.reviewState}
        href={
          field.reviewAttemptId
            ? `/reviews/battlefields/${field.reviewAttemptId}`
            : `/battlefields/${field.id}`
        }
      />
      {field.appearance.imageUrl ? (
        <img
          key={mediaSrc(field.appearance.imageUrl, field.updatedAt)}
          src={mediaSrc(field.appearance.imageUrl, field.updatedAt)}
          alt={field.displayName}
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
          {field.categoryLabel}
        </div>
      )}
      <strong>
        {field.displayName}
        {field.isSystem ? <span className="tag" style={{ marginLeft: 6 }}>システム</span> : null}
      </strong>
      <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
        {field.narrativeBlurb}
      </p>
      <div>
        <span className="tag">{field.categoryLabel}</span>
        {field.tags.map((tag) => (
          <span className="tag" key={tag}>{tag}</span>
        ))}
      </div>
      <div className="row" style={{ marginTop: "0.5rem", gap: "0.4rem" }}>
        {field.selectable ? (
          <Link className="btn primary" to={`/match?field=${encodeURIComponent(field.id)}`}>
            この戦場で対戦
          </Link>
        ) : (
          <span className="tag">最新版への更新が必要</span>
        )}
        <Link className="btn" to={`/battlefields/${field.id}`}>
          詳細・調整
        </Link>
      </div>
    </div>
  );
}

export function BattlefieldsPage() {
  const nav = useNavigate();
  const [list, setList] = useState<BattlefieldPresetPublic[]>([]);
  const [q, setQ] = useLocalDraft("battlefields:search", "");
  const [createDraft, setCreateDraft, clearCreate] = useLocalDraft<CreateDraft>(
    "battlefields:create",
    DEFAULT_CREATE,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [readyAttemptId, setReadyAttemptId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resumeInFlight, setResumeInFlight] = useState(false);
  const [trackedAttemptId, setTrackedAttemptId] = useState<string | null>(null);

  const prompt = createDraft.prompt;
  const category = createDraft.category;
  const progress = useAuthoringProgressPoll({
    enabled: busy || resumeInFlight,
    poll: () => pollLatestAuthoring(api.latestBattlefieldDraft, {
      trackedAttemptId,
      onReady: (attemptId) => nav(`/reviews/battlefields/${attemptId}`),
      setResumeInFlight,
      setError,
    }),
  });

  async function reload(query?: string) {
    const { battlefields } = await api.listBattlefields(query);
    setList(battlefields);
  }

  useEffect(() => {
    void Promise.all([
      reload(q || undefined),
      api.latestBattlefieldDraft().then((result) => {
        if (result.failed) {
          setError(result.failed.errorCode ?? "生成に失敗しました");
          return;
        }
        if (result.draft) {
          setReadyAttemptId(result.draft.id);
          return;
        }
        if (result.progress) {
          setTrackedAttemptId(result.progress.attemptId ?? null);
          setResumeInFlight(true);
        }
      }),
    ]).catch((e) => setError(String(e)));
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
      if (res.draft) {
        nav(`/reviews/battlefields/${res.draft.id}`);
      } else {
        setTrackedAttemptId(res.attemptId ?? null);
        setResumeInFlight(true);
        setMessage("受け付けました。準備できたら確認できます。");
      }
      clearCreate();
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

      {readyAttemptId ? (
        <div className="panel">
          <h2>確認待ちの案があります</h2>
          <Link className="btn primary" to={`/reviews/battlefields/${readyAttemptId}`}>
            確認画面を開く
          </Link>
        </div>
      ) : null}

      <div className="panel">
        <h2>自然文からプリセット生成</h2>
        <p className="muted">
          森・闘技場・海などの構造化プリセットを作成します。確定した地形・障害・状況を対戦開始時にそのまま固定します。
        </p>
        <BattlefieldGenerateForm
          category={category}
          prompt={prompt}
          setCreateDraft={setCreateDraft}
          busy={busy || resumeInFlight}
          onGenerate={(event) => void onGenerate(event)}
        />
        <AuthoringProgressNotice
          active={busy || resumeInFlight}
          progress={progress}
          fallbackLabel="戦場を生成中…"
        />
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
          {list.map((field) => <BattlefieldCard key={field.id} field={field} />)}
          {list.length === 0 && <p className="muted">プリセットがありません。</p>}
        </div>
      </div>
    </>
  );
}
