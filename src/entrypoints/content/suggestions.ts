import { type FieldSelection, insertIntoSelection, replaceFieldSelection, selectField } from "@/lib/selection";
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
  const span = getSpanSelection(element, suggestion);
  if (!span || !replaceFieldSelection(span, suggestion.replacement)) {
    replaceWholeText(element, suggestion);
  }
  finishApply(state, suggestion);
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
    const element = state.activeElement;
    if (!element) return;
    // Editors like Lexical (WhatsApp) only pick up a new DOM selection on the
    // async selectionchange event; inserting straight after selecting lands
    // the text at the stale caret instead of the selected span.
    const span = getSpanSelection(element, suggestion);
    if (span && selectField(span)) {
      await waitForEditor();
      if (!insertIntoSelection(span, suggestion.replacement)) replaceWholeText(element, suggestion);
    } else {
      replaceWholeText(element, suggestion);
    }
    finishApply(state, suggestion);
    appliedFrom = suggestion.startIndex;
  }
  state.suggestions = [];
}

function waitForEditor(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function getSpanSelection(element: HTMLElement, suggestion: GrammarSuggestion): FieldSelection | null {
  const { startIndex: start, endIndex: end, original } = suggestion;
  const tag = element.tagName.toLowerCase();

  if (tag === "textarea" || tag === "input") {
    return { element, text: original, start, end };
  }

  const range = getTextRange(element, start, end);
  return range ? { element, text: original, range } : null;
}

function replaceWholeText(element: HTMLElement, suggestion: GrammarSuggestion) {
  const text = getTextFromElement(element);
  const newText =
    text.substring(0, suggestion.startIndex) +
    suggestion.replacement +
    text.substring(suggestion.endIndex);
  setTextInElement(element, newText);
}

function finishApply(state: ContentState, suggestion: GrammarSuggestion) {
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
