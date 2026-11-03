import { describe, expect, it } from 'vitest';
import {
  GRAMMAR_CHECK_SYSTEM_PROMPT,
  createGrammarCheckPrompt,
  createRewritePrompt,
  formatCustomInstructions,
  getRewriteSystemPrompt,
} from '@/lib/ai/prompts';
import { CUSTOM_INSTRUCTIONS_MAX_LENGTH, REWRITE_STYLE, REWRITE_STYLES } from '@/types';

describe('system prompts', () => {
  it('loads the grammar prompt from Markdown', () => {
    expect(GRAMMAR_CHECK_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('gives humanize, proofread and translate their own prompts', () => {
    const rewrite = getRewriteSystemPrompt(REWRITE_STYLE.FORMAL);
    const proofread = getRewriteSystemPrompt(REWRITE_STYLE.PROOFREAD);
    const translate = getRewriteSystemPrompt(REWRITE_STYLE.TRANSLATE);
    const humanize = getRewriteSystemPrompt(REWRITE_STYLE.HUMANIZE);
    expect(new Set([rewrite, proofread, translate, humanize]).size).toBe(4);
    for (const style of [REWRITE_STYLE.CASUAL, REWRITE_STYLE.CONCISE, REWRITE_STYLE.ELABORATE]) {
      expect(getRewriteSystemPrompt(style)).toBe(rewrite);
    }
  });
});

describe('createGrammarCheckPrompt', () => {
  it('asks for auto-detection for the auto language', () => {
    const prompt = createGrammarCheckPrompt('Some text', 'auto');
    expect(prompt).toContain('Detect the language automatically.');
    expect(prompt).toContain('"""\nSome text\n"""');
  });

  it('names an explicit language', () => {
    expect(createGrammarCheckPrompt('x', 'de')).toContain('The language is de.');
  });
});

describe('createRewritePrompt', () => {
  it.each(REWRITE_STYLES)('has an instruction for %s', (style) => {
    const prompt = createRewritePrompt('text', style);
    expect(prompt.split('\n')[0].length).toBeGreaterThan(0);
    expect(prompt).toContain('"""\ntext\n"""');
  });

  it('includes the translate target, defaulting to English', () => {
    expect(createRewritePrompt('t', REWRITE_STYLE.TRANSLATE, 'German (Deutsch)')).toContain(
      'Translate the text into German (Deutsch).',
    );
    expect(createRewritePrompt('t', REWRITE_STYLE.TRANSLATE)).toContain('Translate the text into English.');
  });
});

describe('custom instructions', () => {
  it('adds nothing when empty or blank', () => {
    expect(formatCustomInstructions()).toBe('');
    expect(formatCustomInstructions('   ')).toBe('');
    expect(createGrammarCheckPrompt('t', 'en', '')).toBe(createGrammarCheckPrompt('t', 'en'));
    expect(createRewritePrompt('t', REWRITE_STYLE.FORMAL, undefined, ' ')).toBe(
      createRewritePrompt('t', REWRITE_STYLE.FORMAL),
    );
  });

  it('is appended to both prompts, before the JSON reminder', () => {
    for (const prompt of [
      createGrammarCheckPrompt('t', 'en', 'Use British spelling.'),
      createRewritePrompt('t', REWRITE_STYLE.FORMAL, undefined, 'Use British spelling.'),
    ]) {
      expect(prompt).toContain('Use British spelling.');
      expect(prompt.endsWith('Return ONLY valid JSON.')).toBe(true);
    }
  });

  it('caps the length', () => {
    const long = 'a'.repeat(CUSTOM_INSTRUCTIONS_MAX_LENGTH + 500);
    expect(formatCustomInstructions(long)).toContain('a'.repeat(CUSTOM_INSTRUCTIONS_MAX_LENGTH));
    expect(formatCustomInstructions(long)).not.toContain('a'.repeat(CUSTOM_INSTRUCTIONS_MAX_LENGTH + 1));
  });
});
