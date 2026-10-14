import type { RewriteStyle } from '@/types';
import grammarPrompt from './prompts/grammar.md?raw';
import proofreadPrompt from './prompts/proofread.md?raw';
import rewritePrompt from './prompts/rewrite.md?raw';
import translatePrompt from './prompts/translate.md?raw';

export const GRAMMAR_CHECK_SYSTEM_PROMPT = grammarPrompt;

// Proofread and translate need their own prompts: the rewrite prompt tells
// the model to change the style and never to translate.
export function getRewriteSystemPrompt(style: RewriteStyle): string {
  if (style === 'proofread') return proofreadPrompt;
  if (style === 'translate') return translatePrompt;
  return rewritePrompt;
}

export function createGrammarCheckPrompt(
  text: string,
  language: string
): string {
  const languageInstruction =
    language === 'auto'
      ? 'Detect the language automatically.'
      : `The language is ${language}.`;

  return `${languageInstruction}

Analyze ONLY the following text.

"""
${text}
"""

Return ONLY valid JSON.`;
}

// `targetLanguage` is a display name such as "German (Deutsch)"; it is only
// used for translate.
export function createRewritePrompt(text: string, style: RewriteStyle, targetLanguage?: string): string {
  const styleInstructions: Record<RewriteStyle, string> = {
    formal: 'Make the text more formal and professional. Avoid slang and contractions.',
    casual: 'Make the text warmer, more conversational and friendly, without being unprofessional.',
    concise: 'Make the text noticeably shorter and more direct. Remove filler and repetition, but keep every key fact.',
    elaborate: 'Expand the text with more detail and explanation.',
    proofread: 'Fix the spelling, grammar, and punctuation mistakes. Change nothing else.',
    translate: `Translate the text into ${targetLanguage ?? 'English'}.`,
  };

  return `${styleInstructions[style]}

Original text:
"""
${text}
"""

Return ONLY valid JSON.`;
}