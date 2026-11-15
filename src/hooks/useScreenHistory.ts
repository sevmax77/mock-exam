import { useEffect, useState } from 'react';
import {
  hashToScreen,
  initialScreen,
  isRouteState,
  previousScreen,
  pushRoute,
  replaceRoute,
  screenToHash,
  type RouteState,
  type Screen,
} from '../lib/routing';

function currentRoute(): RouteState | null {
  return isRouteState(window.history.state) ? window.history.state : null;
}

/**
 * Screen navigation backed by browser history, so the browser's back and forward buttons (and
 * swipe-back where the browser offers it) move between screens, and a reload stays on the screen.
 *
 * `resolve` maps the requested screen to the one that can actually be shown (for example home
 * when there is no session to show); the URL always follows the shown screen.
 */
export function useScreenHistory(fallback: () => Screen, resolve: (requested: Screen) => Screen) {
  const [requested, setRequested] = useState<Screen>(() =>
    initialScreen(window.history.state, window.location.hash, fallback()),
  );
  const screen = resolve(requested);

  // Keep the current history entry describing the shown screen: on first load, after a URL was
  // typed by hand, or when the requested screen can't be shown.
  useEffect(() => {
    const current = currentRoute();
    if (current?.screen !== screen) {
      window.history.replaceState(replaceRoute(current, screen), '', screenToHash(screen));
    }
  }, [screen]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      setRequested(
        isRouteState(event.state)
          ? event.state.screen
          : (hashToScreen(window.location.hash) ?? 'home'),
      );
      window.scrollTo(0, 0);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /** Goes to `to` as a new history entry, or in place of the current one with `replace`. */
  const navigate = (to: Screen, { replace = false } = {}) => {
    const current = currentRoute();

    if (replace) {
      window.history.replaceState(replaceRoute(current, to), '', screenToHash(to));
    } else if (current?.screen !== to) {
      window.history.pushState(pushRoute(current, to), '', screenToHash(to));
    }

    setRequested(to);
  };

  /**
   * Returns to `to` the way the browser's back button would when that is the previous entry, so
   * the app's own Back buttons and the browser's agree. Otherwise replaces the current entry.
   */
  const goBack = (to: Screen) => {
    if (previousScreen(currentRoute()) === to) {
      window.history.back();
    } else {
      navigate(to, { replace: true });
    }
  };

  return { screen, navigate, goBack };
}
