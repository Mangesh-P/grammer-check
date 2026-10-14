// Selection helpers for the "rewrite selected text" menu. They only touch the
// field the user is editing, and every replacement goes through the browser's
// editing pipeline first so the page's own undo stack and frameworks see it.

export interface FieldSelection {
  element: HTMLElement;
  text: string;
  // textarea / input
  start?: number;
  end?: number;
  // contenteditable
  range?: Range;
}

function isTextControl(element: HTMLElement): element is HTMLTextAreaElement | HTMLInputElement {
  const tag = element.tagName.toLowerCase();
  return tag === 'textarea' || tag === 'input';
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Returns the non-empty selection inside `element`, or null.
export function getFieldSelection(element: HTMLElement): FieldSelection | null {
  if (isTextControl(element)) {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    if (start === null || end === null || start === end) return null;
    return { element, text: element.value.substring(start, end), start, end };
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) return null;

  return { element, text: range.toString(), range: range.cloneRange() };
}

// Viewport rectangle of a contenteditable selection. Textarea selections are
// measured by the content script, which already has a mirror-div helper.
export function getRangeRect(selection: FieldSelection): DOMRect | null {
  if (!selection.range) return null;
  const rect = selection.range.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 ? rect : null;
}

// True when the field still holds the selected text at the same place, so a
// late Replace can't overwrite text the user changed while waiting.
export function isSelectionCurrent(selection: FieldSelection): boolean {
  const { element } = selection;
  if (!element.isConnected) return false;

  if (isTextControl(element)) {
    const { start, end } = selection;
    if (start === undefined || end === undefined) return false;
    return element.value.substring(start, end) === selection.text;
  }
  return selection.range?.toString() === selection.text;
}

// Replaces the selected text and returns false when the field changed since
// the selection was taken.
export function replaceFieldSelection(selection: FieldSelection, replacement: string): boolean {
  if (!isSelectionCurrent(selection)) return false;
  const { element } = selection;

  element.focus();

  if (isTextControl(element)) {
    const { start, end } = selection;
    if (start === undefined || end === undefined) return false;
    element.setSelectionRange(start, end);

    // execCommand keeps native undo (Ctrl+Z); it's deprecated but still the
    // only way to get that, so fall back to setRangeText when it's refused.
    if (!document.execCommand('insertText', false, replacement)) {
      element.setRangeText(replacement, start, end, 'end');
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return true;
  }

  const range = selection.range;
  if (!range) return false;
  const domSelection = window.getSelection();
  if (domSelection) {
    domSelection.removeAllRanges();
    domSelection.addRange(range);
  }

  if (!document.execCommand('insertText', false, replacement)) {
    range.deleteContents();
    const node = document.createTextNode(replacement);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    domSelection?.removeAllRanges();
    domSelection?.addRange(range);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return true;
}
