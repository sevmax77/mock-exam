import { describe, expect, it, vi } from 'vitest';
import { makeQuestion } from '../test/fixtures';
import {
  DEFAULT_AI_MODEL,
  askOpenRouter,
  buildAiPrompt,
  parseAiJson,
  stripCodeFence,
  toPositionalQuestion,
} from './ai';

describe('stripCodeFence', () => {
  it('unwraps fenced JSON', () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('cuts prose around the object', () => {
    expect(stripCodeFence('Here you go: {"a":{"b":1}} Hope it helps')).toBe('{"a":{"b":1}}');
  });

  it('leaves other text alone', () => {
    expect(stripCodeFence('  not json  ')).toBe('not json');
  });
});

describe('parseAiJson', () => {
  const ids = ['A', 'B', 'C'];

  it('parses the expected shape and normalizes ids', () => {
    const result = parseAiJson(
      JSON.stringify({
        recommendedOptionIds: [' b '],
        confidence: 'high',
        optionExplanations: { A: ' no ', B: 'yes', Z: 'ignored' },
        summary: 'S',
        notes: 'N',
      }),
      ids,
    );

    expect(result).toEqual({
      recommendedOptionIds: ['B'],
      confidence: 'high',
      optionExplanations: { A: 'no', B: 'yes' },
      summary: 'S',
      notes: 'N',
    });
  });

  it('accepts array-style explanations', () => {
    const result = parseAiJson(
      '{"recommendedOptionIds":["A"],"optionExplanations":[{"id":"a","explanation":"x"},{"id":"Q","explanation":"y"}]}',
      ids,
    );
    expect(result.optionExplanations).toEqual({ A: 'x' });
  });

  it('falls back to a single explanation and medium confidence', () => {
    const result = parseAiJson(
      '```json\n{"recommendedOptionIds":["A"],"explanation":"all","confidence":"very"}\n```',
      ids,
    );
    expect(result.optionExplanations).toEqual({ A: 'all', B: 'all', C: 'all' });
    expect(result.confidence).toBe('medium');
    expect(result.summary).toBe('');
  });

  it('rejects responses without the required fields', () => {
    expect(() => parseAiJson('{"optionExplanations":{"A":"x"}}', ids)).toThrow(
      'expected JSON fields',
    );
    expect(() => parseAiJson('{"recommendedOptionIds":["A"]}', ids)).toThrow(
      'per-option explanations',
    );
    expect(() => parseAiJson('nope', ids)).toThrow();
  });
});

describe('toPositionalQuestion', () => {
  it('relabels options by position and maps the answer', () => {
    const question = {
      ...makeQuestion('q1', ['D'], ['b', 'd']),
      options: [
        { id: 'B', text: 'b', explanation: '' },
        { id: 'D', text: 'd', explanation: '' },
      ],
    };

    const positional = toPositionalQuestion(question);
    expect(positional.options.map((option) => option.id)).toEqual(['A', 'B']);
    expect(positional.correctOptionIds).toEqual(['B']);
  });
});

describe('buildAiPrompt', () => {
  it('includes the question, options and existing answer', () => {
    const prompt = buildAiPrompt(makeQuestion('q1', ['B'], ['first', 'second']));
    expect(prompt).toContain('Question q1?');
    expect(prompt).toContain('A. first\nB. second');
    expect(prompt).toContain('Existing correct answer ID(s): B');
    expect(prompt).toContain('Existing summary:\n(empty)');
  });
});

describe('askOpenRouter', () => {
  const question = makeQuestion('q1', ['A'], ['one', 'two']);
  const settings = { apiKey: 'key', model: '  ' };

  function mockFetch(content: string | undefined, init: { ok?: boolean; status?: number } = {}) {
    const fetchMock = vi.fn(async () => ({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      text: async () => 'server said no',
      json: async () => ({ choices: [{ message: { content } }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { location: { origin: 'https://example.test' } });
    return fetchMock;
  }

  const reply = (recommendedOptionIds: string[]) =>
    JSON.stringify({ recommendedOptionIds, optionExplanations: { A: 'a', B: 'b' } });

  it('sends the default model when none is set and returns the review', async () => {
    const fetchMock = mockFetch(reply(['B']));
    const review = await askOpenRouter(question, settings, new AbortController().signal);

    expect(review.recommendedOptionIds).toEqual(['B']);
    const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(request.body)).model).toBe(DEFAULT_AI_MODEL);
    expect((request.headers as Record<string, string>).Authorization).toBe('Bearer key');
  });

  it('rejects recommendations for options that do not exist', async () => {
    mockFetch(reply(['C']));
    await expect(askOpenRouter(question, settings, new AbortController().signal)).rejects.toThrow(
      'option C',
    );
  });

  it('rejects empty recommendations and empty replies', async () => {
    mockFetch(reply([]));
    await expect(askOpenRouter(question, settings, new AbortController().signal)).rejects.toThrow(
      'did not recommend',
    );

    mockFetch(undefined);
    await expect(askOpenRouter(question, settings, new AbortController().signal)).rejects.toThrow(
      'empty response',
    );
  });

  it('surfaces HTTP errors', async () => {
    mockFetch('', { ok: false, status: 401 });
    await expect(askOpenRouter(question, settings, new AbortController().signal)).rejects.toThrow(
      'server said no',
    );
  });
});
