import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

// Loads data from the API. Pass `pollMs` to refresh in the background (live status).
export function useApi(url, { pollMs, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!!url && enabled);
  const urlRef = useRef(url);
  urlRef.current = url;

  const load = useCallback(
    async (silent = false) => {
      if (!url || !enabled) return;
      if (!silent) setLoading(true);
      try {
        const d = await api.get(url);
        if (urlRef.current === url) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (urlRef.current === url) setError(e);
      } finally {
        if (urlRef.current === url) setLoading(false);
      }
    },
    [url, enabled],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!pollMs) return undefined;
    const t = setInterval(() => document.visibilityState === 'visible' && load(true), pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  return { data, error, loading, reload: load, setData };
}
