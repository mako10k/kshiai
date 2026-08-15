import { useEffect, useRef, useState } from "react";
import type { AssetAuthoringProgress } from "@kshiai/shared";

export function useAuthoringProgressPoll(input: {
  enabled: boolean;
  poll: () => Promise<AssetAuthoringProgress | null>;
  intervalMs?: number;
}): AssetAuthoringProgress | null {
  const [progress, setProgress] = useState<AssetAuthoringProgress | null>(null);
  const pollRef = useRef(input.poll);
  pollRef.current = input.poll;

  useEffect(() => {
    if (!input.enabled) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await pollRef.current();
        if (!cancelled) setProgress(next);
      } catch {
        /* keep the last known step */
      }
    };
    void tick();
    const timer = window.setInterval(tick, input.intervalMs ?? 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [input.enabled, input.intervalMs]);

  return progress;
}
