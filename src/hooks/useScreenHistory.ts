import { useEffect, useRef, useState } from 'react';
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
import { slide, type SlideDirection } from '../lib/motion';
import { useLatest } from './useLatest';

function currentRoute(): RouteState | null {
  return isRouteState(window.history.state) ? window.history.state : null;
}

type NavigateOptions = { replace?: boolean; direction?: SlideDirection };

/**
 * Screen navigation backed by browser history, so the browser's back and forward buttons (and
 * swipe-back where the browser offers it) move between screens, and a reload stays on the screen.
 * Moving deeper slides the new screen in from the right; going back slides it in from the left.
 *
 * `resolve` maps the requested screen to the one that can actually be shown (for example home
 * when there is no session to show); the URL always follows the shown screen.
 */
export function useScreenHistory(fallback: () => Screen, resolve: (requested: Screen) => Screen) {
  const [requested, setRequested] = useState<Screen>(() =>
    initialScreen(window.history.state, window.location.hash, fallback()),
  );
  const screen = resolve(requested);
  const screenRef = useLatest(screen);
  const resolveRef = useLatest(resolve);
  /** How deep the shown history entry is, to tell back from forward when the browser moves. */
  const depthRef = useRef(currentRoute()?.stack.length ?? 1);

  // Keep the current history entry describing the shown screen: on first load, after a URL was
  // typed by hand, or when the requested screen can't be shown.
  useEffect(() => {
    const current = currentRoute();
    if (current?.screen !== screen) {
      window.history.replaceState(replaceRoute(current, screen), '', screenToHash(screen));
    }
    depthRef.current = currentRoute()?.stack.length ?? 1;
  }, [screen]);

  useEffect(() => {
    // Every screen starts at the top (below). If the browser restored the old scroll position
    // first, the outgoing screen would jump just before it slides away.
    window.history.scrollRestoration = 'manual';

    const onPopState = (event: PopStateEvent) => {
      const next = isRouteState(event.state)
        ? event.state.screen
        : (hashToScreen(window.location.hash) ?? 'home');
      const depth = isRouteState(event.state) ? event.state.stack.length : 1;
      const direction: SlideDirection = depth < depthRef.current ? 'backward' : 'forward';
      depthRef.current = depth;

      const show = () => {
        setRequested(next);
        window.scrollTo(0, 0);
      };

      // Safari animates its own swipe-back; a slide on top would play the move twice. And when
      // the screen is already showing (for example home after Discard), there is nothing to slide.
      if (
        ('hasUAVisualTransition' in event && event.hasUAVisualTransition) ||
        resolveRef.current(next) === screenRef.current
      ) {
        show();
      } else {
        slide(direction, show);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [resolveRef, screenRef]);

  /**
   * Goes to `to` as a new history entry, or in place of the current one with `replace`, starting
   * at the top of the page. Slides forward unless told otherwise.
   */
  const navigate = (to: Screen, { replace = false, direction = 'forward' }: NavigateOptions = {}) =>
    slide(direction, () => {
      const current = currentRoute();

      if (replace) {
        window.history.replaceState(replaceRoute(current, to), '', screenToHash(to));
      } else if (current?.screen !== to) {
        window.history.pushState(pushRoute(current, to), '', screenToHash(to));
      }

      depthRef.current = currentRoute()?.stack.length ?? 1;
      setRequested(to);
      window.scrollTo(0, 0);
    });

  /**
   * Returns to `to` the way the browser's back button would when that is the previous entry, so
   * the app's own Back buttons and the browser's agree. Otherwise replaces the current entry.
   * Either way it slides backward (the browser's back slides from the popstate handler).
   */
  const goBack = (to: Screen) => {
    if (previousScreen(currentRoute()) === to) {
      window.history.back();
    } else {
      navigate(to, { replace: true, direction: 'backward' });
    }
  };

  return { screen, navigate, goBack };
}
