import { useNavigate } from "react-router-dom";
import {
  perspectiveLabel,
  type NarrationStyleAuthoringReview,
  type NarrationStylePublic,
} from "@kshiai/shared";
import { api } from "../api";
import { getNarrationStyleReview } from "../authoring-api";
import { useAssetReview } from "../hooks/useAssetReview";
import {
  AssetReviewShell,
  ReviewCandidatePanel,
  ReviewField,
  reviewLoading,
  runReviewAction,
} from "./asset-review-shared";

function definitionText(review: NarrationStyleAuthoringReview): string {
  const definition = review.definition as {
    voice?: { register?: string; subjectivity?: string };
    cadence?: { sentenceLength?: string; lineBudget?: number };
    phases?: Record<string, { emphasis?: string }>;
  } | null;
  if (!definition) return "";
  const parts = [
    definition.voice
      ? `声: ${definition.voice.register ?? "—"}/${definition.voice.subjectivity ?? "—"}`
      : "",
    definition.cadence
      ? `文長: ${definition.cadence.sentenceLength ?? "—"} · 最大 ${definition.cadence.lineBudget ?? "—"} 行`
      : "",
    definition.phases
      ? `フェーズ: ${Object.entries(definition.phases)
        .map(([phase, policy]) => `${phase}:${policy.emphasis ?? "—"}`)
        .join(" / ")}`
      : "",
  ];
  return parts.filter(Boolean).join("\n");
}

function NarrationReviewContent(props: {
  review: NarrationStyleAuthoringReview;
  candidate: NarrationStylePublic;
}) {
  if (!props.review.current) {
    return (
      <div className="card review-summary">
        <strong>{props.candidate.displayName}</strong>
        <p>{props.candidate.description}</p>
        <p className="muted">{perspectiveLabel(props.candidate.perspective)}</p>
        {definitionText(props.review) ? (
          <p className="muted">{definitionText(props.review)}</p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="review-compare-stack">
      <ReviewField
        label="名前"
        current={props.review.current.displayName}
        next={props.candidate.displayName}
      />
      <ReviewField
        label="説明"
        current={props.review.current.description}
        next={props.candidate.description}
      />
      <ReviewField
        label="視点"
        current={perspectiveLabel(props.review.current.perspective)}
        next={perspectiveLabel(props.candidate.perspective)}
      />
    </div>
  );
}

export function NarrationStyleReviewPage() {
  const nav = useNavigate();
  const { review, error, busy, setBusy, setError } = useAssetReview(getNarrationStyleReview);

  const loading = reviewLoading(review, error);
  if (loading || !review) return loading;

  return (
    <AssetReviewShell
      kind={review.kind}
      backHref="/narration-styles"
      latestHref={`/reviews/narration-styles/${review.latestAttemptId}`}
      retryLabel="語り口画面でやり直す"
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
          onConfirm={() => runReviewAction(setBusy, setError, async () => {
            await api.confirmNarrationStyleDraft(review.attemptId);
            nav("/narration-styles");
          }, "確定に失敗しました")}
          onDiscard={() => runReviewAction(setBusy, setError, async () => {
            await api.discardNarrationStyleDraft(review.attemptId);
            nav("/narration-styles");
          }, "破棄に失敗しました")}
        >
          <NarrationReviewContent review={review} candidate={review.candidate} />
        </ReviewCandidatePanel>
      ) : null}
    </AssetReviewShell>
  );
}
