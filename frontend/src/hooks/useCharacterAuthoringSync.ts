import { useEffect, useRef, useState } from "react";
import type {
  AssetAuthoringFailure,
  AssetAuthoringProgress,
  CharacterPublic,
} from "@kshiai/shared";
import { api } from "../api";

export type PendingCharacterDraft = {
  id: string;
  character: CharacterPublic;
  assistantMessage: string;
};

export function useCharacterAuthoringSync(input: {
  id: string | undefined;
  isOwner: boolean;
  busy: boolean;
  onCharacter: (character: CharacterPublic) => void;
}): {
  authoringProgress: AssetAuthoringProgress | null;
  setAuthoringProgress: (progress: AssetAuthoringProgress | null) => void;
  pendingDraft: PendingCharacterDraft | null;
  setPendingDraft: (draft: PendingCharacterDraft | null) => void;
  failure: AssetAuthoringFailure | null;
} {
  const [authoringProgress, setAuthoringProgress] =
    useState<AssetAuthoringProgress | null>(null);
  const [pendingDraft, setPendingDraft] = useState<PendingCharacterDraft | null>(
    null,
  );
  const [failure, setFailure] = useState<AssetAuthoringFailure | null>(null);
  const persistPollRef = useRef(false);
  if (input.busy) persistPollRef.current = true;
  const shouldPollRef = useRef(false);
  shouldPollRef.current =
    input.busy || Boolean(authoringProgress) || persistPollRef.current;
  const onCharacterRef = useRef(input.onCharacter);
  onCharacterRef.current = input.onCharacter;

  useEffect(() => {
    if (!input.id || !input.isOwner) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const [{ character: next }, latest] = await Promise.all([
          api.getCharacter(input.id!),
          api.latestCharacterDraft().catch(() => ({
            draft: null,
            progress: null,
            failed: null,
          })),
        ]);
        if (cancelled) return;
        onCharacterRef.current(next);
        if (latest.failed?.characterId === input.id) {
          persistPollRef.current = false;
          setAuthoringProgress(null);
          setPendingDraft(null);
          setFailure(latest.failed);
          return;
        }
        const draft = latest.draft;
        if (draft && draft.character.id === input.id) {
          persistPollRef.current = false;
          setFailure(null);
          setAuthoringProgress(null);
          setPendingDraft({
            id: draft.id,
            character: draft.character,
            assistantMessage: draft.assistantMessage,
          });
          return;
        }
        setAuthoringProgress(next.authoringProgress ?? null);
        if (next.authoringProgress) {
          setFailure(null);
          setPendingDraft(null);
        } else if (!input.busy && !latest.progress) {
          persistPollRef.current = false;
        }
      } catch {
        /* keep the last known step */
      }
    };
    void tick();
    const timer = window.setInterval(() => {
      if (shouldPollRef.current) void tick();
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [input.id, input.isOwner]);

  return {
    authoringProgress,
    setAuthoringProgress,
    pendingDraft,
    setPendingDraft,
    failure,
  };
}
