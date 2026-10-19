import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAllSuggestions, applySuggestion } from '@/entrypoints/content/suggestions';
import type { ContentState } from '@/entrypoints/content/state';
import type { GrammarSuggestion } from '@/types';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const suggestion: GrammarSuggestion = {
  id: '1',
  original: 'can benefits',
  replacement: 'can benefit',
  explanation: '',
  type: 'grammar',
  startIndex: 4,
  endIndex: 16,
};

function stateFor(element: HTMLElement) {
  return { activeElement: element, suggestions: [suggestion] } as unknown as ContentState;
}

describe('applySuggestion', () => {
  it('replaces only the flagged span via insertText in a contenteditable', () => {
    // Lexical-style markup: the text lives in nested spans the editor owns
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.innerHTML = '<p><span>You can benefits from it</span></p>';
    document.body.append(el);
    const span = el.querySelector('span');

    const exec = vi.fn((_cmd: string, _ui: boolean, value?: string) => {
      const range = window.getSelection()?.getRangeAt(0);
      expect(range?.toString()).toBe('can benefits');
      range?.deleteContents();
      range?.insertNode(document.createTextNode(value ?? ''));
      return true;
    });
    document.execCommand = exec as unknown as typeof document.execCommand;

    applySuggestion(stateFor(el), suggestion);

    expect(exec).toHaveBeenCalledWith('insertText', false, 'can benefit');
    expect(el.textContent).toBe('You can benefit from it');
    // The editor's own nodes were kept, not replaced by an innerText write
    expect(el.querySelector('span')).toBe(span);
  });

  it('falls back to rewriting the field when the span no longer matches', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.textContent = 'You can benefits from it';
    document.body.append(el);
    const exec = vi.fn(() => true);
    document.execCommand = exec as unknown as typeof document.execCommand;

    applySuggestion(stateFor(el), { ...suggestion, startIndex: 0, endIndex: 12 });

    expect(exec).not.toHaveBeenCalled();
  });

  it('uses setRangeText in a textarea when execCommand is refused', () => {
    const el = document.createElement('textarea');
    el.value = 'You can benefits from it';
    document.body.append(el);
    document.execCommand = vi.fn(() => false) as unknown as typeof document.execCommand;

    applySuggestion(stateFor(el), suggestion);

    expect(el.value).toBe('You can benefit from it');
  });
});

describe('applyAllSuggestions', () => {
  it('applies every suggestion back to front and skips overlapping ones', async () => {
    const el = document.createElement('textarea');
    el.value = 'Me and him has to returns soon';
    document.body.append(el);
    document.execCommand = vi.fn(() => false) as unknown as typeof document.execCommand;

    const make = (id: string, original: string, replacement: string, start: number) => ({
      ...suggestion,
      id,
      original,
      replacement,
      startIndex: start,
      endIndex: start + original.length,
    });
    const state = {
      activeElement: el,
      suggestions: [
        make('a', 'Me and him has', 'He and I have', 0),
        make('b', 'to returns', 'to return', 15),
        make('c', 'returns', 'return', 18), // overlaps 'b'
      ],
    } as unknown as ContentState;

    await applyAllSuggestions(state);

    expect(el.value).toBe('He and I have to return soon');
    expect(state.suggestions).toEqual([]);
  });

  it('lets the editor catch up between replacements in a contenteditable', async () => {
    // Mimics Lexical: insertText goes to the editor's own selection, which only
    // follows the DOM selection once a later task (selectionchange) has run.
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.textContent = 'Me and him has to returns soon';
    document.body.append(el);
    let editorRange: Range | null = null;
    let syncScheduled = false;
    vi.spyOn(Selection.prototype, 'addRange').mockImplementation(function (this: Selection, range: Range) {
      syncScheduled = true;
      setTimeout(() => {
        editorRange = range;
        syncScheduled = false;
      }, 0);
    });
    document.execCommand = vi.fn((_cmd: string, _ui: boolean, value?: string) => {
      expect(syncScheduled).toBe(false);
      editorRange?.deleteContents();
      editorRange?.insertNode(document.createTextNode(value ?? ''));
      el.normalize();
      return true;
    }) as unknown as typeof document.execCommand;
    // The first edit has no pause before it, so seed the editor's selection
    const make = (id: string, original: string, replacement: string, start: number) => ({
      ...suggestion,
      id,
      original,
      replacement,
      startIndex: start,
      endIndex: start + original.length,
    });
    const state = {
      activeElement: el,
      suggestions: [make('a', 'Me and him has', 'He and I have', 0), make('b', 'to returns', 'to return', 15)],
    } as unknown as ContentState;
    const first = document.createRange();
    first.setStart(el.firstChild as Text, 15);
    first.setEnd(el.firstChild as Text, 25);
    editorRange = first;

    await applyAllSuggestions(state);

    expect(el.textContent).toBe('He and I have to return soon');
  });
});
