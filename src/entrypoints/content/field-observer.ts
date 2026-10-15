import { isEditableElement } from "@/lib/utils";
import { findShadowRoots, querySelectorAllDeep } from "@/lib/shadow-dom";
import { EDITABLE_SELECTOR } from "./constants";

// Finds editable fields as they appear (including inside open shadow roots)
// and hands each one to `onField` once, batched per animation frame.
export class FieldObserver {
  private observer: MutationObserver | null = null;
  private processedElements = new WeakSet<HTMLElement>();
  private observedRoots = new WeakSet<ShadowRoot>();
  private pendingElements = new Set<HTMLElement>();
  private rafId: number | null = null;

  constructor(private readonly onField: (element: HTMLElement) => void) {}

  start() {
    if (this.observer) return;

    // Process existing textareas first
    this.scanExistingElements();

    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });

    this.observe(document.body);
  }

  private observe(root: Node) {
    this.observer?.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["contenteditable", "role", "g_editable"],
    });
  }

  // A document-level observer doesn't see inside shadow roots, so each
  // open root gets observed on its own (once; the WeakSet guards repeats).
  private observeShadowRoots(root: Element) {
    for (const shadow of findShadowRoots(root)) {
      if (this.observedRoots.has(shadow)) continue;
      this.observedRoots.add(shadow);
      this.observe(shadow);
    }
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.pendingElements.clear();
    this.observedRoots = new WeakSet();
  }

  private scanExistingElements() {
    this.observeShadowRoots(document.body);
    const textareas = querySelectorAllDeep(document.body, EDITABLE_SELECTOR);
    textareas.forEach((el) => {
      if (el instanceof HTMLElement && isEditableElement(el)) {
        this.scheduleProcessing(el);
      }
    });
  }

  private handleMutations(mutations: MutationRecord[]) {
    for (const mutation of mutations) {
      // Handle attribute changes (contenteditable or role added to existing element)
      if (mutation.type === "attributes" && mutation.target instanceof HTMLElement) {
        this.checkElement(mutation.target);
      }
      
      // Handle new nodes
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          this.checkElement(node);
        }
      }
    }
  }

  private checkElement(element: HTMLElement) {
    // Check the element itself
    if (
      isEditableElement(element) &&
      !this.processedElements.has(element)
    ) {
      this.scheduleProcessing(element);
    }

    // Check children
    this.observeShadowRoots(element);
    const editables = querySelectorAllDeep(element, EDITABLE_SELECTOR);
    editables.forEach((el) => {
      if (
        el instanceof HTMLElement &&
        isEditableElement(el) &&
        !this.processedElements.has(el)
      ) {
        this.scheduleProcessing(el);
      }
    });
  }

  private scheduleProcessing(element: HTMLElement) {
    this.pendingElements.add(element);

    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        this.processBatch();
      });
    }
  }

  private processBatch() {
    this.rafId = null;

    this.pendingElements.forEach((element) => {
      if (
        !this.processedElements.has(element) &&
        element.isConnected
      ) {
        this.processedElements.add(element);
        this.onField(element);
      }
    });

    this.pendingElements.clear();
  }
}
