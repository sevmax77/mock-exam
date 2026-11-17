// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { slide } from './motion';

type StartOptions = { update: () => void; types: string[] };

/** A stand-in for the browser's view transitions, which jsdom doesn't have. */
function stubViewTransitions() {
  const finishers: Array<() => void> = [];
  const started: Array<{ options: StartOptions; skipTransition: ReturnType<typeof vi.fn> }> = [];

  const startViewTransition = vi.fn((options: StartOptions) => {
    const skipTransition = vi.fn();
    started.push({ options, skipTransition });
    return {
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      finished: new Promise<void>((resolve) => finishers.push(resolve)),
      skipTransition,
    };
  });

  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: startViewTransition,
  });
  vi.stubGlobal('CSS', { supports: () => true });

  return { startViewTransition, started, finishers };
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduce && query.includes('reduce') })),
  );
}

describe('slide', () => {
  let finishers: Array<() => void> = [];

  beforeEach(() => {
    stubReducedMotion(false);
  });

  afterEach(async () => {
    // Let every stubbed slide finish, so none is still "running" in the next test.
    finishers.forEach((finish) => finish());
    finishers = [];
    await Promise.resolve();
    await Promise.resolve();
    Reflect.deleteProperty(document, 'startViewTransition');
    vi.unstubAllGlobals();
  });

  it('applies the change at once where view transitions are missing', () => {
    const update = vi.fn();

    slide('forward', update);

    expect(update).toHaveBeenCalledOnce();
  });

  it('applies the change at once with Reduce Motion on', () => {
    const stub = stubViewTransitions();
    finishers = stub.finishers;
    stubReducedMotion(true);
    const update = vi.fn();

    slide('forward', update);

    expect(update).toHaveBeenCalledOnce();
    expect(stub.startViewTransition).not.toHaveBeenCalled();
  });

  it('hands the change to the browser with the slide direction', () => {
    const stub = stubViewTransitions();
    finishers = stub.finishers;
    const update = vi.fn();

    slide('backward', update, { question: true });

    // The browser runs the change itself, after picturing the current screen.
    expect(update).not.toHaveBeenCalled();
    expect(stub.started[0].options.types).toEqual(['backward', 'question']);

    stub.started[0].options.update();
    expect(update).toHaveBeenCalledOnce();
    expect(stub.started[0].skipTransition).not.toHaveBeenCalled();
  });

  it('runs a slide started inside another slide as part of that one', () => {
    const stub = stubViewTransitions();
    finishers = stub.finishers;
    const inner = vi.fn();

    slide('forward', () => slide('backward', inner));
    stub.started[0].options.update();

    expect(inner).toHaveBeenCalledOnce();
    expect(stub.startViewTransition).toHaveBeenCalledOnce();
  });

  it('skips the animation when another slide is still running', () => {
    const stub = stubViewTransitions();
    finishers = stub.finishers;

    slide('forward', vi.fn());
    slide('forward', vi.fn());

    expect(stub.started).toHaveLength(2);
    expect(stub.started[0].skipTransition).not.toHaveBeenCalled();
    expect(stub.started[1].skipTransition).toHaveBeenCalledOnce();
    expect(stub.started[1].options.types).toEqual(['forward']);
  });
});
