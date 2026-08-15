import { useNavigate } from "react-router-dom";
import type { BattlefieldAuthoringReview, BattlefieldPresetPublic } from "@kshiai/shared";
import { api } from "../api";
import { getBattlefieldReview } from "../authoring-api";
import { useAssetReview } from "../hooks/useAssetReview";
import {
  AssetReviewShell,
  ReviewCandidatePanel,
  ReviewField,
  reviewLoading,
  runReviewAction,
} from "./asset-review-shared";

function backPath(review: BattlefieldAuthoringReview): string {
  return review.kind === "create" ? "/battlefields" : `/battlefields/${review.assetId}`;
}

function hintText(field: BattlefieldPresetPublic): string {
  return [
    `地形: ${field.terrainHints.join(" / ") || "—"}`,
    `障害物: ${field.obstacleHints.join(" / ") || "—"}`,
    `状況: ${field.conditionHints.join(" / ") || "—"}`,
  ].join("\n");
}

function BattlefieldReviewContent(props: {
  candidate: BattlefieldPresetPublic;
  current: BattlefieldPresetPublic | null;
}) {
  if (!props.current) {
    return (
      <div className="card review-summary">
        <strong>{props.candidate.displayName}</strong>
        <p>{props.candidate.narrativeBlurb}</p>
        <p className="muted">{props.candidate.appearance.summary}</p>
        <p className="muted">{hintText(props.candidate)}</p>
      </div>
    );
  }
  return (
    <div className="review-compare-stack">
      <ReviewField label="名前" current={props.current.displayName} next={props.candidate.displayName} />
      <ReviewField label="紹介" current={props.current.narrativeBlurb} next={props.candidate.narrativeBlurb} />
      <ReviewField
        label="外見"
        current={props.current.appearance.summary}
        next={props.candidate.appearance.summary}
      />
      <ReviewField label="地形・障害・状況" current={hintText(props.current)} next={hintText(props.candidate)} />
    </div>
  );
}

export function BattlefieldReviewPage() {
  const nav = useNavigate();
  const {
    review, error, busy, draftMessage, setDraftMessage, setBusy, setError, setReview,
  } = useAssetReview(getBattlefieldReview);

  const loading = reviewLoading(review, error);
  if (loading || !review) return loading;

  return (
    <AssetReviewShell
      kind={review.kind}
      backHref={backPath(review)}
      latestHref={`/reviews/battlefields/${review.latestAttemptId}`}
      retryLabel={review.kind === "create" ? "もう一度生成する" : "戦場画面でやり直す"}
      progress={review.progress}
      stale={review.stale}
      failed={review.failed}
      canAccept={review.canAccept}
      status={review.status}
      error={error}
    >
      {review.canAccept && review.candidate ? (
        <ReviewCandidatePanel
          assistantMessage={review.assistantMessage}
          confirmLabel={review.kind === "create" ? "確定して保存" : "この内容で確定"}
          busy={busy}
          chat={review.kind === "create" ? {
            value: draftMessage,
            placeholder: "例: 霧を濃くして、障害物を増やして",
            busy,
            onChange: setDraftMessage,
            onSubmit: (event) => {
              event.preventDefault();
              if (!draftMessage.trim()) return;
              runReviewAction(setBusy, setError, async () => {
                await api.chatBattlefieldDraft(review.attemptId, draftMessage.trim());
                setDraftMessage("");
                setReview(await getBattlefieldReview(review.attemptId));
              }, "failed");
            },
          } : undefined}
          onConfirm={() => runReviewAction(setBusy, setError, async () => {
            const res = await api.confirmBattlefieldDraft(review.attemptId);
            nav(`/battlefields/${res.battlefield.id}`);
          }, "確定に失敗しました")}
          onDiscard={() => runReviewAction(setBusy, setError, async () => {
            await api.discardBattlefieldDraft(review.attemptId);
            nav(backPath(review));
          }, "破棄に失敗しました")}
        >
          <BattlefieldReviewContent current={review.current} candidate={review.candidate} />
        </ReviewCandidatePanel>
      ) : null}
    </AssetReviewShell>
  );
}
