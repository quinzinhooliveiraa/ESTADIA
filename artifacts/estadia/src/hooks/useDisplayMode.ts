import { useState, useEffect } from 'react';

export type DisplayMode = 'standalone' | 'browser';

function readMode(): DisplayMode {
  if (typeof window === 'undefined') return 'browser';
  const standaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
  // navigator.standalone is set by iOS Safari when running as a home-screen app
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneMedia || iosStandalone ? 'standalone' : 'browser';
}

/**
 * Detects whether the app is running as an installed PWA (standalone) or
 * in a regular browser tab.
 *
 * @returns 'standalone' | 'browser'
 */
export function useDisplayMode(): DisplayMode {
  const [mode, setMode] = useState<DisplayMode>(readMode);

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const handler = () => setMode(readMode());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return mode;
}
