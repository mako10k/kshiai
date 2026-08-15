import { Link } from "react-router-dom";
import type { CharacterPublic, CharacterReviewState } from "@kshiai/shared";

function reviewMarkLabel(state: CharacterReviewState): string {
  if (state === "awaiting_acceptance") return "承認待ち";
  if (state === "generating") return "生成中";
  if (state === "queued") return "待機中";
  return "失敗";
}

export function AssetReviewMark(props: {
  reviewState?: CharacterReviewState | null;
  href: string;
}) {
  if (!props.reviewState) return null;
  return (
    <Link className={`review-mark is-${props.reviewState}`} to={props.href}>
      {reviewMarkLabel(props.reviewState)}
    </Link>
  );
}

export function CharacterReviewMark(props: { character: CharacterPublic }) {
  const href = props.character.reviewAttemptId
    ? `/reviews/${props.character.reviewAttemptId}`
    : `/characters/${props.character.id}`;
  return (
    <AssetReviewMark reviewState={props.character.reviewState} href={href} />
  );
}
