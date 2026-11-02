/** The logo animation in index.html lasts about 1.45 s from the moment the logo appears. */
export const SPLASH_MIN_MS = 1500;

/** How long to wait before fading out, so the animation always finishes once. `playedMs` is how much has played. */
export function splashDelay(playedMs: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : Math.max(0, SPLASH_MIN_MS - playedMs);
}

let hiding = false;

/** Fades out the loading screen once the app has something to show. Safe to call more than once. */
export function hideSplash() {
  const el = typeof document !== 'undefined' ? document.getElementById('splash') : null;
  if (!el || hiding) return;
  hiding = true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The SVG's own clock starts when the logo is parsed, which can be a few hundred ms after page start.
  const svg = el.querySelector('svg');
  const played = svg && typeof svg.getCurrentTime === 'function' ? svg.getCurrentTime() * 1000 : performance.now();
  window.setTimeout(() => {
    el.classList.add('out');
    window.setTimeout(() => el.remove(), 320);
  }, splashDelay(played, reduced));
}
