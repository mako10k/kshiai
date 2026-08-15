import { useEffect, useRef, useState } from "react";
import type { AssetAuthoringProgress, CharacterPublic } from "@kshiai/shared";
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
} {
  const [authoringProgress, setAuthoringProgress] =
    useState<AssetAuthoringProgress | null>(null);
  const [pendingDraft, setPendingDraft] = useState<PendingCharacterDraft | null>(
    null,
  );
  const shouldPollRef = useRef(false);
  shouldPollRef.current = input.busy || Boolean(authoringProgress);
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
          })),
        ]);
        if (cancelled) return;
        onCharacterRef.current(next);
        setAuthoringProgress(next.authoringProgress ?? null);
        if (latest.draft && latest.draft.character.id === input.id) {
          const draft = latest.draft;
          setPendingDraft({
            id: draft.id,
            character: draft.character,
            assistantMessage: draft.assistantMessage,
          });
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
  };
}
