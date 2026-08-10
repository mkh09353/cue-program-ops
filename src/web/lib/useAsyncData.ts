import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared loader for organizer pages.
 *
 * Organizer screens intermittently sat on a spinner forever when a request never
 * settled (isolate cold start, dropped fetch). This hook never leaves the UI in an
 * unexplained "Loading…" state: after `timeoutMs` it flips to a `timedOut` state so
 * the page can show an error notice plus a retry button.
 */
export const LOAD_TIMEOUT_MS = 6000;

export type AsyncState<T> = {
  data: T | null;
  error: string;
  loading: boolean;
  timedOut: boolean;
  reload: () => void;
  attempts: number;
};

export function useAsyncData<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
  options: { timeoutMs?: number } = {},
): AsyncState<T> {
  const timeoutMs = options.timeoutMs ?? LOAD_TIMEOUT_MS;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const runIdRef = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(() => {
    const runId = ++runIdRef.current;
    setLoading(true);
    setTimedOut(false);
    setError("");
    setAttempts((n) => n + 1);
    const timer = setTimeout(() => {
      if (runIdRef.current === runId) {
        setTimedOut(true);
        setLoading(false);
      }
    }, timeoutMs);
    loadRef
      .current()
      .then((result) => {
        if (runIdRef.current !== runId) return;
        clearTimeout(timer);
        setData(result);
        setLoading(false);
        setTimedOut(false);
      })
      .catch((e: any) => {
        if (runIdRef.current !== runId) return;
        clearTimeout(timer);
        setError(e?.message || "Request failed");
        setLoading(false);
      });
    return () => clearTimeout(timer);
  }, [timeoutMs]);

  useEffect(() => {
    const cancel = run();
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, timedOut, reload: run, attempts };
}

/** Message shown when a load exceeds the timeout (kept in one place for tests). */
export const LOAD_TIMEOUT_MESSAGE =
  "This is taking longer than expected. The server may be waking up or the request was dropped.";
