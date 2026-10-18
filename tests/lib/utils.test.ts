import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cn,
  debounce,
  escapeHtml,
  generateId,
  getSuggestionColor,
  getSuggestionLabel,
  getTextFromElement,
  isEditableElement,
  setTextInElement,
  visibleLength,
} from '@/lib/utils';
import type { SuggestionType } from '@/types';

function el(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  return wrapper.firstElementChild as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('debounce', () => {
  it('calls once with the latest arguments after the wait', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a');
    debounced('b');
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledExactlyOnceWith('b');
  });
});

describe('generateId', () => {
  it('returns distinct ids', () => {
    expect(generateId()).not.toBe(generateId());
    expect(generateId()).toMatch(/^\d+-[a-z0-9]+$/);
  });
});

describe('suggestion colors and labels', () => {
  it.each([
    ['spelling', '#ef4444', 'Spelling'],
    ['grammar', '#f59e0b', 'Grammar'],
    ['punctuation', '#3b82f6', 'Punctuation'],
    ['style', '#8b5cf6', 'Style'],
    ['other', '#6b7280', 'Issue'],
  ])('%s', (type, color, label) => {
    expect(getSuggestionColor(type as SuggestionType)).toBe(color);
    expect(getSuggestionLabel(type as SuggestionType)).toBe(label);
  });
});

describe('isEditableElement', () => {
  it.each([
    '<textarea></textarea>',
    '<input type="text" name="comment">',
    '<input type="search">',
    '<div contenteditable="true"></div>',
    '<div role="textbox"></div>',
    '<div g_editable="true"></div>',
    // Gmail sets spellcheck="false" on its compose body for its own spellchecker
    '<div g_editable="true" contenteditable="true" spellcheck="false"></div>',
  ])('checks %s', (html) => {
    expect(isEditableElement(el(html))).toBe(true);
  });

  it.each([
    '<input type="password">',
    '<input type="email">',
    '<input type="tel">',
    '<input type="url">',
    '<input type="number">',
    '<input type="text" name="password">',
    '<input type="text" id="card-number">',
    '<input type="text" placeholder="Enter OTP">',
    '<input type="text" aria-label="Username">',
    '<textarea autocomplete="cc-number"></textarea>',
    '<textarea autocomplete="one-time-code"></textarea>',
    '<textarea autocomplete="shipping street-address"></textarea>',
    '<textarea spellcheck="false"></textarea>',
    '<textarea data-gramm="false"></textarea>',
    '<div contenteditable="true" data-enable-grammarly="false"></div>',
    '<div></div>',
    '<div contenteditable="false"></div>',
  ])('skips %s', (html) => {
    expect(isEditableElement(el(html))).toBe(false);
  });

  it('returns false for a missing element', () => {
    expect(isEditableElement(null as unknown as Element)).toBe(false);
  });
});

describe('getTextFromElement / setTextInElement', () => {
  it('reads and writes form control values and fires a bubbling input event', () => {
    const textarea = el('<textarea></textarea>') as HTMLTextAreaElement;
    const onInput = vi.fn();
    document.body.append(textarea);
    document.body.addEventListener('input', onInput);

    setTextInElement(textarea, 'hello');
    expect(textarea.value).toBe('hello');
    expect(getTextFromElement(textarea)).toBe('hello');
    expect(onInput).toHaveBeenCalledOnce();

    const input = el('<input type="text">') as HTMLInputElement;
    setTextInElement(input, 'x');
    expect(getTextFromElement(input)).toBe('x');
  });

  it('reads and writes contenteditable text', () => {
    const div = el('<div contenteditable="true"></div>');
    document.body.append(div);
    const onInput = vi.fn();
    div.addEventListener('input', onInput);

    setTextInElement(div, 'rich text');
    expect(getTextFromElement(div)).toBe('rich text');
    expect(onInput).toHaveBeenCalledOnce();
  });

  it('returns an empty string for an empty contenteditable', () => {
    expect(getTextFromElement(el('<div></div>'))).toBe('');
  });
});

describe('escapeHtml', () => {
  it('escapes markup so model output cannot inject HTML', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)"> & co')).toBe(
      '&lt;img src=x onerror="alert(1)"&gt; &amp; co',
    );
  });
});

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', false, undefined, null, '', 'b')).toBe('a b');
  });
});

describe('visibleLength', () => {
  it('ignores whitespace and zero-width characters left by rich editors', () => {
    expect(visibleLength('\n​  ⁠﻿\t')).toBe(0);
    expect(visibleLength(' a​b c ')).toBe(3);
  });
});
