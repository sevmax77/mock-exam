import { flushSync } from 'react-dom';

/** True when the phone or computer asks for less movement on screen ("Reduce Motion"). */
export const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Forward slides the new screen in from the right; backward slides it in from the left. */
export type SlideDirection = 'forward' | 'backward';

/** Screen slides need view transitions with types (Safari 18.2+, Chrome 125+, Firefox 147+). */
function canSlide(): boolean {
  return (
    typeof document.startViewTransition === 'function' &&
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('selector(:active-view-transition-type(forward))')
  );
}

let activeSlide: ViewTransition | null = null;
let applyingSlide = false;

/**
 * Applies `update` (React state changes that show another screen or question) with a slide in
 * `direction`. Without support, or with Reduce Motion on, the change happens at once instead.
 *
 * The browser runs `update` a frame later, after taking a picture of the current screen, so every
 * state change that belongs to the move must happen inside it. With `question`, the timer and the
 * button bar stay still while only the question slides.
 */
export function slide(
  direction: SlideDirection,
  update: () => void,
  { question = false }: { question?: boolean } = {},
) {
  // A slide inside another slide's update (such as navigate() called from one) joins that slide.
  if (applyingSlide || !canSlide() || prefersReducedMotion()) {
    update();
    return;
  }

  const runUpdate = () => {
    applyingSlide = true;
    try {
      flushSync(update);
    } finally {
      applyingSlide = false;
    }
  };

  const busy = activeSlide !== null;
  const transition = document.startViewTransition({
    update: runUpdate,
    types: question ? [direction, 'question'] : [direction],
  });

  activeSlide = transition;
  // A newer slide skips this one, which rejects `ready`; that is expected, not an error.
  transition.ready.catch(() => {});
  const settle = () => {
    if (activeSlide === transition) {
      activeSlide = null;
    }
  };
  // An error thrown by `update` still surfaces through `updateCallbackDone`.
  transition.finished.then(settle, settle);

  // Pressing again while a slide is still running moves on at once, so nobody has to wait.
  // Going through the browser still keeps the updates in order with the earlier one.
  if (busy) {
    transition.skipTransition();
  }
}
