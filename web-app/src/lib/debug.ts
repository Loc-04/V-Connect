import { useEffect, useRef } from 'react';

export function useRenderDebug(name: string, enabled = false) {
  const renderCountRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    renderCountRef.current += 1;
    console.debug(`[render-debug] ${name} rendered ${renderCountRef.current} times`);
  });
}
