import { useEffect, useRef } from "react";

/**
 * Run `callback` immediately, then on an interval — but only while the tab is
 * actually visible.
 *
 * Every polling screen here previously kept firing on a background tab, so a
 * user who left five dashboards open in other tabs generated the same API load
 * as five active users. Since staff routinely leave these screens open all day,
 * background tabs were a large share of total request volume.
 *
 * Polling now suspends on `visibilitychange` and fires once immediately when
 * the tab comes back, so a returning tab is up to date straight away without
 * having cost anything while hidden.
 *
 * `callback` is read through a ref, so an inline arrow function does not
 * restart the timer on every render. Pass anything the timer *should* restart
 * on (e.g. a `useCallback` fetcher bound to the active filters) in `deps`.
 */
export default function usePolling(callback, intervalMs, deps = []) {
  const savedCallback = useRef(callback);

  // Written in an effect rather than during render — a ref must not be mutated
  // while rendering.
  useEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    let timer = null;
    const run = () => savedCallback.current();

    const start = () => {
      if (timer === null) timer = setInterval(run, intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        run();
        start();
      }
    };

    run();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}
