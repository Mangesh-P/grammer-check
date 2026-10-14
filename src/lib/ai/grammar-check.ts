import { REWRITE_STYLE } from '@/types';
import { generateText } from 'ai';
import { getModel, getReasoning } from './providers';
import { GRAMMAR_CHECK_SYSTEM_PROMPT, createGrammarCheckPrompt, createRewritePrompt, getRewriteSystemPrompt } from './prompts';
import type { AIProvider, GrammarSuggestion, GrammarCheckResult, RewriteStyle } from '@/types';

const GRAMMAR_CHECK_TEMPERATURE = 0.1;
const REWRITE_TEMPERATURE = 0.7;
const JSON_OBJECT_PATTERN = /\{[\s\S]*\}/;

interface GrammarCheckOptions {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseURL?: string;
  language: string;
}

interface AIGrammarResponse {
  suggestions: Array<{
    original: string;
    replacement: string;
    explanation: string;
    type: GrammarSuggestion['type'];
    startIndex: number;
    endIndex: number;
  }>;
  detectedLanguage: string;
}

export async function checkGrammar(
  text: string,
  options: GrammarCheckOptions
): Promise<GrammarCheckResult> {
  const { provider, model: modelId, apiKey, language } = options;

  if (!text.trim()) {
    return {
      suggestions: [],
      text,
      language: language === 'auto' ? 'en' : language,
      timestamp: Date.now(),
    };
  }

  try {
    const model = getModel(provider, modelId, apiKey, options.baseURL);

    const { text: responseText } = await generateText({
      model,
      instructions: GRAMMAR_CHECK_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: createGrammarCheckPrompt(text, language),
        },
      ],
      temperature: GRAMMAR_CHECK_TEMPERATURE,
      reasoning: getReasoning(provider, options.baseURL),
    });

    // Parse the JSON response
    const jsonMatch = responseText.match(JSON_OBJECT_PATTERN);
    if (!jsonMatch) {
      console.error('Failed to parse AI response:', responseText);
      return {
        suggestions: [],
        text,
        language: language === 'auto' ? 'en' : language,
        timestamp: Date.now(),
      };
    }

    const parsed: AIGrammarResponse = JSON.parse(jsonMatch[0]);

    // Validate and filter suggestions
// Validate and filter suggestions
const validSuggestions: GrammarSuggestion[] = parsed.suggestions
.filter((s) => {

    if (!s.original || !s.replacement)
        return false;

    const expected = text.substring(
        s.startIndex,
        s.endIndex
    );

    if (expected === s.original)
        return true;

    const recovered = text.indexOf(s.original);

    if (recovered < 0)
        return false;

    s.startIndex = recovered;
    s.endIndex = recovered + s.original.length;

    return true;

})
  .map((s, index) => ({
    id: `suggestion-${Date.now()}-${index}`,
    original: s.original,
    replacement: s.replacement,
    explanation: s.explanation,
    type: s.type,
    startIndex: s.startIndex,
    endIndex: s.endIndex,
  }));

    return {
      suggestions: validSuggestions,
      text,
      language: parsed.detectedLanguage || (language === 'auto' ? 'en' : language),
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Grammar check error:', error);
    throw error;
  }
}

// Small local models often ignore the JSON instruction, wrap the answer in a
// code fence, or quote it, so fall back to cleaning up the raw text rather
// than failing the rewrite.
export function parseRewriteResponse(responseText: string): string {
  const jsonMatch = responseText.match(JSON_OBJECT_PATTERN);
  if (jsonMatch) {
    try {
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof (parsed as { rewrittenText?: unknown }).rewrittenText === 'string'
      ) {
        return (parsed as { rewrittenText: string }).rewrittenText.trim();
      }
    } catch {
      // Not JSON after all; fall through to the plain-text cleanup.
    }
  }

  return responseText
    .trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/^"([\s\S]*)"$/, '$1')
    .trim();
}

export async function rewriteText(
  text: string,
  style: RewriteStyle,
  options: Omit<GrammarCheckOptions, 'language'> & { targetLanguage?: string }
): Promise<string> {
  const { provider, model: modelId, apiKey } = options;

  if (!text.trim()) {
    return text;
  }

  try {
    const model = getModel(provider, modelId, apiKey, options.baseURL);

    const { text: responseText } = await generateText({
      model,
      instructions: getRewriteSystemPrompt(style),
      messages: [
        {
          role: 'user',
          content: createRewritePrompt(text, style, options.targetLanguage),
        },
      ],
      // Proofreading should be close to deterministic; translation and
      // restyling benefit from some variety on "Try again".
      temperature: style === REWRITE_STYLE.PROOFREAD ? GRAMMAR_CHECK_TEMPERATURE : REWRITE_TEMPERATURE,
      reasoning: getReasoning(provider, options.baseURL),
    });

    const rewritten = parseRewriteResponse(responseText);
    if (!rewritten) {
      throw new Error('The AI returned an empty rewrite. Try again or pick another model.');
    }
    return rewritten;
  } catch (error) {
    console.error('Rewrite error:', error);
    throw error;
  }
}
