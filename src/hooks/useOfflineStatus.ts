import { useEffect, useState } from 'react';

/** `dev`: the dev server, which never registers the service worker, so there is nothing to report. */
export type OfflineInstallStatus = 'checking' | 'ready' | 'missing' | 'needs-https' | 'dev';

export function isStandaloneApp(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator &&
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

/**
 * Tracks whether the service worker controls the page, so the app works offline.
 * `readyNotice` turns on once caching finishes inside the installed app.
 */
function initialStatus(): OfflineInstallStatus {
  if (import.meta.env.DEV) {
    return 'dev';
  }

  if (!window.isSecureContext) {
    return 'needs-https';
  }

  return 'serviceWorker' in navigator ? 'checking' : 'missing';
}

export function useOfflineStatus() {
  const [status, setStatus] = useState<OfflineInstallStatus>(initialStatus);
  const [readyNotice, setReadyNotice] = useState(false);

  useEffect(() => {
    if (initialStatus() !== 'checking') {
      return;
    }

    let active = true;

    const markReady = () => {
      if (active) {
        setStatus('ready');
      }
    };

    const checkController = () => {
      if (navigator.serviceWorker.controller) {
        markReady();
      }
    };

    checkController();

    navigator.serviceWorker.ready.then(checkController).catch(() => {
      if (active) {
        setStatus('missing');
      }
    });

    const missingTimer = window.setTimeout(() => {
      if (active && !navigator.serviceWorker.controller) {
        setStatus('missing');
      }
    }, 8000);

    const onOfflineReady = () => {
      markReady();
      if (isStandaloneApp()) {
        setReadyNotice(true);
      }
    };

    window.addEventListener('mock-exam:offline-ready', onOfflineReady);
    navigator.serviceWorker.addEventListener('controllerchange', checkController);

    return () => {
      active = false;
      window.clearTimeout(missingTimer);
      window.removeEventListener('mock-exam:offline-ready', onOfflineReady);
      navigator.serviceWorker.removeEventListener('controllerchange', checkController);
    };
  }, []);

  return {
    status,
    readyNotice,
    dismissReadyNotice: () => setReadyNotice(false),
  };
}
