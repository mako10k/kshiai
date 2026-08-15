import { useState } from "react";
import { useParams } from "react-router-dom";
import type { AssetAuthoringProgress } from "@kshiai/shared";
import { useAuthoringProgressPoll } from "./useAuthoringProgressPoll";
import { reviewNeedsPoll } from "../pages/asset-review-shared";

export function useAssetReview<T extends {
  progress: AssetAuthoringProgress | null;
  canAccept: boolean;
  failed: unknown;
}>(load: (id: string) => Promise<T>) {
  const { attemptId } = useParams();
  const [review, setReview] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");

  useAuthoringProgressPoll({
    enabled: Boolean(attemptId) && reviewNeedsPoll(review),
    poll: async () => {
      if (!attemptId) return null;
      try {
        const next = await load(attemptId);
        setReview(next);
        setError(null);
        return next.progress;
      } catch (err) {
        setError(err instanceof Error ? err.message : "failed");
        throw err;
      }
    },
  });

  return {
    attemptId,
    review,
    error,
    busy,
    draftMessage,
    setDraftMessage,
    setBusy,
    setError,
    setReview,
  };
}
