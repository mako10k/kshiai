import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { AuthoringProgressNotice } from "../components/AuthoringProgressNotice";
import { useAuthoringProgressPoll } from "../hooks/useAuthoringProgressPoll";
import { useLocalDraft } from "../hooks/useLocalDraft";
import { pollLatestAuthoring } from "./asset-review-shared";

const PROMPT_PLACEHOLDER =
  "名前はカエデ。紅葉色の髪の弓使い。森の案内人として旅人と獣の間を取り持つ。";



export function CharacterCreatePage() {
  const nav = useNavigate();
  const [prompt, setPrompt, clearPrompt] = useLocalDraft("characters:create", "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resumeInFlight, setResumeInFlight] = useState(false);
  const [trackedAttemptId, setTrackedAttemptId] = useState<string | null>(null);
  const progress = useAuthoringProgressPoll({
    enabled: busy || resumeInFlight,
    poll: () => pollLatestAuthoring(api.latestCharacterDraft, {
      trackedAttemptId,
      onReady: (attemptId) => nav(`/reviews/${attemptId}`),
      setResumeInFlight,
      setError,
    }),
  });

  useEffect(() => {
    void api.latestCharacterDraft()
      .then((result) => {
        if (result.failed) {
          setError(result.failed.errorCode ?? "生成に失敗しました");
          return;
        }
        if (result.draft) {
          nav(`/reviews/${result.draft.id}`);
          return;
        }
        if (result.progress) {
          setTrackedAttemptId(result.progress.attemptId ?? null);
          setResumeInFlight(true);
        }
      })
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
      if (res.draft) {
        nav(`/reviews/${res.draft.id}`);
      } else {
        setTrackedAttemptId(res.attemptId ?? null);
        setResumeInFlight(true);
        setMessage("受け付けました。準備できたら確認できます。");
      }
      clearPrompt();
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
          <button className="btn primary" type="submit" disabled={busy || resumeInFlight}>
            {busy || resumeInFlight ? "生成中…" : "生成する"}
          </button>
        </form>
        <AuthoringProgressNotice
          active={busy || resumeInFlight}
          progress={progress}
          fallbackLabel="キャラクターを生成中…"
        />
        {message && <p className="ok">{message}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
