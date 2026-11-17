/** True when the phone or computer asks for less movement on screen ("Reduce Motion"). */
export const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Scrolls the page to the top: smoothly, or at once when Reduce Motion is on. */
export function scrollPageToTop() {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}
