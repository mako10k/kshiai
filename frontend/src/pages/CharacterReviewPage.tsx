import { useNavigate } from "react-router-dom";
import type { CharacterAuthoringReview, CharacterPublic } from "@kshiai/shared";
import { api } from "../api";
import { getCharacterReview } from "../authoring-api";
import { useAssetReview } from "../hooks/useAssetReview";
import {
  AssetReviewShell,
  ReviewCandidatePanel,
  ReviewField,
  reviewLoading,
  runReviewAction,
} from "./asset-review-shared";

function backPath(review: CharacterAuthoringReview): string {
  return review.kind === "create"
    ? "/characters/new"
    : `/characters/${review.characterId}`;
}

function skillText(character: CharacterPublic): string {
  return character.skillSummaries
    .map((skill) => `${skill.name} — ${skill.description}`)
    .join("\n");
}

function CharacterReviewContent(props: { candidate: CharacterPublic; current: CharacterPublic | null }) {
  if (!props.current) {
    const character = props.candidate;
    return (
      <div className="card review-summary">
        <strong>{character.displayName}</strong>
        <p>{character.narrativeBlurb}</p>
        <p className="muted">{character.appearance.summary}</p>
        <p>
          <strong>{character.basicAttackName}</strong> — {character.basicAttackDescription}
        </p>
        {character.skillSummaries.map((skill) => (
          <p key={skill.name} className="review-skill">
            <strong>{skill.name}</strong> — {skill.description}
          </p>
        ))}
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
      <ReviewField
        label="基本行動"
        current={`${props.current.basicAttackName} — ${props.current.basicAttackDescription}`}
        next={`${props.candidate.basicAttackName} — ${props.candidate.basicAttackDescription}`}
      />
      <ReviewField label="スキル" current={skillText(props.current)} next={skillText(props.candidate)} />
    </div>
  );
}

export function CharacterReviewPage() {
  const nav = useNavigate();
  const {
    review, error, busy, draftMessage, setDraftMessage, setBusy, setError, setReview,
  } = useAssetReview(getCharacterReview);

  const loading = reviewLoading(review, error);
  if (loading || !review) return loading;

  return (
    <AssetReviewShell
      kind={review.kind}
      backHref={backPath(review)}
      latestHref={`/reviews/${review.latestAttemptId}`}
      retryLabel={review.kind === "create" ? "もう一度生成する" : "キャラ画面でやり直す"}
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
            placeholder: "例: もっと防御寄りに。髪色を暗い赤に。",
            busy,
            onChange: setDraftMessage,
            onSubmit: (event) => {
              event.preventDefault();
              if (!draftMessage.trim()) return;
              runReviewAction(setBusy, setError, async () => {
                await api.chatCharacterDraft(review.attemptId, draftMessage.trim());
                setDraftMessage("");
                setReview(await getCharacterReview(review.attemptId));
              }, "failed");
            },
          } : undefined}
          onConfirm={() => runReviewAction(setBusy, setError, async () => {
            const res = await api.confirmCharacterDraft(review.attemptId);
            nav(`/characters/${res.character.id}`);
          }, "確定に失敗しました")}
          onDiscard={() => runReviewAction(setBusy, setError, async () => {
            await api.discardCharacterDraft(review.attemptId);
            nav(backPath(review));
          }, "破棄に失敗しました")}
        >
          <CharacterReviewContent current={review.current} candidate={review.candidate} />
        </ReviewCandidatePanel>
      ) : null}
    </AssetReviewShell>
  );
}
