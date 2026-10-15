import { AUTO_LANGUAGE, REWRITE_STYLE } from '@/types';
import { generateText, NoObjectGeneratedError, Output } from 'ai';
import { z } from 'zod';
import { getModel, getReasoning, isOpenAICompatible } from './providers';
import { GRAMMAR_CHECK_SYSTEM_PROMPT, createGrammarCheckPrompt, createRewritePrompt, getRewriteSystemPrompt } from './prompts';
import type { AIProvider, GrammarSuggestion, GrammarCheckResult, RewriteStyle, SuggestionType } from '@/types';

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

const SUGGESTION_TYPES = ['grammar', 'spelling', 'style', 'punctuation'] as const satisfies readonly SuggestionType[];

// Sent to providers with native structured output. Every field is required
// because OpenAI's strict mode rejects optional properties.
const grammarResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      original: z.string(),
      replacement: z.string(),
      explanation: z.string(),
      type: z.enum(SUGGESTION_TYPES),
    })
  ),
});

// Validates one suggestion from free-form text. Small local models get details
// wrong, so fill in what's cosmetic and drop only what's unusable.
const lenientSuggestionSchema = z.object({
  original: z.string().min(1),
  replacement: z.string().min(1),
  explanation: z.string().catch(''),
  type: z.enum(SUGGESTION_TYPES).catch('grammar'),
  startIndex: z.number().int().optional().catch(undefined),
  endIndex: z.number().int().optional().catch(undefined),
});

type ParsedSuggestion = z.infer<typeof lenientSuggestionSchema>;

interface ParsedGrammarResponse {
  suggestions: ParsedSuggestion[];
  detectedLanguage?: string;
}

// Never throws: a reply we can't read is treated as "no suggestions".
export function parseGrammarResponse(responseText: string): ParsedGrammarResponse {
  const jsonMatch = responseText.match(JSON_OBJECT_PATTERN);
  if (!jsonMatch) {
    console.error('Failed to parse AI response:', responseText);
    return { suggestions: [] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    console.error('AI response is not valid JSON:', responseText);
    return { suggestions: [] };
  }

  const { suggestions, detectedLanguage } = (raw ?? {}) as { suggestions?: unknown; detectedLanguage?: unknown };
  return {
    suggestions: Array.isArray(suggestions)
      ? suggestions.flatMap((s) => {
          const result = lenientSuggestionSchema.safeParse(s);
          return result.success ? [result.data] : [];
        })
      : [],
    detectedLanguage: typeof detectedLanguage === 'string' ? detectedLanguage : undefined,
  };
}

export async function checkGrammar(
  text: string,
  options: GrammarCheckOptions
): Promise<GrammarCheckResult> {
  const { provider, model: modelId, apiKey, language } = options;
  // Reported when the model doesn't say which language it detected
  const fallbackLanguage = language === AUTO_LANGUAGE ? 'en' : language;

  if (!text.trim()) {
    return {
      suggestions: [],
      text,
      language: fallbackLanguage,
      timestamp: Date.now(),
    };
  }

  try {
    const model = getModel(provider, modelId, apiKey, options.baseURL);
    const request = {
      model,
      instructions: GRAMMAR_CHECK_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user' as const,
          content: createGrammarCheckPrompt(text, language),
        },
      ],
      temperature: GRAMMAR_CHECK_TEMPERATURE,
      reasoning: getReasoning(provider, options.baseURL),
    };

    let parsed: ParsedGrammarResponse;
    if (isOpenAICompatible(provider, options.baseURL)) {
      // Local and router endpoints have patchy json_schema support, so ask for
      // plain text and parse it leniently.
      const { text: responseText } = await generateText(request);
      parsed = parseGrammarResponse(responseText);
    } else {
      try {
        const { output } = await generateText({
          ...request,
          output: Output.object({ schema: grammarResponseSchema }),
        });
        parsed = output;
      } catch (error) {
        // A schema miss shouldn't lose the whole check: salvage what we can.
        if (!NoObjectGeneratedError.isInstance(error) || !error.text) throw error;
        console.error('Structured output failed, falling back to text parsing:', error.message);
        parsed = parseGrammarResponse(error.text);
      }
    }

    const validSuggestions: GrammarSuggestion[] = [];
    for (const s of parsed.suggestions) {
      if (!s.original || !s.replacement) continue;
      // Models' offsets are often wrong or missing; trust them only if they
      // point at the quoted text, otherwise locate it ourselves.
      let startIndex = s.startIndex ?? -1;
      if (startIndex < 0 || text.substring(startIndex, s.endIndex ?? startIndex) !== s.original) {
        startIndex = text.indexOf(s.original);
      }
      if (startIndex < 0) continue;

      validSuggestions.push({
        id: `suggestion-${Date.now()}-${validSuggestions.length}`,
        original: s.original,
        replacement: s.replacement,
        explanation: s.explanation,
        type: s.type,
        startIndex,
        endIndex: startIndex + s.original.length,
      });
    }

    return {
      suggestions: validSuggestions,
      text,
      language: parsed.detectedLanguage || fallbackLanguage,
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
