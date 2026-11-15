export type Screen =
  | 'home'
  | 'session'
  | 'review'
  | 'results'
  | 'bank'
  | 'question-form'
  | 'settings';

const PATHS: Record<Screen, string> = {
  home: '',
  session: 'session',
  review: 'review',
  results: 'results',
  bank: 'bank',
  'question-form': 'question',
  settings: 'settings',
};

const SCREEN_BY_PATH = new Map(
  (Object.entries(PATHS) as Array<[Screen, string]>).map(([screen, path]) => [path, screen]),
);

/**
 * Stored in each browser history entry. `stack` lists the screens from the first entry of this
 * visit up to and including this one, so "Back" buttons can tell whether the browser's previous
 * entry is where they want to go.
 */
export type RouteState = { screen: Screen; stack: Screen[] };

export function screenToHash(screen: Screen): string {
  return `#/${PATHS[screen]}`;
}

/** The screen for a URL hash such as "#/bank", or null when it isn't one of ours. */
export function hashToScreen(hash: string): Screen | null {
  const path = hash.replace(/^#\/?/, '').replace(/\/$/, '');
  return SCREEN_BY_PATH.get(path) ?? null;
}

function isScreen(value: unknown): value is Screen {
  return typeof value === 'string' && Object.hasOwn(PATHS, value);
}

export function isRouteState(value: unknown): value is RouteState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { screen, stack } = value as Partial<RouteState>;
  return (
    isScreen(screen) &&
    Array.isArray(stack) &&
    stack.length > 0 &&
    stack.every(isScreen) &&
    stack[stack.length - 1] === screen
  );
}

export function pushRoute(current: RouteState | null, screen: Screen): RouteState {
  return { screen, stack: [...(current?.stack ?? []), screen] };
}

export function replaceRoute(current: RouteState | null, screen: Screen): RouteState {
  return { screen, stack: [...(current?.stack.slice(0, -1) ?? []), screen] };
}

/** The screen of the browser's previous history entry, when it belongs to this visit. */
export function previousScreen(current: RouteState | null): Screen | null {
  return current && current.stack.length > 1 ? current.stack[current.stack.length - 2] : null;
}

/**
 * The screen to show when the app loads: the one in the history entry or URL, else `fallback`.
 * The question form can't be restored after a reload (its draft lives in memory), so that
 * becomes the question bank.
 */
export function initialScreen(state: unknown, hash: string, fallback: Screen): Screen {
  const screen = isRouteState(state) ? state.screen : (hashToScreen(hash) ?? fallback);
  return screen === 'question-form' ? 'bank' : screen;
}
