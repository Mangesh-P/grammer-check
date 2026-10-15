import { afterEach, describe, expect, it } from 'vitest';
import { findShadowRoots, getDeepActiveElement, getEventTarget, querySelectorAllDeep } from '@/lib/shadow-dom';

afterEach(() => {
  document.body.innerHTML = '';
});

function buildTree() {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<textarea id="outer-shadow"></textarea><span></span>';
  const nestedHost = root.querySelector('span') as HTMLElement;
  const nestedRoot = nestedHost.attachShadow({ mode: 'open' });
  nestedRoot.innerHTML = '<textarea id="nested-shadow"></textarea>';

  const closedHost = document.createElement('div');
  closedHost.attachShadow({ mode: 'closed' }).innerHTML = '<textarea id="closed"></textarea>';

  document.body.innerHTML = '<textarea id="light"></textarea>';
  document.body.append(host, closedHost);
  return { host, root, nestedRoot };
}

describe('findShadowRoots', () => {
  it('finds open roots, nested ones too, but never closed ones', () => {
    const { root, nestedRoot } = buildTree();
    const roots = findShadowRoots(document.body);
    expect(roots).toContain(root);
    expect(roots).toContain(nestedRoot);
    expect(roots).toHaveLength(2);
  });

  it("includes the root element's own shadow root", () => {
    const { host, root } = buildTree();
    expect(findShadowRoots(host)).toContain(root);
  });
});

describe('querySelectorAllDeep', () => {
  it('matches across open shadow boundaries', () => {
    buildTree();
    const ids = querySelectorAllDeep(document.body, 'textarea').map((e) => e.id);
    expect(ids.sort()).toEqual(['light', 'nested-shadow', 'outer-shadow']);
  });
});

describe('getDeepActiveElement', () => {
  it('walks into shadow roots to the focused element', () => {
    const { nestedRoot } = buildTree();
    const target = nestedRoot.getElementById('nested-shadow') as HTMLTextAreaElement;
    target.focus();
    expect(getDeepActiveElement()).toBe(target);
  });

  it('returns the light DOM active element', () => {
    buildTree();
    const light = document.getElementById('light') as HTMLTextAreaElement;
    light.focus();
    expect(getDeepActiveElement()).toBe(light);
  });
});

describe('getEventTarget', () => {
  it('returns the original target inside a shadow root', () => {
    const { root } = buildTree();
    const inner = root.getElementById('outer-shadow') as HTMLElement;
    let seen: EventTarget | null = null;
    document.body.addEventListener('click', (e) => {
      seen = getEventTarget(e);
    });
    inner.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(seen).toBe(inner);
  });

  it('falls back to event.target when there is no composed path', () => {
    const event = new Event('x');
    expect(getEventTarget(event)).toBe(null);
  });
});
