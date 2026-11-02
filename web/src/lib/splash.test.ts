import { describe, expect, it } from 'vitest';
import { SPLASH_MIN_MS, splashDelay } from './splash';

describe('loading screen timing', () => {
  it('waits for the logo animation to finish once', () => {
    expect(splashDelay(200, false)).toBe(SPLASH_MIN_MS - 200);
    expect(splashDelay(SPLASH_MIN_MS + 400, false)).toBe(0);
  });
  it('does not hold the app for people who turned off motion', () => {
    expect(splashDelay(100, true)).toBe(0);
  });
});
