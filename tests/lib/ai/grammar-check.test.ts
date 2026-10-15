import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoObjectGeneratedError } from 'ai';

const generateText = vi.hoisted(() => vi.fn());
vi.mock('ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('ai')>()), generateText }));
vi.mock('@/lib/ai/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/providers')>()),
  getModel: vi.fn(() => ({ fake: 'model' })),
}));

import { checkGrammar, parseGrammarResponse, parseRewriteResponse, rewriteText } from '@/lib/ai/grammar-check';
import { getModel } from '@/lib/ai/providers';

const native = { provider: 'google', model: 'm', apiKey: 'k', language: 'en' } as const;
const compatible = { provider: 'huggingface', model: 'm', apiKey: 'k', language: 'auto' } as const;

beforeEach(() => {
  generateText.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('parseGrammarResponse', () => {
  it('extracts JSON surrounded by prose and code fences', () => {
    const text = 'Sure!\n```json\n{"suggestions":[{"original":"teh","replacement":"the","explanation":"typo","type":"spelling"}],"detectedLanguage":"en"}\n```';
    expect(parseGrammarResponse(text)).toEqual({
      suggestions: [{ original: 'teh', replacement: 'the', explanation: 'typo', type: 'spelling' }],
      detectedLanguage: 'en',
    });
  });

  it('fills in cosmetic fields and drops unusable suggestions', () => {
    const text = JSON.stringify({
      suggestions: [
        { original: 'a', replacement: 'b', type: 'nonsense', startIndex: 'x' },
        { original: '', replacement: 'b' },
        { replacement: 'b' },
        'junk',
      ],
      detectedLanguage: 42,
    });
    expect(parseGrammarResponse(text)).toEqual({
      suggestions: [{ original: 'a', replacement: 'b', explanation: '', type: 'grammar', startIndex: undefined }],
      detectedLanguage: undefined,
    });
  });

  it.each([
    ['no JSON at all', 'no json here'],
    ['invalid JSON', '{not: valid}'],
    ['suggestions not an array', '{"suggestions": "nope"}'],
    ['an empty object', '{}'],
    ['JSON null inside braces', '{"suggestions": null}'],
  ])('returns no suggestions for %s', (_label, text) => {
    expect(parseGrammarResponse(text).suggestions).toEqual([]);
  });
});

describe('checkGrammar', () => {
  it('skips the request for blank text', async () => {
    const result = await checkGrammar('   ', { ...compatible });
    expect(result).toMatchObject({ suggestions: [], text: '   ', language: 'en' });
    expect(generateText).not.toHaveBeenCalled();
  });

  it('uses structured output for native providers with low temperature and no reasoning', async () => {
    generateText.mockResolvedValue({
      output: { suggestions: [{ original: 'teh', replacement: 'the', explanation: 'typo', type: 'spelling' }] },
    });
    const result = await checkGrammar('I saw teh cat', native);

    const request = generateText.mock.calls[0][0];
    expect(request).toMatchObject({ temperature: 0.1, reasoning: 'none', model: { fake: 'model' } });
    expect(request.output).toBeDefined();
    expect(request.messages[0].content).toContain('I saw teh cat');
    expect(getModel).toHaveBeenCalledWith('google', 'm', 'k', undefined);

    expect(result.language).toBe('en');
    expect(result.suggestions).toEqual([
      expect.objectContaining({ original: 'teh', replacement: 'the', startIndex: 6, endIndex: 9, type: 'spelling' }),
    ]);
  });

  it('parses plain text leniently for OpenAI-compatible endpoints, without reasoning', async () => {
    generateText.mockResolvedValue({
      text: '{"suggestions":[{"original":"is","replacement":"are","explanation":"","type":"grammar","startIndex":5,"endIndex":7}],"detectedLanguage":"fr"}',
    });
    const result = await checkGrammar('They is here', compatible);

    const request = generateText.mock.calls[0][0];
    expect(request.output).toBeUndefined();
    expect(request.reasoning).toBeUndefined();
    expect(result.language).toBe('fr');
    expect(result.suggestions[0]).toMatchObject({ startIndex: 5, endIndex: 7 });
  });

  it('recovers wrong offsets with indexOf and drops text that is not in the input', async () => {
    generateText.mockResolvedValue({
      text: JSON.stringify({
        suggestions: [
          { original: 'wrold', replacement: 'world', startIndex: 0, endIndex: 5 },
          { original: 'missing', replacement: 'x' },
        ],
      }),
    });
    const result = await checkGrammar('hello wrold', compatible);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({ startIndex: 6, endIndex: 11 });
    // Falls back to English when auto-detect gets no answer
    expect(result.language).toBe('en');
  });

  it('salvages a structured-output miss from the raw text', async () => {
    generateText.mockRejectedValue(
      new NoObjectGeneratedError({
        message: 'bad',
        text: '{"suggestions":[{"original":"a","replacement":"b"}]}',
        response: {} as never,
        usage: {} as never,
        finishReason: 'stop',
      }),
    );
    const result = await checkGrammar('a', native);
    expect(result.suggestions).toHaveLength(1);
  });

  it('rethrows other errors', async () => {
    generateText.mockRejectedValue(new Error('401 Unauthorized'));
    await expect(checkGrammar('text', native)).rejects.toThrow('401 Unauthorized');
  });
});

describe('parseRewriteResponse', () => {
  it.each([
    ['JSON', '{"rewrittenText": "  Hello.  "}', 'Hello.'],
    ['JSON in prose', 'Here: {"rewrittenText":"Hi"} done', 'Hi'],
    ['a code fence', '```text\nHello there\n```', 'Hello there'],
    ['quotes', '"Hello there"', 'Hello there'],
    ['plain text', '  Hello there  ', 'Hello there'],
    ['JSON without rewrittenText', '{"other": 1}', '{"other": 1}'],
    ['broken JSON', '{oops}', '{oops}'],
  ])('handles %s', (_label, input, expected) => {
    expect(parseRewriteResponse(input)).toBe(expected);
  });
});

describe('rewriteText', () => {
  const options = { provider: 'anthropic', model: 'm', apiKey: 'k' } as const;

  it('returns blank text unchanged without a request', async () => {
    expect(await rewriteText('  ', 'formal', options)).toBe('  ');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('uses 0.7 for restyling and 0.1 for proofreading', async () => {
    generateText.mockResolvedValue({ text: '{"rewrittenText":"Done"}' });
    expect(await rewriteText('hi', 'formal', options)).toBe('Done');
    expect(generateText.mock.calls[0][0]).toMatchObject({ temperature: 0.7, reasoning: 'none' });

    await rewriteText('hi', 'proofread', options);
    expect(generateText.mock.calls[1][0].temperature).toBe(0.1);
  });

  it('passes the translate target into the prompt', async () => {
    generateText.mockResolvedValue({ text: 'Hallo' });
    await rewriteText('Hello', 'translate', { ...options, targetLanguage: 'German (Deutsch)' });
    expect(generateText.mock.calls[0][0].messages[0].content).toContain('German (Deutsch)');
  });

  it('throws on an empty rewrite', async () => {
    generateText.mockResolvedValue({ text: '""' });
    await expect(rewriteText('hi', 'casual', options)).rejects.toThrow(/empty rewrite/);
  });
});
