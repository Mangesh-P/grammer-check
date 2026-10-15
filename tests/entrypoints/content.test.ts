import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import content from '@/entrypoints/content';
import { settingsStorage } from '@/lib/storage';
import { DEFAULT_SETTINGS, MESSAGE_TYPE } from '@/types';
import type { GrammarCheckResult, GrammarSuggestion, Message, Settings } from '@/types';

const DELAY = DEFAULT_SETTINGS.realtimeDelay;

type Responder = (message: Message) => unknown;
let respond: Responder;
let sendMessage: ReturnType<typeof vi.fn>;
let teardown: (() => void)[] = [];

function suggestion(text: string, original: string, replacement: string, extra: Partial<GrammarSuggestion> = {}) {
  const startIndex = text.indexOf(original);
  return {
    id: `${original}-${startIndex}`,
    original,
    replacement,
    explanation: `Use "${replacement}"`,
    type: 'grammar',
    startIndex,
    endIndex: startIndex + original.length,
    ...extra,
  } satisfies GrammarSuggestion;
}

function checkResult(text: string, suggestions: GrammarSuggestion[]): { success: true; result: GrammarCheckResult } {
  return { success: true, result: { text, suggestions, language: 'en', timestamp: 0 } };
}

function sent(type: string) {
  return sendMessage.mock.calls.map(([m]) => m as Message).filter((m) => m.type === type);
}

function shadow(): ShadowRoot | null {
  return document.getElementById('grammar-check-overlay')?.shadowRoot ?? null;
}

function $(selector: string) {
  return shadow()?.querySelector<HTMLElement>(selector) ?? null;
}

async function start(settings: Partial<Settings> = {}) {
  await settingsStorage.setValue({ ...DEFAULT_SETTINGS, ...settings });
  const invalidated: (() => void)[] = [];
  const ctx = {
    addEventListener: (target: EventTarget, type: string, cb: EventListener, options?: AddEventListenerOptions) =>
      target.addEventListener(type, cb, options),
    onInvalidated: (cb: () => void) => invalidated.push(cb),
  };
  await content.main(ctx as never);
  const invalidate = () => {
    for (const cb of invalidated) cb();
  };
  return invalidate;
}

function addTextarea(value = '', attrs: Record<string, string> = {}) {
  const el = document.createElement('textarea');
  el.value = value;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.append(el);
  return el;
}

// New fields are picked up on the next animation frame, which (re)starts the real-time
// debounce, so let that happen before the test starts typing
async function addField() {
  const el = addTextarea();
  await vi.advanceTimersByTimeAsync(20);
  el.focus();
  return el;
}

function type(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

// Lets awaited sendMessage promises settle between timer steps
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});

  // happy-dom has no layout; give everything a size so underlines and menus get placed
  const rect = () => new DOMRect(20, 40, 100, 18);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(rect);
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(rect);
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(() => [rect()] as unknown as DOMRectList);

  respond = (message) => {
    if (message.type === MESSAGE_TYPE.CHECK_GRAMMAR) {
      const { text } = message.payload as { text: string };
      return checkResult(text, []);
    }
    return { success: true };
  };
  sendMessage = vi.fn(async (message: Message) => respond(message));
  fakeBrowser.runtime.sendMessage = sendMessage as never;

  // The script listens on document/window; remove those listeners after each test so
  // instances from earlier tests don't react to later ones
  teardown = [];
  for (const target of [document, window] as EventTarget[]) {
    const add = target.addEventListener.bind(target);
    vi.spyOn(target, 'addEventListener').mockImplementation((type, cb, options) => {
      add(type, cb, options);
      teardown.push(() => target.removeEventListener(type, cb, options));
    });
  }
});

afterEach(() => {
  for (const remove of teardown) remove();
  document.body.innerHTML = '';
});

describe('field detection', () => {
  it('checks text fields that already exist when the script starts', async () => {
    addTextarea('This are a long sentence.');
    const invalidate = await start();
    await vi.advanceTimersByTimeAsync(DELAY + 20);
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toEqual([
      { type: MESSAGE_TYPE.CHECK_GRAMMAR, payload: { text: 'This are a long sentence.', forceCheck: false } },
    ]);
    invalidate();
  });

  it('checks fields added later, including inside open shadow roots', async () => {
    const invalidate = await start();
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<textarea></textarea>';
    (root.querySelector('textarea') as HTMLTextAreaElement).value = 'Shadow text with an eror.';
    await vi.advanceTimersByTimeAsync(DELAY + 50);

    const added = document.createElement('div');
    added.innerHTML = '<textarea>Added later and wrong.</textarea>';
    document.body.append(added);
    await vi.advanceTimersByTimeAsync(DELAY + 50);

    const texts = sent(MESSAGE_TYPE.CHECK_GRAMMAR).map((m) => (m.payload as { text: string }).text);
    expect(texts).toContain('Added later and wrong.');
    invalidate();
  });

  it('picks up an element that becomes contenteditable', async () => {
    const div = document.createElement('div');
    div.textContent = 'Now editable and wrong.';
    document.body.append(div);
    const invalidate = await start();
    div.setAttribute('contenteditable', 'true');
    await vi.advanceTimersByTimeAsync(DELAY + 50);
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toHaveLength(1);
    invalidate();
  });

  it.each([
    ['password', () => Object.assign(document.createElement('input'), { type: 'password' })],
    ['email', () => Object.assign(document.createElement('input'), { type: 'email' })],
    ['credit card', () => Object.assign(document.createElement('textarea'), { autocomplete: 'cc-number' })],
    ['opted-out', () => {
      const el = document.createElement('textarea');
      el.setAttribute('data-gramm', 'false');
      return el;
    }],
  ])('never reads a %s field', async (_label, create) => {
    const invalidate = await start();
    const el = create() as HTMLInputElement;
    document.body.append(el);
    el.focus();
    type(el, 'secret value that is long');
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toEqual([]);
    expect(shadow()).toBeNull();
    invalidate();
  });
});

