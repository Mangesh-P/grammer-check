import { replaceFieldSelection } from "@/lib/selection";
import { getTextRange } from "@/lib/text-rects";
import { getTextFromElement, setTextInElement } from "@/lib/utils";
import { MESSAGE_TYPE } from "@/types";
import type { GrammarSuggestion } from "@/types";
import { isContextInvalidated } from "./errors";
import type { ContentState } from "./state";

export function applySuggestion(
  state: ContentState,
  suggestion: GrammarSuggestion
) {
  const element = state.activeElement;
  if (!element) return;

  // Replace only the flagged span through the editing pipeline. Editors with
  // their own model (Lexical on WhatsApp, Draft.js, ProseMirror) revert a
  // whole-field innerText write, but they do handle insertText.
  if (!replaceSpan(element, suggestion)) {
    const text = getTextFromElement(element);
    const newText =
      text.substring(0, suggestion.startIndex) +
      suggestion.replacement +
      text.substring(suggestion.endIndex);
    setTextInElement(element, newText);
  }

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

export async function applyAllSuggestions(state: ContentState) {
  // Work from the end of the text backwards so each replacement leaves the
  // offsets of the ones still to apply untouched. A suggestion overlapping one
  // already applied would edit text that no longer exists, so it is skipped.
  const ordered = [...state.suggestions].sort((a, b) => b.startIndex - a.startIndex);
  // Cleared up front so a second click while we wait can't apply them again
  state.suggestions = [];
  let appliedFrom = Number.POSITIVE_INFINITY;
  for (const suggestion of ordered) {
    if (suggestion.endIndex > appliedFrom) continue;
    // Editors like Lexical (WhatsApp) only pick up a new DOM selection on the
    // async selectionchange event; without a pause every insertText after the
    // first lands at the stale caret instead of the selected span.
    if (appliedFrom !== Number.POSITIVE_INFINITY) await waitForEditor();
    applySuggestion(state, suggestion);
    appliedFrom = suggestion.startIndex;
  }
  state.suggestions = [];
}

function waitForEditor(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function replaceSpan(element: HTMLElement, suggestion: GrammarSuggestion): boolean {
  const { startIndex: start, endIndex: end, original, replacement } = suggestion;
  const tag = element.tagName.toLowerCase();

  if (tag === "textarea" || tag === "input") {
    return replaceFieldSelection({ element, text: original, start, end }, replacement);
  }

  const range = getTextRange(element, start, end);
  if (!range) return false;
  return replaceFieldSelection({ element, text: original, range }, replacement);
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
