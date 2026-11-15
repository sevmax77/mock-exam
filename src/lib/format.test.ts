import { describe, expect, it } from 'vitest';
import { displayLabel, formatDuration, truncate } from './format';

describe('formatDuration', () => {
  it('formats minutes and seconds, rounding up partial seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(1)).toBe('0:01');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(59 * 60_000 + 59_000)).toBe('59:59');
  });

  it('adds hours when needed and never goes negative', () => {
    expect(formatDuration(3_723_000)).toBe('1:02:03');
    expect(formatDuration(-5_000)).toBe('0:00');
  });
});

describe('truncate and displayLabel', () => {
  it('truncates long text and labels positions', () => {
    expect(truncate('abcdef', 3)).toBe('abc...');
    expect(truncate('abc', 3)).toBe('abc');
    expect(displayLabel(0)).toBe('A');
    expect(displayLabel(5)).toBe('F');
  });
});