describe('real-time checking', () => {
  it('debounces typing, underlines issues and shows the count', async () => {
    const invalidate = await start();
    const el = await addField();
    const text = 'She go to school.';
    respond = () => checkResult(text, [suggestion(text, 'go', 'goes')]);

    type(el, 'She go to');
    await vi.advanceTimersByTimeAsync(100);
    type(el, text);
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toHaveLength(1);
    expect(shadow()?.querySelectorAll('.tc-underline')).toHaveLength(1);
    const status = $('.tc-status-btn') as HTMLElement;
    expect(status.classList.contains('tc-has-errors')).toBe(true);
    expect(status.getAttribute('aria-label')).toBe('Grammar Check: 1 issue found. Click to see details.');
    invalidate();
  });

  it('shows a spinner while checking and a clean state when there are no issues', async () => {
    let resolve!: (v: unknown) => void;
    respond = () => new Promise((r) => (resolve = r));
    const invalidate = await start();
    const el = await addField();
    type(el, 'All good here, really.');
    await vi.advanceTimersByTimeAsync(DELAY);
    expect($('.tc-status-btn')?.classList.contains('tc-loading')).toBe(true);
    expect($('.tc-status-label')?.textContent).toBe('Grammar Check');

    resolve(checkResult('All good here, really.', []));
    await flush();
    expect($('.tc-status-btn')?.classList.contains('tc-no-errors')).toBe(true);
    invalidate();
  });

  it('cleans up instead of checking text that is too short', async () => {
    const text = 'Long enough to be checked.';
    respond = () => checkResult(text, [suggestion(text, 'Long', 'Lengthy')]);
    const invalidate = await start();
    const el = await addField();
    type(el, text);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect($('.tc-underline')).not.toBeNull();

    type(el, 'short');
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(shadow()).toBeNull();
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toHaveLength(1);
    invalidate();
  });

  it('shows the error when a check fails', async () => {
    respond = () => ({ success: false, error: 'No API key configured for google.' });
    const invalidate = await start();
    const el = await addField();
    type(el, 'Some text to check here.');
    await vi.advanceTimersByTimeAsync(DELAY);

    const status = $('.tc-status-btn') as HTMLElement;
    expect(status.classList.contains('tc-check-failed')).toBe(true);
    expect(status.title).toBe('Grammar Check failed: No API key configured for google.');
    expect($('.tc-status-label')?.textContent).toBe('Grammar Check failed');
    invalidate();
  });

  it('reports a missing response', async () => {
    respond = () => undefined;
    const invalidate = await start();
    const el = await addField();
    type(el, 'Some text to check here.');
    await vi.advanceTimersByTimeAsync(DELAY);
    expect($('.tc-status-btn')?.title).toBe('Grammar Check failed: No response from the extension');
    invalidate();
  });

  it('drops a stale result and rechecks the latest text', async () => {
    const resolvers: ((v: unknown) => void)[] = [];
    respond = () => new Promise((r) => resolvers.push(r));
    const invalidate = await start();
    const el = await addField();
    type(el, 'First version of text.');
    await vi.advanceTimersByTimeAsync(DELAY);

    // Changed while the first request is in flight
    el.value = 'Second version of text.';
    const stale = 'First version of text.';
    resolvers[0](checkResult(stale, [suggestion(stale, 'First', 'Initial')]));
    await flush();
    expect($('.tc-underline')).toBeNull();

    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR).map((m) => (m.payload as { text: string }).text)).toEqual([
      stale,
      'Second version of text.',
    ]);
    resolvers[1](checkResult('Second version of text.', []));
    await flush();
    expect($('.tc-status-btn')?.classList.contains('tc-no-errors')).toBe(true);
    invalidate();
  });

  it('queues a check requested while another is in flight', async () => {
    const resolvers: ((v: unknown) => void)[] = [];
    respond = () => new Promise((r) => resolvers.push(r));
    const invalidate = await start();
    const el = await addField();
    type(el, 'Text being checked now.');
    await vi.advanceTimersByTimeAsync(DELAY);
    type(el, 'Text being checked now!');
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toHaveLength(1);

    resolvers[0](checkResult('Text being checked now.', []));
    await flush();
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toHaveLength(2);
    invalidate();
  });

  it('checks contenteditable fields', async () => {
    const invalidate = await start();
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.append(div);
    await vi.advanceTimersByTimeAsync(20);
    div.focus();
    const text = 'Rich text is wrongg.';
    respond = () => checkResult(text, [suggestion(text, 'wrongg', 'wrong', { type: 'spelling' })]);
    div.textContent = text;
    div.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(DELAY);
    expect($('.tc-underline')).not.toBeNull();
    invalidate();
  });
});

