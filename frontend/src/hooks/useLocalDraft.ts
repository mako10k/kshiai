import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

const PREFIX = "kshiai:draft:";

function storageKey(key: string): string {
  return key.startsWith(PREFIX) ? key : `${PREFIX}${key}`;
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (raw == null || raw === "") return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    // quota exceeded / private mode — ignore
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(storageKey(key));
  } catch {
    // ignore
  }
}

/**
 * Persist a form draft in localStorage and restore it on remount / reload.
 * Debounces writes so typing stays smooth.
 *
 * @returns [value, setValue, clearDraft]
 */
export function useLocalDraft<T>(
  key: string,
  fallback: T,
  options?: { debounceMs?: number },
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const debounceMs = options?.debounceMs ?? 200;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  const [value, setValue] = useState<T>(() => readStorage(key, fallback));
  const latestRef = useRef(value);
  latestRef.current = value;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-hydrate if the storage key changes (e.g. detail page id switch)
  useEffect(() => {
    setValue(readStorage(key, fallbackRef.current));
  }, [key]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      writeStorage(key, latestRef.current);
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key, value, debounceMs]);

  // Flush pending write on unmount so a quick navigate doesn't lose the last keystroke
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      writeStorage(key, latestRef.current);
    };
  }, [key]);

  const clearDraft = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Keep ref in sync so unmount flush (e.g. after navigate) does not restore the old draft
    latestRef.current = fallbackRef.current;
    removeStorage(key);
    setValue(fallbackRef.current);
  }, [key]);

  return [value, setValue, clearDraft];
}
