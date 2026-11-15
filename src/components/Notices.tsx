import { isStandaloneApp, type OfflineInstallStatus } from '../hooks/useOfflineStatus';

export function StorageErrorNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="panel notice-panel notice-panel-warning" role="alert">
      <div>
        <h2>Could not save on this device</h2>
        <p>
          The browser refused to store your latest changes (storage may be full or disabled,
          for example in private browsing). Export your question bank to keep a copy, and
          clear old attempt history to free space.
        </p>
      </div>
      <button className="ghost-button" onClick={onDismiss}>
        Dismiss
      </button>
    </section>
  );
}

type BundledUpdateNoticeProps = {
  bundledCount: number;
  localCount: number;
  onExport: () => void;
  onUseBundled: () => void;
  onKeepLocal: () => void;
};

export function BundledUpdateNotice({
  bundledCount,
  localCount,
  onExport,
  onUseBundled,
  onKeepLocal,
}: BundledUpdateNoticeProps) {
  return (
    <section className="panel notice-panel notice-panel-info">
      <div>
        <h2>New questions.json available</h2>
        <p>
          This app version ships a different question bank ({bundledCount} questions) than the
          one you edited on this device ({localCount} questions). Switching replaces your local
          edits, so export them first if you want to keep them.
        </p>
      </div>
      <div className="notice-actions">
        <button className="secondary-button" onClick={onExport}>
          Export mine
        </button>
        <button
          className="primary-button"
          onClick={() => {
            if (window.confirm('Replace your edited question bank with the new questions.json?')) {
              onUseBundled();
            }
          }}
        >
          Use new questions
        </button>
        <button className="ghost-button" onClick={onKeepLocal}>
          Keep mine
        </button>
      </div>
    </section>
  );
}

type OfflineNoticesProps = {
  status: OfflineInstallStatus;
  readyNotice: boolean;
  onDismissReady: () => void;
};

export function OfflineNotices({ status, readyNotice, onDismissReady }: OfflineNoticesProps) {
  const standalone = isStandaloneApp();

  return (
    <>
      {(status === 'needs-https' || (standalone && status === 'missing')) && (
        <section className="panel notice-panel notice-panel-warning">
          <h2>Offline install not finished</h2>
          {status === 'needs-https' ? (
            <>
              <p>
                iPhone needs an <strong>https://</strong> address to cache this app for offline
                use. A plain <code>http://</code> link cannot finish the install.
              </p>
              <p>
                On Windows, run <code>npm run serve</code>, then open{' '}
                <code>https://YOUR_WINDOWS_IP:4173</code> in Safari. Tap through the certificate
                warning once, delete any old Home Screen icon, add the app again, and open it
                once while connected.
              </p>
            </>
          ) : (
            <>
              <p>
                The offline cache is not active yet on this iPhone. That usually means the app
                was added from the wrong address or before caching finished.
              </p>
              <p>
                On Windows, run <code>npm run serve</code>, open{' '}
                <code>https://YOUR_WINDOWS_IP:4173</code> in Safari, delete this Home Screen
                icon, add the app again, then open it once while connected so caching can
                finish.
              </p>
            </>
          )}
        </section>
      )}

      {status === 'checking' && standalone && (
        <section className="panel notice-panel notice-panel-info">
          <h2>Preparing offline install</h2>
          <p>Setting up offline caching on this iPhone. This usually takes a few seconds.</p>
        </section>
      )}

      {readyNotice && (
        <section className="panel notice-panel notice-panel-success">
          <div>
            <h2>Ready for offline use</h2>
            <p>
              The app is cached on this iPhone. You can close it or restart your phone and open
              it again without home Wi-Fi.
            </p>
          </div>
          <button className="ghost-button" onClick={onDismissReady}>
            Dismiss
          </button>
        </section>
      )}
    </>
  );
}