describe('suggestion panel', () => {
  const text = 'I has a apple and a orange.';
  const suggestions = () => [
    suggestion(text, 'has', 'have'),
    suggestion(text, 'a apple', 'an apple'),
    suggestion(text, 'a orange', 'an orange', { type: 'spelling' }),
  ];

  async function openPanel() {
    respond = (m) => (m.type === MESSAGE_TYPE.CHECK_GRAMMAR ? checkResult(text, suggestions()) : { success: true });
    const invalidate = await start();
    const el = await addField();
    type(el, text);
    await vi.advanceTimersByTimeAsync(DELAY);
    ($('.tc-status-btn') as HTMLElement).click();
    return { el, invalidate };
  }

  it('lists all issues', async () => {
    const { invalidate } = await openPanel();
    expect($('.tc-panel-title')?.textContent).toContain('3 issues found');
    expect(shadow()?.querySelectorAll('.tc-suggestion-card')).toHaveLength(3);
    // "Add to dictionary" only for spelling
    expect(shadow()?.querySelectorAll('[data-action="dictionary"]')).toHaveLength(1);
    invalidate();
  });

  it('applies a fix, shifts later offsets and counts the correction', async () => {
    const { el, invalidate } = await openPanel();
    ($('[data-action="apply"][data-index="0"]') as HTMLElement).click();
    expect(el.value).toBe('I have a apple and a orange.');
    expect(sent(MESSAGE_TYPE.CORRECTION_APPLIED)).toHaveLength(1);
    expect($('.tc-panel-title')?.textContent).toContain('2 issues found');

    // The second fix lands in the right place even though the text grew
    ($('[data-action="apply"][data-index="0"]') as HTMLElement).click();
    expect(el.value).toBe('I have an apple and a orange.');
    invalidate();
  });

  it('ignores, adds to the dictionary and goes clean when nothing is left', async () => {
    const { invalidate } = await openPanel();
    ($('[data-action="dictionary"]') as HTMLElement).click();
    await flush();
    expect(sent(MESSAGE_TYPE.ADD_TO_DICTIONARY)).toEqual([
      { type: MESSAGE_TYPE.ADD_TO_DICTIONARY, payload: { word: 'a orange' } },
    ]);
    ($('[data-action="ignore"]') as HTMLElement).click();
    expect($('.tc-panel-title')?.textContent).toContain('1 issue found');
    ($('[data-action="ignore"]') as HTMLElement).click();
    expect($('.tc-panel')).toBeNull();
    expect($('.tc-status-btn')?.classList.contains('tc-no-errors')).toBe(true);
    invalidate();
  });

  it('logs a failed dictionary add without breaking', async () => {
    const { invalidate } = await openPanel();
    sendMessage.mockRejectedValueOnce(new Error('gone'));
    ($('[data-action="dictionary"]') as HTMLElement).click();
    await flush();
    expect(console.error).toHaveBeenCalledWith('Failed to add to dictionary:', expect.any(Error));
    invalidate();
  });

  it('closes with the close button, an outside click, or the status button', async () => {
    const { invalidate } = await openPanel();
    ($('[data-action="close-panel"]') as HTMLElement).click();
    expect($('.tc-panel')).toBeNull();

    ($('.tc-status-btn') as HTMLElement).click();
    expect($('.tc-panel')).not.toBeNull();
    ($('.tc-status-btn') as HTMLElement).click();
    expect($('.tc-panel')).toBeNull();

    ($('.tc-status-btn') as HTMLElement).click();
    await vi.advanceTimersByTimeAsync(20);
    // Clicks inside the panel keep it open
    ($('.tc-panel') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    ($('.tc-suggestion-card') as HTMLElement).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect($('.tc-panel')).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect($('.tc-panel')).toBeNull();
    invalidate();
  });

  it('escapes model output', async () => {
    const evil = 'Fix <img src=x onerror=alert(1)> now.';
    respond = () =>
      checkResult(evil, [suggestion(evil, '<img src=x onerror=alert(1)>', '<b>bold</b>', { explanation: '<script>x</script>' })]);
    const invalidate = await start();
    const el = await addField();
    type(el, evil);
    await vi.advanceTimersByTimeAsync(DELAY);
    ($('.tc-status-btn') as HTMLElement).click();

    const panel = $('.tc-panel') as HTMLElement;
    expect(panel.querySelector('img, b, script')).toBeNull();
    expect(panel.querySelector('.tc-replacement')?.textContent).toBe('<b>bold</b>');
    expect(panel.querySelector('.tc-explanation')?.textContent).toBe('<script>x</script>');
    invalidate();
  });
});

describe('edge cases', () => {
  it('keeps earlier offsets when a later fix is applied, and ignores clicks between buttons', async () => {
    const text = 'I has a apple.';
    respond = (m) =>
      m.type === MESSAGE_TYPE.CHECK_GRAMMAR
        ? checkResult(text, [suggestion(text, 'has', 'have'), suggestion(text, 'a apple', 'an apple')])
        : { success: true };
    const invalidate = await start();
    const el = await addField();
    type(el, text);
    await vi.advanceTimersByTimeAsync(DELAY);
    ($('.tc-status-btn') as HTMLElement).click();

    ($('.tc-panel-body') as HTMLElement).click();
    expect($('.tc-panel-title')?.textContent).toContain('2 issues found');

    ($('[data-action="apply"][data-index="1"]') as HTMLElement).click();
    ($('[data-action="apply"][data-index="0"]') as HTMLElement).click();
    expect(el.value).toBe('I have an apple.');
    invalidate();
  });

  it('does nothing when the clean status button is clicked', async () => {
    const invalidate = await start();
    const el = await addField();
    type(el, 'Nothing wrong with this.');
    await vi.advanceTimersByTimeAsync(DELAY);
    ($('.tc-status-btn') as HTMLElement).click();
    expect($('.tc-panel')).toBeNull();
    invalidate();
  });

  it('underlines text that spans several nodes in a contenteditable', async () => {
    const invalidate = await start();
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.innerHTML = '<b>First part</b> and the <i>wrongg</i> word.';
    document.body.append(div);
    await vi.advanceTimersByTimeAsync(20);
    div.focus();
    const text = div.textContent as string;
    respond = () => checkResult(text, [suggestion(text, 'wrongg', 'wrong', { type: 'spelling' })]);
    div.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(DELAY);
    expect($('.tc-underline')).not.toBeNull();
    invalidate();
  });

  it('keeps its UI inside a small viewport when the field is near the bottom-right corner', async () => {
    vi.mocked(Element.prototype.getBoundingClientRect).mockImplementation(() => new DOMRect(700, 560, 90, 30));
    vi.mocked(Range.prototype.getClientRects).mockImplementation(
      () => [new DOMRect(700, 560, 90, 30)] as unknown as DOMRectList,
    );
    Object.assign(window, { innerWidth: 800, innerHeight: 600 });
    const text = 'Sentense near the edge.';
    respond = (m) =>
      m.type === MESSAGE_TYPE.CHECK_GRAMMAR
        ? checkResult(text, [suggestion(text, 'Sentense', 'Sentence', { type: 'spelling' })])
        : { success: true, result: 'A sentence near the edge.' };
    const invalidate = await start();
    const el = await addField();
    type(el, text);
    await vi.advanceTimersByTimeAsync(DELAY);

    // Status button flips above the field
    expect(parseFloat(($('.tc-status-btn') as HTMLElement).style.top)).toBeLessThan(560);

    ($('.tc-status-btn') as HTMLElement).click();
    expect(parseFloat(($('.tc-panel') as HTMLElement).style.top)).toBeLessThan(560);

    ($('.tc-underline') as HTMLElement).click();
    const popover = $('.tc-popover') as HTMLElement;
    expect(popover.style.bottom).not.toBe('');
    expect(parseFloat(popover.style.left)).toBe(800 - 310);

    el.setSelectionRange(0, text.length);
    document.dispatchEvent(new Event('selectionchange'));
    await vi.advanceTimersByTimeAsync(150);
    ($('.tc-rewrite-trigger') as HTMLElement).click();
    const item = [...(shadow()?.querySelectorAll<HTMLElement>('.tc-rewrite-item') ?? [])][0];
    item.click();
    await flush();
    expect($('.tc-rewrite-card')).not.toBeNull();
    invalidate();
    // happy-dom's default window size
    Object.assign(window, { innerWidth: 1024, innerHeight: 768 });
  });
});

describe('underline popover', () => {
  async function openPopover(type_: GrammarSuggestion['type'] = 'spelling') {
    const text = 'Thiss is a sentence.';
    respond = (m) =>
      m.type === MESSAGE_TYPE.CHECK_GRAMMAR
        ? checkResult(text, [suggestion(text, 'Thiss', 'This', { type: type_ })])
        : { success: true };
    const invalidate = await start();
    const el = await addField();
    type(el, text);
    await vi.advanceTimersByTimeAsync(DELAY);
    const underline = $('.tc-underline') as HTMLElement;
    underline.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    underline.click();
    return { el, invalidate };
  }

  it('applies from the popover', async () => {
    const { el, invalidate } = await openPopover();
    expect($('.tc-popover .tc-replacement')?.textContent).toBe('This');
    ($('.tc-popover [data-action="apply"]') as HTMLElement).click();
    expect(el.value).toBe('This is a sentence.');
    expect($('.tc-popover')).toBeNull();
    expect($('.tc-status-btn')?.classList.contains('tc-no-errors')).toBe(true);
    invalidate();
  });

  it('ignores from the popover', async () => {
    const { el, invalidate } = await openPopover('grammar');
    expect($('.tc-popover [data-action="dictionary"]')).toBeNull();
    ($('.tc-popover [data-action="ignore"]') as HTMLElement).click();
    expect(el.value).toBe('Thiss is a sentence.');
    expect($('.tc-underline')).toBeNull();
    invalidate();
  });

  it('adds to the dictionary from the popover', async () => {
    const { invalidate } = await openPopover();
    ($('.tc-popover [data-action="dictionary"]') as HTMLElement).click();
    await flush();
    expect(sent(MESSAGE_TYPE.ADD_TO_DICTIONARY)).toHaveLength(1);
    expect($('.tc-popover')).toBeNull();
    invalidate();
  });

  it('closes on an outside click but not on clicks inside it or on an underline', async () => {
    const { invalidate } = await openPopover();
    await vi.advanceTimersByTimeAsync(150);
    ($('.tc-popover') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    ($('.tc-underline') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { composed: true }));
    expect($('.tc-popover')).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect($('.tc-popover')).toBeNull();
    invalidate();
  });
});

describe('lifecycle and settings', () => {
  it('cleans up when the field loses focus', async () => {
    const text = 'She go to school.';
    respond = () => checkResult(text, [suggestion(text, 'go', 'goes')]);
    const invalidate = await start();
    const el = await addField();
    type(el, text);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(shadow()).not.toBeNull();

    el.blur();
    await vi.advanceTimersByTimeAsync(300);
    expect(shadow()).toBeNull();
    invalidate();
  });

  it('re-renders underlines on scroll and resize', async () => {
    const text = 'She go to school.';
    respond = () => checkResult(text, [suggestion(text, 'go', 'goes')]);
    const invalidate = await start();
    const el = await addField();
    type(el, text);
    await vi.advanceTimersByTimeAsync(DELAY);
    const before = $('.tc-underline');
    window.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(60);
    expect($('.tc-underline')).not.toBe(before);
    const afterScroll = $('.tc-underline');
    window.dispatchEvent(new Event('resize'));
    expect($('.tc-underline')).not.toBe(afterScroll);
    invalidate();
  });

  it('does nothing while disabled', async () => {
    const invalidate = await start({ enabled: false });
    const el = await addField();
    type(el, 'Plenty of text to check.');
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toEqual([]);
    invalidate();
  });

  it('removes its UI when disabled from the popup', async () => {
    const text = 'She go to school.';
    respond = () => checkResult(text, [suggestion(text, 'go', 'goes')]);
    const invalidate = await start();
    const el = await addField();
    type(el, text);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(shadow()).not.toBeNull();

    await settingsStorage.setValue({ ...DEFAULT_SETTINGS, enabled: false });
    expect(shadow()).toBeNull();
    invalidate();
  });

  it('only checks on the keyboard shortcut in on-demand mode', async () => {
    const invalidate = await start({ checkMode: 'ondemand' });
    const el = await addField();
    type(el, 'Plenty of text to check.');
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toEqual([]);

    await fakeBrowser.runtime.onMessage.trigger({ type: 'SOMETHING_ELSE' }, {}, () => {});
    await fakeBrowser.runtime.onMessage.trigger({ type: MESSAGE_TYPE.TRIGGER_CHECK }, {}, () => {});
    await flush();
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toEqual([
      { type: MESSAGE_TYPE.CHECK_GRAMMAR, payload: { text: 'Plenty of text to check.', forceCheck: true } },
    ]);
    invalidate();
  });

  it('ignores the shortcut without an active field', async () => {
    const invalidate = await start();
    await fakeBrowser.runtime.onMessage.trigger({ type: MESSAGE_TYPE.TRIGGER_CHECK }, {}, () => {});
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toEqual([]);
    invalidate();
  });

  it('falls back to defaults when settings cannot be loaded or watched', async () => {
    vi.spyOn(settingsStorage, 'getValue').mockRejectedValueOnce(new Error('no storage'));
    vi.spyOn(settingsStorage, 'watch').mockImplementationOnce(() => {
      throw new Error('no watch');
    });
    const invalidate = await start();
    expect(console.error).toHaveBeenCalledWith('Failed to load settings:', expect.any(Error));
    expect(console.error).toHaveBeenCalledWith('Failed to watch settings:', expect.any(Error));
    const el = await addField();
    type(el, 'Plenty of text to check.');
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toHaveLength(1);
    invalidate();
  });

  it('removes everything when the extension is reloaded', async () => {
    const text = 'She go to school.';
    respond = () => checkResult(text, [suggestion(text, 'go', 'goes')]);
    const invalidate = await start();
    const el = await addField();
    type(el, text);
    await vi.advanceTimersByTimeAsync(DELAY);
    invalidate();
    expect(shadow()).toBeNull();

    // No longer reacts to settings changes or new fields
    addTextarea('Another field with text.');
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toHaveLength(1);
  });
});

describe('rewrite menu', () => {
  const text = 'please send me the report today';

  async function selectWords(settings: Partial<Settings> = {}, start_ = 0, end = text.length) {
    respond = (m) => {
      if (m.type === MESSAGE_TYPE.CHECK_GRAMMAR) return checkResult((m.payload as { text: string }).text, []);
      if (m.type === MESSAGE_TYPE.REWRITE_TEXT) return { success: true, result: 'Please send me the report today.' };
      return { success: true };
    };
    const invalidate = await start(settings);
    const el = addTextarea();
    el.value = text;
    el.focus();
    el.setSelectionRange(start_, end);
    document.dispatchEvent(new Event('selectionchange'));
    await vi.advanceTimersByTimeAsync(150);
    return { el, invalidate };
  }

  function menuItem(label: string) {
    return [...(shadow()?.querySelectorAll<HTMLElement>('.tc-rewrite-item') ?? [])].find(
      (item) => item.textContent?.trim() === label,
    ) as HTMLElement;
  }

  it('shows a trigger only for selections of three or more words', async () => {
    const { el, invalidate } = await selectWords({}, 0, 'please send'.length);
    expect($('.tc-rewrite-trigger')).toBeNull();

    el.setSelectionRange(0, 'please send me'.length);
    document.dispatchEvent(new Event('selectionchange'));
    await vi.advanceTimersByTimeAsync(150);
    expect($('.tc-rewrite-trigger')?.getAttribute('aria-label')).toBe('Grammar Check: rewrite selection');

    // A new selection repositions the same trigger; a short one hides it
    const trigger = $('.tc-rewrite-trigger');
    el.setSelectionRange(0, text.length);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
    await vi.advanceTimersByTimeAsync(150);
    expect($('.tc-rewrite-trigger')).toBe(trigger);
    el.setSelectionRange(0, 2);
    document.dispatchEvent(new MouseEvent('mouseup'));
    await vi.advanceTimersByTimeAsync(150);
    expect($('.tc-rewrite-trigger')).toBeNull();
    invalidate();
  });

  it('stays hidden when the rewrite menu is turned off', async () => {
    const { invalidate } = await selectWords({ rewriteMenu: false });
    expect($('.tc-rewrite-trigger')).toBeNull();
    invalidate();
  });

  it('sends nothing until an action is picked, then previews and replaces only the selection', async () => {
    const { el, invalidate } = await selectWords({}, 0, text.length);
    ($('.tc-rewrite-trigger') as HTMLElement).click();
    expect($('.tc-rewrite-menu')?.getAttribute('role')).toBe('menu');
    expect(sent(MESSAGE_TYPE.REWRITE_TEXT)).toEqual([]);

    menuItem('Formalize').click();
    expect($('.tc-rewrite-loading')?.textContent).toContain('Rewriting…');
    await flush();
    expect(sent(MESSAGE_TYPE.REWRITE_TEXT)).toEqual([
      { type: MESSAGE_TYPE.REWRITE_TEXT, payload: { text, style: 'formal' } },
    ]);
    expect($('.tc-rewrite-card-style')?.textContent).toBe('Formalize');
    expect($('.tc-rewrite-result')?.textContent).toBe('Please send me the report today.');

    ($('[data-action="replace"]') as HTMLElement).click();
    expect(el.value).toBe('Please send me the report today.');
    expect($('.tc-rewrite-card')).toBeNull();
    invalidate();
  });

  it('refuses to replace text that changed while waiting', async () => {
    const { el, invalidate } = await selectWords();
    ($('.tc-rewrite-trigger') as HTMLElement).click();
    menuItem('Shorten').click();
    await flush();
    el.value = 'something else entirely now';
    ($('[data-action="replace"]') as HTMLElement).click();
    expect($('.tc-rewrite-error')?.textContent).toMatch(/text changed/);
    expect(el.value).toBe('something else entirely now');
    invalidate();
  });

  it('copies the result', async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { invalidate } = await selectWords();
    ($('.tc-rewrite-trigger') as HTMLElement).click();
    menuItem('Friendly').click();
    await flush();
    const copy = $('[data-action="copy"]') as HTMLElement;
    copy.click();
    await flush();
    expect(writeText).toHaveBeenCalledWith('Please send me the report today.');
    expect(copy.textContent).toBe('Copied');
    copy.click();
    await flush();
    expect(copy.textContent).toBe('Copy failed');
    invalidate();
  });

  it('shows errors with a working Try again', async () => {
    const { invalidate } = await selectWords();
    let fail = true;
    const base = respond;
    respond = (m) => (m.type === MESSAGE_TYPE.REWRITE_TEXT && fail ? { success: false, error: 'Rate limited' } : base(m));
    ($('.tc-rewrite-trigger') as HTMLElement).click();
    menuItem('Formalize').click();
    await flush();
    expect($('.tc-rewrite-error')?.textContent).toBe('Rate limited');
    expect($('.tc-rewrite-error')?.getAttribute('role')).toBe('alert');

    fail = false;
    ($('[data-action="retry"]') as HTMLElement).click();
    await flush();
    expect($('.tc-rewrite-result')).not.toBeNull();
    expect(sent(MESSAGE_TYPE.REWRITE_TEXT)).toHaveLength(2);
    invalidate();
  });

  it('reports a thrown error', async () => {
    const { invalidate } = await selectWords();
    respond = () => {
      throw new Error('Extension context invalidated');
    };
    ($('.tc-rewrite-trigger') as HTMLElement).click();
    menuItem('Formalize').click();
    await flush();
    expect($('.tc-rewrite-error')?.textContent).toBe('Extension context invalidated');
    invalidate();
  });

  it('says so when proofreading finds nothing to change', async () => {
    const { invalidate } = await selectWords();
    respond = (m) => (m.type === MESSAGE_TYPE.REWRITE_TEXT ? { success: true, result: ` ${text} ` } : { success: true });
    ($('.tc-rewrite-trigger') as HTMLElement).click();
    menuItem('Proofread').click();
    expect($('.tc-rewrite-loading')?.textContent).toContain('Proofreading…');
    await flush();
    expect($('.tc-rewrite-unchanged')?.textContent).toBe('No changes needed. This text looks good.');
    expect($('[data-action="replace"]')).toBeNull();
    invalidate();
  });

  it('translates to the picked language, lists the last one first and remembers it', async () => {
    const { invalidate } = await selectWords({ translateTo: 'fr' });
    ($('.tc-rewrite-trigger') as HTMLElement).click();
    menuItem('Translate').click();
    const languages = [...(shadow()?.querySelectorAll('.tc-rewrite-languages .tc-rewrite-item') ?? [])];
    expect(languages[0].textContent?.trim()).toBe('French (Français)');

    // Back goes to the main menu
    ($('.tc-rewrite-back') as HTMLElement).click();
    expect(menuItem('Formalize')).toBeTruthy();
    menuItem('Translate').click();

    menuItem('German (Deutsch)').click();
    expect($('.tc-rewrite-loading')?.textContent).toContain('Translating…');
    await flush();
    expect(sent(MESSAGE_TYPE.REWRITE_TEXT)[0].payload).toEqual({ text, style: 'translate', targetLanguage: 'de' });
    expect($('.tc-rewrite-card-style')?.textContent).toBe('Translate → German');
    expect((await settingsStorage.getValue()).translateTo).toBe('de');
    invalidate();
  });

  it('does not re-save the translate target when it is unchanged, and logs a failed save', async () => {
    const { invalidate } = await selectWords({ translateTo: 'de' });
    const setValue = vi.spyOn(settingsStorage, 'setValue');
    ($('.tc-rewrite-trigger') as HTMLElement).click();
    menuItem('Translate').click();
    menuItem('German (Deutsch)').click();
    await flush();
    expect(setValue).not.toHaveBeenCalled();

    ($('[data-action="close"]') as HTMLElement).click();
    const el = document.querySelector('textarea') as HTMLTextAreaElement;
    el.setSelectionRange(0, text.length);
    document.dispatchEvent(new Event('selectionchange'));
    await vi.advanceTimersByTimeAsync(150);
    setValue.mockRejectedValueOnce(new Error('quota'));
    ($('.tc-rewrite-trigger') as HTMLElement).click();
    menuItem('Translate').click();
    menuItem('Hindi (हिन्दी)').click();
    await flush();
    expect(console.error).toHaveBeenCalledWith('Failed to save translate language:', expect.any(Error));
    invalidate();
  });

  it('drops a response that arrives after the card was closed', async () => {
    let resolve!: (v: unknown) => void;
    const { invalidate } = await selectWords();
    respond = (m) => (m.type === MESSAGE_TYPE.REWRITE_TEXT ? new Promise((r) => (resolve = r)) : { success: true });
    ($('.tc-rewrite-trigger') as HTMLElement).click();
    menuItem('Formalize').click();
    ($('[data-action="close"]') as HTMLElement).click();
    resolve({ success: true, result: 'Late' });
    await flush();
    expect($('.tc-rewrite-card')).toBeNull();
    invalidate();
  });

  it('closes on Escape and on an outside click, but keeps the page Escape for the bare trigger', async () => {
    const { invalidate } = await selectWords();
    ($('.tc-rewrite-trigger') as HTMLElement).click();
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    document.dispatchEvent(escapeEvent);
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect($('.tc-rewrite-menu')).toBeNull();

    const el = document.querySelector('textarea') as HTMLTextAreaElement;
    el.setSelectionRange(0, text.length);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }));
    await vi.advanceTimersByTimeAsync(150);
    const bareEscape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    document.dispatchEvent(bareEscape);
    expect(bareEscape.defaultPrevented).toBe(false);
    expect($('.tc-rewrite-trigger')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    document.dispatchEvent(new Event('selectionchange'));
    await vi.advanceTimersByTimeAsync(150);
    ($('.tc-rewrite-trigger') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    expect($('.tc-rewrite-trigger')).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect($('.tc-rewrite-trigger')).toBeNull();
    invalidate();
  });

  it('closes the menu when the user types, but keeps an open preview', async () => {
    const { el, invalidate } = await selectWords();
    ($('.tc-rewrite-trigger') as HTMLElement).click();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect($('.tc-rewrite-menu')).toBeNull();

    el.setSelectionRange(0, text.length);
    document.dispatchEvent(new Event('selectionchange'));
    await vi.advanceTimersByTimeAsync(150);
    ($('.tc-rewrite-trigger') as HTMLElement).click();
    menuItem('Formalize').click();
    await flush();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect($('.tc-rewrite-card')).not.toBeNull();
    invalidate();
  });

  it('works on contenteditable selections', async () => {
    respond = (m) =>
      m.type === MESSAGE_TYPE.REWRITE_TEXT ? { success: true, result: 'Hello there, friend.' } : checkResult('', []);
    const invalidate = await start();
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.textContent = 'hi there my friend';
    document.body.append(div);
    div.focus();
    const range = document.createRange();
    range.selectNodeContents(div);
    const selection = window.getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await vi.advanceTimersByTimeAsync(150);

    ($('.tc-rewrite-trigger') as HTMLElement).click();
    menuItem('Friendly').click();
    await flush();
    ($('[data-action="replace"]') as HTMLElement).click();
    expect(div.textContent).toBe('Hello there, friend.');
    invalidate();
  });
});

