import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data with loading / error state and a reload() function.
 * Stale responses (from an earlier request) are ignored, so fast filter
 * changes never show results for the wrong filter.
 */
export function useResource(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loader();
      if (id === reqId.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (id === reqId.current) setState((s) => ({ ...s, error, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  const setData = useCallback(
    (fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })),
    [],
  );
  return { ...state, reload: load, setData };
}
