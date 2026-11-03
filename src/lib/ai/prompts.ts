import { AUTO_LANGUAGE, CUSTOM_INSTRUCTIONS_MAX_LENGTH, REWRITE_STYLE } from '@/types';
import type { RewriteStyle } from '@/types';
import grammarPrompt from './prompts/grammar.md?raw';
import humanizePrompt from './prompts/humanize.md?raw';
import proofreadPrompt from './prompts/proofread.md?raw';
import rewritePrompt from './prompts/rewrite.md?raw';
import translatePrompt from './prompts/translate.md?raw';

export const GRAMMAR_CHECK_SYSTEM_PROMPT = grammarPrompt;

// Humanize, proofread and translate need their own prompts: the rewrite
// prompt is generic, and it tells the model never to translate.
export function getRewriteSystemPrompt(style: RewriteStyle): string {
  if (style === REWRITE_STYLE.HUMANIZE) return humanizePrompt;
  if (style === REWRITE_STYLE.PROOFREAD) return proofreadPrompt;
  if (style === REWRITE_STYLE.TRANSLATE) return translatePrompt;
  return rewritePrompt;
}

// Goes in the user prompt, after the core rules, so the system prompt's output
// format stays authoritative and the instructions can't redefine it.
export function formatCustomInstructions(raw?: string): string {
  const instructions = raw?.trim().slice(0, CUSTOM_INSTRUCTIONS_MAX_LENGTH);
  if (!instructions) return '';
  return `

The user's own preferences. Follow them when they don't conflict with the required output format:
"""
${instructions}
"""`;
}

export function createGrammarCheckPrompt(
  text: string,
  language: string,
  customInstructions?: string
): string {
  const languageInstruction =
    language === AUTO_LANGUAGE
      ? 'Detect the language automatically.'
      : `The language is ${language}.`;

  return `${languageInstruction}

Analyze ONLY the following text.

"""
${text}
"""${formatCustomInstructions(customInstructions)}

Return ONLY valid JSON.`;
}

// `targetLanguage` is a display name such as "German (Deutsch)"; it is only
// used for translate.
export function createRewritePrompt(
  text: string,
  style: RewriteStyle,
  targetLanguage?: string,
  customInstructions?: string
): string {
  const styleInstructions: Record<RewriteStyle, string> = {
    [REWRITE_STYLE.FORMAL]: 'Make the text more formal and professional. Avoid slang and contractions.',
    [REWRITE_STYLE.CASUAL]: 'Make the text warmer, more conversational and friendly, without being unprofessional.',
    [REWRITE_STYLE.CONCISE]: 'Make the text noticeably shorter and more direct. Remove filler and repetition, but keep every key fact.',
    [REWRITE_STYLE.ELABORATE]: 'Expand the text with more detail and explanation.',
    [REWRITE_STYLE.HUMANIZE]: 'Rewrite the text so it sounds natural and written by a real person, not an AI.',
    [REWRITE_STYLE.PROOFREAD]: 'Fix the spelling, grammar, and punctuation mistakes. Change nothing else.',
    [REWRITE_STYLE.TRANSLATE]: `Translate the text into ${targetLanguage ?? 'English'}.`,
  };

  return `${styleInstructions[style]}

Original text:
"""
${text}
"""${formatCustomInstructions(customInstructions)}

Return ONLY valid JSON.`;
}