describe('Google Docs', () => {
  function setURL(url: string) {
    (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
  }

  afterEach(() => setURL('http://localhost:3000/'));

  it('extracts text from the legacy DOM editor and checks it', async () => {
    setURL('https://docs.google.com/document/d/abc/edit');
    const text = 'Thiss paragraph has an eror.';
    respond = (m) =>
      m.type === MESSAGE_TYPE.CHECK_GRAMMAR ? checkResult(text, [suggestion(text, 'eror', 'error')]) : { success: true };
    document.body.innerHTML = `
      <div class="kix-appview-editor">
        <div class="kix-paragraphrenderer"><div class="kix-lineview">
          <span class="kix-wordhtmlgenerator-word-node">Thiss paragraph</span>
          <span class="kix-wordhtmlgenerator-word-node">​ has an eror.</span>
        </div></div>
      </div>`;
    const invalidate = await start();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)[0].payload).toEqual({ text, forceCheck: false });
    expect($('.tc-status-btn')?.classList.contains('tc-has-errors')).toBe(true);

    // The same text isn't sent twice; the shortcut runs a manual check
    await fakeBrowser.runtime.onMessage.trigger({ type: MESSAGE_TYPE.TRIGGER_CHECK }, {}, () => {});
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toHaveLength(1);
    invalidate();
  });

  it('extracts text from the canvas editor and reports failures', async () => {
    setURL('https://docs.google.com/document/d/abc/edit');
    respond = () => ({ success: false, error: 'Offline' });
    document.body.innerHTML = `
      <div class="kix-appview-editor">
        <div class="kix-canvas-tile-content"><svg>
          <g role="paragraph"><rect aria-label="Hello "></rect><rect aria-label="Hello "></rect><rect aria-label="world, again."></rect></g>
          <g role="paragraph"></g>
        </svg></div>
      </div>`;
    const invalidate = await start();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)[0].payload).toEqual({ text: 'Hello world, again.', forceCheck: false });
    expect($('.tc-status-btn')?.title).toBe('Grammar Check failed: Offline');
    invalidate();
  });

  it('waits for the editor to appear and rechecks when the document changes', async () => {
    setURL('https://docs.google.com/document/d/abc/edit');
    const invalidate = await start();
    const editor = document.createElement('div');
    editor.className = 'kix-appview-editor';
    editor.innerHTML = '<div class="kix-paragraphrenderer"><div class="kix-lineview"><span class="kix-wordhtmlgenerator-word-node">Short</span></div></div>';
    document.body.append(editor);
    await vi.advanceTimersByTimeAsync(1000 + DELAY);
    // Under 10 characters: not worth checking
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toEqual([]);

    (editor.querySelector('span') as HTMLElement).textContent = 'Now a longer document.';
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toHaveLength(1);
    invalidate();
  });

  it('extracts nothing from an unknown editor and skips the rewrite menu', async () => {
    setURL('https://docs.google.com/document/d/abc/edit');
    document.body.innerHTML = '<div class="kix-appview-editor"></div><textarea>one two three four</textarea>';
    const invalidate = await start({ checkMode: 'ondemand' });
    await fakeBrowser.runtime.onMessage.trigger({ type: MESSAGE_TYPE.TRIGGER_CHECK }, {}, () => {});
    const el = document.querySelector('textarea') as HTMLTextAreaElement;
    el.focus();
    el.setSelectionRange(0, el.value.length);
    document.dispatchEvent(new Event('selectionchange'));
    await vi.advanceTimersByTimeAsync(150);
    expect(sent(MESSAGE_TYPE.CHECK_GRAMMAR)).toEqual([]);
    expect($('.tc-rewrite-trigger')).toBeNull();
    invalidate();
  });
});
