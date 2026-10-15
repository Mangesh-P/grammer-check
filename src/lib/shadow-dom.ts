// Helpers for editors that live inside a page's own (open) shadow roots.
// Events from inside a shadow root are retargeted to the host element, and
// querySelectorAll / activeElement stop at the shadow boundary, so web
// component sites need these to be seen at all. Closed roots stay invisible.

export function getEventTarget(event: Event): EventTarget | null {
  return event.composedPath()[0] ?? event.target;
}

export function getDeepActiveElement(): Element | null {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) {
    element = element.shadowRoot.activeElement;
  }
  return element;
}

// Open shadow roots in the subtree of `root` (including root's own, if any),
// nested ones too.
export function findShadowRoots(root: Element | ShadowRoot): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  const visit = (node: Element | ShadowRoot) => {
    if (node instanceof Element && node.shadowRoot) {
      roots.push(node.shadowRoot);
      visit(node.shadowRoot);
    }
    for (const child of node.querySelectorAll('*')) {
      if (child.shadowRoot) {
        roots.push(child.shadowRoot);
        visit(child.shadowRoot);
      }
    }
  };
  visit(root);
  return roots;
}

export function querySelectorAllDeep(root: Element | ShadowRoot, selector: string): Element[] {
  const results = [...root.querySelectorAll(selector)];
  for (const shadow of findShadowRoots(root)) {
    results.push(...shadow.querySelectorAll(selector));
  }
  return results;
}
