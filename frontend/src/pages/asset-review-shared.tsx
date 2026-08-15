import type { FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AssetAuthoringProgress } from "@kshiai/shared";
import { AuthoringProgressNotice } from "../components/AuthoringProgressNotice";
import type { LatestAuthoringResponse } from "../api";

export function reviewTitle(kind: "create" | "revision" | "upgrade"): string {
  if (kind === "upgrade") return "最新版への更新案";
  if (kind === "revision") return "変更案";
  return "生成内容の確認";
}

export function reviewLoading(
  review: unknown,
  error: string | null,
): ReactNode {
  if (!review && !error) return <p className="muted">読み込み中…</p>;
  if (!review) return <p className="error">{error}</p>;
  return null;
}

export function reviewNeedsPoll(review: {
  progress: unknown;
  canAccept: boolean;
  failed: unknown;
} | null): boolean {
  if (!review) return true;
  return Boolean(review.progress) && !review.canAccept && !review.failed;
}

export function ReviewField(props: { label: string; current: string; next: string }) {
  const changed = props.current !== props.next;
  return (
    <section className={`review-field${changed ? " is-changed" : ""}`}>
      <h3>{props.label}</h3>
      <div className="review-compare">
        <div>
          <p className="muted review-compare-label">現在</p>
          <p>{props.current || "（なし）"}</p>
        </div>
        <div>
          <p className="muted review-compare-label">更新案</p>
          <p>{props.next || "（なし）"}</p>
        </div>
      </div>
    </section>
  );
}

export function ReviewStatus(props: {
  progress: AssetAuthoringProgress | null;
  stale: boolean;
  latestHref: string | null;
  failed: { errorCode: string | null } | null;
  error: string | null;
}) {
  return (
    <>
      {props.progress && !props.failed ? (
        <AuthoringProgressNotice
          active
          progress={props.progress}
          fallbackLabel="準備しています…"
        />
      ) : null}
      {props.stale && props.latestHref ? (
        <p className="error">
          この案より新しい更新があります。
          <Link to={props.latestHref}>最新の案を開く</Link>
        </p>
      ) : null}
      {props.failed ? (
        <p className="error">{props.failed.errorCode ?? "生成に失敗しました"}</p>
      ) : null}
      {props.error ? <p className="error">{props.error}</p> : null}
    </>
  );
}

export function ReviewNextAction(props: {
  canAccept: boolean;
  failed: unknown;
  status: string;
  backHref: string;
  retryLabel: string;
}) {
  if (props.canAccept || (!props.failed && props.status !== "expired")) {
    return null;
  }
  return (
    <p>
      <Link className="btn primary" to={props.backHref}>
        {props.retryLabel}
      </Link>
    </p>
  );
}

export function runReviewAction(
  setBusy: (value: boolean) => void,
  setError: (value: string | null) => void,
  work: () => Promise<void>,
  failMessage: string,
): void {
  setBusy(true);
  setError(null);
  void work()
    .catch((err) => setError(err instanceof Error ? err.message : failMessage))
    .finally(() => setBusy(false));
}

export function ReviewCandidatePanel(props: {
  assistantMessage: string;
  chat?: {
    value: string;
    placeholder: string;
    busy: boolean;
    onChange: (value: string) => void;
    onSubmit: (event: FormEvent) => void;
  };
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
  children: ReactNode;
}) {
  return (
    <>
      {props.children}
      {props.assistantMessage ? <p className="muted">{props.assistantMessage}</p> : null}
      {props.chat ? <ReviewChatForm {...props.chat} /> : null}
      <ReviewActions
        confirmLabel={props.confirmLabel}
        busy={props.busy}
        onConfirm={props.onConfirm}
        onDiscard={props.onDiscard}
      />
    </>
  );
}

export function ReviewActions(props: {
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="row" style={{ marginTop: "0.75rem" }}>
      <button className="btn primary" type="button" disabled={props.busy} onClick={props.onConfirm}>
        {props.confirmLabel}
      </button>
      <button className="btn ghost danger" type="button" disabled={props.busy} onClick={props.onDiscard}>
        破棄
      </button>
    </div>
  );
}

export function ReviewChatForm(props: {
  value: string;
  placeholder: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className="grid" onSubmit={props.onSubmit}>
      <textarea
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        rows={3}
      />
      <button className="btn" type="submit" disabled={props.busy || !props.value.trim()}>
        会話で調整
      </button>
    </form>
  );
}

export function AssetReviewShell(props: {
  kind: "create" | "revision" | "upgrade";
  backHref: string;
  latestHref: string;
  retryLabel: string;
  progress: AssetAuthoringProgress | null;
  stale: boolean;
  failed: { errorCode: string | null } | null;
  canAccept: boolean;
  status: string;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{reviewTitle(props.kind)}</h1>
        <Link to={props.backHref}>← 戻る</Link>
      </div>
      <ReviewStatus
        progress={props.progress}
        stale={props.stale}
        latestHref={props.latestHref}
        failed={props.failed}
        error={props.error}
      />
      <ReviewNextAction
        canAccept={props.canAccept}
        failed={props.failed}
        status={props.status}
        backHref={props.backHref}
        retryLabel={props.retryLabel}
      />
      {props.children}
    </>
  );
}

export async function pollLatestAuthoring<TDraft extends { id: string }>(
  latest: () => Promise<LatestAuthoringResponse<TDraft>>,
  handlers: {
    trackedAttemptId: string | null;
    onReady: (attemptId: string) => void;
    setResumeInFlight: (value: boolean) => void;
    setError: (value: string | null) => void;
  },
): Promise<AssetAuthoringProgress | null> {
  const result = await latest();
  const tracked = handlers.trackedAttemptId;
  if (result.failed && (!tracked || result.failed.attemptId === tracked)) {
    handlers.setResumeInFlight(false);
    handlers.setError(result.failed.errorCode ?? "生成に失敗しました");
    return null;
  }
  if (result.draft && (!tracked || result.draft.id === tracked)) {
    handlers.setResumeInFlight(false);
    handlers.setError(null);
    handlers.onReady(result.draft.id);
  }
  return result.progress;
}
