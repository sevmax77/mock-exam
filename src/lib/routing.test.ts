import { describe, expect, it } from 'vitest';
import {
  hashToScreen,
  initialScreen,
  isRouteState,
  previousScreen,
  pushRoute,
  replaceRoute,
  screenToHash,
  type Screen,
} from './routing';

const screens: Screen[] = ['home', 'session', 'review', 'results', 'bank', 'question-form', 'settings'];

describe('hashes', () => {
  it('round-trips every screen', () => {
    for (const screen of screens) {
      expect(hashToScreen(screenToHash(screen))).toBe(screen);
    }
    expect(screenToHash('home')).toBe('#/');
    expect(screenToHash('question-form')).toBe('#/question');
  });

  it('accepts loose forms and rejects unknown paths', () => {
    expect(hashToScreen('')).toBe('home');
    expect(hashToScreen('#')).toBe('home');
    expect(hashToScreen('#bank')).toBe('bank');
    expect(hashToScreen('#/bank/')).toBe('bank');
    expect(hashToScreen('#/nope')).toBeNull();
    expect(hashToScreen('#/question-form')).toBeNull();
  });
});

describe('route state', () => {
  it('pushes, replaces and finds the previous screen', () => {
    const home = pushRoute(null, 'home');
    const bank = pushRoute(home, 'bank');
    const form = pushRoute(bank, 'question-form');

    expect(form).toEqual({ screen: 'question-form', stack: ['home', 'bank', 'question-form'] });
    expect(previousScreen(form)).toBe('bank');
    expect(replaceRoute(form, 'settings')).toEqual({
      screen: 'settings',
      stack: ['home', 'bank', 'settings'],
    });
    expect(replaceRoute(null, 'bank')).toEqual({ screen: 'bank', stack: ['bank'] });
    expect(previousScreen(home)).toBeNull();
    expect(previousScreen(null)).toBeNull();
  });

  it('validates state read back from the browser', () => {
    expect(isRouteState({ screen: 'bank', stack: ['home', 'bank'] })).toBe(true);
    expect(isRouteState(null)).toBe(false);
    expect(isRouteState({ screen: 'bank' })).toBe(false);
    expect(isRouteState({ screen: 'bank', stack: [] })).toBe(false);
    expect(isRouteState({ screen: 'bank', stack: ['home'] })).toBe(false);
    expect(isRouteState({ screen: 'toString', stack: ['toString'] })).toBe(false);
  });
});

describe('initialScreen', () => {
  it('prefers the history entry, then the URL, then the fallback', () => {
    expect(initialScreen({ screen: 'settings', stack: ['settings'] }, '#/bank', 'home')).toBe('settings');
    expect(initialScreen(null, '#/bank', 'session')).toBe('bank');
    expect(initialScreen(null, '#/unknown', 'session')).toBe('session');
  });

  it('opens the bank instead of a question form that was lost on reload', () => {
    expect(initialScreen(null, '#/question', 'home')).toBe('bank');
  });
});
