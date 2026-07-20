import { useState, useEffect } from 'react';

// BeforeInstallPromptEvent is not yet in the standard lib typings
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

// Capture the event as early as possible at module import time so we
// don't miss it if the component mounts after the event has fired.
let _captured: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _captured = e as BeforeInstallPromptEvent;
  });
}

/**
 * Returns the captured BeforeInstallPromptEvent (Android/Chrome).
 * null means the browser does not support the install prompt (e.g. iOS Safari).
 */
export function useBeforeInstallPrompt(): BeforeInstallPromptEvent | null {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(_captured);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      _captured = e as BeforeInstallPromptEvent;
      setPrompt(_captured);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  return prompt;
}
