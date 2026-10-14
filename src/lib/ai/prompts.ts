import grammarPrompt from './prompts/grammar.md?raw';
import rewritePrompt from './prompts/rewrite.md?raw';

export const GRAMMAR_CHECK_SYSTEM_PROMPT = grammarPrompt;
export const REWRITE_SYSTEM_PROMPT = rewritePrompt;

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

export function createRewritePrompt(
  text: string,
  style: 'formal' | 'casual' | 'concise' | 'elaborate'
): string {
  const styleInstructions: Record<string, string> = {
    formal: 'Make the text more formal and professional.',
    casual: 'Make the text more conversational and friendly.',
    concise: 'Make the text shorter and more direct.',
    elaborate: 'Expand the text with more detail and explanation.',
  };

  return `${styleInstructions[style]}

Original text:
"""
${text}
"""

Rewrite the text according to the instructions above.`;
}