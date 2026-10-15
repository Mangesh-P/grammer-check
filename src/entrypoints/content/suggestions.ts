import { getTextFromElement, setTextInElement } from "@/lib/utils";
import { MESSAGE_TYPE } from "@/types";
import type { GrammarSuggestion } from "@/types";
import { isContextInvalidated } from "./errors";
import type { ContentState } from "./state";

export function applySuggestion(
  state: ContentState,
  suggestion: GrammarSuggestion
) {
  if (!state.activeElement) return;

  const text = getTextFromElement(state.activeElement);
  const newText =
    text.substring(0, suggestion.startIndex) +
    suggestion.replacement +
    text.substring(suggestion.endIndex);
  setTextInElement(state.activeElement, newText);

  // Later suggestions shift by however much the replacement changed the length
  const lengthDiff = suggestion.replacement.length - suggestion.original.length;
  state.suggestions = state.suggestions
    .filter((s) => s.id !== suggestion.id)
    .map((s) => {
      if (s.startIndex > suggestion.endIndex) {
        return {
          ...s,
          startIndex: s.startIndex + lengthDiff,
          endIndex: s.endIndex + lengthDiff,
        };
      }
      return s;
    });

  browser.runtime
    .sendMessage({ type: MESSAGE_TYPE.CORRECTION_APPLIED })
    .catch(() => {});
}

export function ignoreSuggestion(
  state: ContentState,
  suggestion: GrammarSuggestion
) {
  state.suggestions = state.suggestions.filter((s) => s.id !== suggestion.id);
}

export async function addToDictionary(state: ContentState, word: string) {
  try {
    await browser.runtime.sendMessage({
      type: MESSAGE_TYPE.ADD_TO_DICTIONARY,
      payload: { word },
    });
  } catch (error) {
    if (isContextInvalidated(state.ctx, error)) return;
    console.error("Failed to add to dictionary:", error);
  }
}
