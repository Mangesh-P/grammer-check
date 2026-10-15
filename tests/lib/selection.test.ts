import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  countWords,
  getFieldSelection,
  getRangeRect,
  isSelectionCurrent,
  replaceFieldSelection,
} from '@/lib/selection';

afterEach(() => {
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

// A selection the test just made, so it can't be null
function current(element: HTMLElement) {
  const selection = getFieldSelection(element);
  if (!selection) throw new Error('expected a selection');
  return selection;
}

function textarea(value: string, start: number, end: number) {
  const el = document.createElement('textarea');
  el.value = value;
  document.body.append(el);
  el.setSelectionRange(start, end);
  return el;
}

function editable(text: string) {
  const el = document.createElement('div');
  el.contentEditable = 'true';
  el.textContent = text;
  document.body.append(el);
  return el;
}

function selectText(node: Node, start: number, end: number) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection() as Selection;
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
}

describe('countWords', () => {
  it.each([
    ['', 0],
    ['   ', 0],
    ['one', 1],
    ['  one two\nthree\t four ', 4],
  ])('%j has %i words', (text, count) => {
    expect(countWords(text)).toBe(count);
  });
});

describe('getFieldSelection', () => {
  it('reads a textarea selection', () => {
    const el = textarea('hello big world', 6, 9);
    expect(getFieldSelection(el)).toEqual({ element: el, text: 'big', start: 6, end: 9 });
  });

  it('returns null for a collapsed textarea selection', () => {
    expect(getFieldSelection(textarea('hello', 2, 2))).toBeNull();
  });

  it('reads a contenteditable selection', () => {
    const el = editable('hello big world');
    selectText(el.firstChild as Node, 6, 9);
    const selection = getFieldSelection(el);
    expect(selection?.text).toBe('big');
    expect(selection?.range).toBeDefined();
  });

  it('returns null when nothing or something outside the element is selected', () => {
    const el = editable('hello');
    expect(getFieldSelection(el)).toBeNull();

    const other = editable('elsewhere');
    selectText(other.firstChild as Node, 0, 4);
    expect(getFieldSelection(el)).toBeNull();
  });
});

describe('getRangeRect', () => {
  it('is null for textarea selections', () => {
    expect(getRangeRect({ element: textarea('ab', 0, 1), text: 'a', start: 0, end: 1 })).toBeNull();
  });

  it('returns the rect only when it has a size', () => {
    const range = document.createRange();
    const sized = { width: 10, height: 0 } as DOMRect;
    vi.spyOn(range, 'getBoundingClientRect').mockReturnValueOnce(sized).mockReturnValueOnce({ width: 0, height: 0 } as DOMRect);
    const selection = { element: editable('x'), text: 'x', range };
    expect(getRangeRect(selection)).toBe(sized);
    expect(getRangeRect(selection)).toBeNull();
  });
});

describe('isSelectionCurrent', () => {
  it('is false once the element is detached', () => {
    const el = textarea('hello world', 0, 5);
    const selection = current(el);
    el.remove();
    expect(isSelectionCurrent(selection)).toBe(false);
  });

  it('is false when the textarea text at the offsets changed', () => {
    const el = textarea('hello world', 0, 5);
    const selection = current(el);
    expect(isSelectionCurrent(selection)).toBe(true);
    el.value = 'jello world';
    expect(isSelectionCurrent(selection)).toBe(false);
  });

  it('is false for a textarea selection without offsets', () => {
    const el = textarea('hello', 0, 0);
    expect(isSelectionCurrent({ element: el, text: 'h' })).toBe(false);
  });

  it('compares the contenteditable range text', () => {
    const el = editable('hello world');
    const range = selectText(el.firstChild as Node, 0, 5);
    expect(isSelectionCurrent({ element: el, text: 'hello', range })).toBe(true);
    expect(isSelectionCurrent({ element: el, text: 'other', range })).toBe(false);
    expect(isSelectionCurrent({ element: el, text: 'hello' })).toBe(false);
  });
});

describe('replaceFieldSelection', () => {
  it('refuses when the field changed since the selection was taken', () => {
    const el = textarea('hello world', 0, 5);
    const selection = current(el);
    el.value = 'changed';
    expect(replaceFieldSelection(selection, 'hi')).toBe(false);
    expect(el.value).toBe('changed');
  });

  it('uses execCommand for textareas when the browser supports it', () => {
    const el = textarea('hello world', 0, 5);
    const selection = current(el);
    const exec = vi.mocked(document.execCommand).mockReturnValue(true);
    expect(replaceFieldSelection(selection, 'hi')).toBe(true);
    expect(exec).toHaveBeenCalledWith('insertText', false, 'hi');
  });

  it('falls back to setRangeText and fires input for textareas', () => {
    const el = textarea('hello world', 0, 5);
    const selection = current(el);
    const onInput = vi.fn();
    el.addEventListener('input', onInput);
    expect(replaceFieldSelection(selection, 'hi')).toBe(true);
    expect(el.value).toBe('hi world');
    expect(onInput).toHaveBeenCalledOnce();
  });

  it('falls back to range insertion for contenteditable', () => {
    const el = editable('hello world');
    selectText(el.firstChild as Node, 6, 11);
    const selection = current(el);
    const onInput = vi.fn();
    el.addEventListener('input', onInput);
    expect(replaceFieldSelection(selection, 'there')).toBe(true);
    expect(el.textContent).toBe('hello there');
    expect(onInput).toHaveBeenCalledOnce();
  });

  it('uses execCommand for contenteditable when supported', () => {
    const el = editable('hello world');
    selectText(el.firstChild as Node, 6, 11);
    const selection = current(el);
    const exec = vi.mocked(document.execCommand).mockReturnValue(true);
    expect(replaceFieldSelection(selection, 'there')).toBe(true);
    expect(exec).toHaveBeenCalledWith('insertText', false, 'there');
  });
});
