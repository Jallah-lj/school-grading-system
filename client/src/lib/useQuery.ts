import { useCallback, useEffect, useRef, useState } from 'react';
import { apiError } from './api';

interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/** Minimal data-fetching hook: runs `fetcher` whenever `deps` change. */
export function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fetcher);
  fnRef.current = fetcher;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fnRef.current());
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void run(); }, [run, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading, error, refetch: run };
}
