import { describe, expect, it } from 'vitest';
import {
  GRAMMAR_CHECK_SYSTEM_PROMPT,
  createGrammarCheckPrompt,
  createRewritePrompt,
  getRewriteSystemPrompt,
} from '@/lib/ai/prompts';
import { REWRITE_STYLE, REWRITE_STYLES } from '@/types';

describe('system prompts', () => {
  it('loads the grammar prompt from Markdown', () => {
    expect(GRAMMAR_CHECK_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('gives proofread and translate their own prompts', () => {
    const rewrite = getRewriteSystemPrompt(REWRITE_STYLE.FORMAL);
    const proofread = getRewriteSystemPrompt(REWRITE_STYLE.PROOFREAD);
    const translate = getRewriteSystemPrompt(REWRITE_STYLE.TRANSLATE);
    expect(new Set([rewrite, proofread, translate]).size).toBe(3);
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
