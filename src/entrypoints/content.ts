import { settingsStorage, updateSettings } from "@/lib/storage";
import {
  debounce,
  isEditableElement,
  getTextFromElement,
  setTextInElement,
  getSuggestionColor,
  getSuggestionLabel,
} from "@/lib/utils";
import {
  countWords,
  getFieldSelection,
  getRangeRect,
  replaceFieldSelection,
  type FieldSelection,
} from "@/lib/selection";
import type {
  GrammarSuggestion,
  GrammarCheckResult,
  RewriteStyle,
  Settings,
} from "@/types";
import { DEFAULT_SETTINGS, REWRITE_STYLE, TRANSLATE_LANGUAGES } from "@/types";

export default defineContentScript({
  matches: ["<all_urls>"],
  allFrames: true,
  runAt: "document_idle",

  async main(ctx) {

    let settings: Settings = DEFAULT_SETTINGS;
    let currentSuggestions: GrammarSuggestion[] = [];
    let activeElement: HTMLElement | null = null;
    let overlayContainer: HTMLDivElement | null = null;
    let statusButton: HTMLDivElement | null = null;
    let suggestionPanel: HTMLDivElement | null = null;
    let isChecking = false;
    let unwatchSettings: (() => void) | null = null;
    let popoverCloseTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastRequestedText = "";
    
    // Load initial settings
    try {
      settings = await settingsStorage.getValue();
    } catch (error) {
      console.error("Failed to load settings:", error);
    }

    // Watch for settings changes
    try {
      unwatchSettings = settingsStorage.watch((newSettings) => {
        if (newSettings) {
          settings = newSettings;
          if (!settings.enabled) {
            cleanup();
          }
        }
      });
    } catch (error) {
      console.error("Failed to watch settings:", error);
    }

    // TextareaObserver for dynamic element detection
    class TextareaObserver {
      private observer: MutationObserver | null = null;
      private processedElements = new WeakSet<HTMLElement>();
      private pendingElements = new Set<HTMLElement>();
      private rafId: number | null = null;

      start() {
        if (this.observer) return;

        // Process existing textareas first
        this.scanExistingElements();

        this.observer = new MutationObserver((mutations) => {
          this.handleMutations(mutations);
        });

        this.observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["contenteditable", "role", "g_editable"],
        });
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
      }

      private scanExistingElements() {
        const textareas = document.querySelectorAll(
          'textarea, input, [contenteditable="true"], [role="textbox"], [g_editable="true"]'
        );
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
        const editables = element.querySelectorAll(
          'textarea, input, [contenteditable="true"], [role="textbox"], [g_editable="true"]'
        );
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
            document.contains(element)
          ) {
            this.processedElements.add(element);
            handleFocus(element);
          }
        });

        this.pendingElements.clear();
      }
    }

    const textareaObserver = new TextareaObserver();
    textareaObserver.start();

    // Google Docs Handler - special support for Google Docs canvas-based editor
    class GoogleDocsHandler {
      private observer: MutationObserver | null = null;
      private checkDebounceTimer: ReturnType<typeof setTimeout> | null = null;
      private isActive = false;
      private lastText = "";

      isGoogleDocs(): boolean {
        return (
          window.location.hostname === "docs.google.com" &&
          window.location.pathname.includes("/document/")
        );
      }

      getDocMode(): "canvas" | "legacy" | "unknown" {
        if (document.querySelector(".kix-canvas-tile-content svg")) {
          return "canvas";
        } else if (document.querySelector(".kix-paragraphrenderer")) {
          return "legacy";
        }
        return "unknown";
      }

      extractText(): string {
        const mode = this.getDocMode();

        if (mode === "canvas") {
          return this.extractTextFromCanvas();
        } else if (mode === "legacy") {
          return this.extractTextFromDOM();
        }
        return "";
      }

      private extractTextFromCanvas(): string {
        const paragraphs: string[] = [];
        const svgGroups = document.querySelectorAll(
          ".kix-canvas-tile-content svg > g[role=paragraph]"
        );

        svgGroups.forEach((group) => {
          const rects = group.querySelectorAll("rect[aria-label]");
          let prevText = "";
          const words: string[] = [];

          rects.forEach((rect) => {
            const text = rect.getAttribute("aria-label");
            if (text && text !== prevText) {
              words.push(text);
              prevText = text;
            }
          });

          if (words.length > 0) {
            paragraphs.push(words.join(""));
          }
        });

        return paragraphs.join("\n");
      }

      private extractTextFromDOM(): string {
        const paragraphs: string[] = [];
        const paraElements = document.querySelectorAll(".kix-paragraphrenderer");

        paraElements.forEach((para) => {
          const lines = para.querySelectorAll(".kix-lineview");
          const lineTexts: string[] = [];

          lines.forEach((line) => {
            const words = line.querySelectorAll(
              ".kix-wordhtmlgenerator-word-node"
            );
            let lineText = "";

            words.forEach((word) => {
              let text = word.textContent || "";
              text = text.replace(/[\u200B\u200C]/g, "").replace(/\u00A0/g, " ");
              lineText += text;
            });

            if (lineText) {
              lineTexts.push(lineText);
            }
          });

          if (lineTexts.length > 0) {
            paragraphs.push(lineTexts.join(" "));
          }
        });

        return paragraphs.join("\n");
      }

      getEditorElement(): HTMLElement | null {
        return document.querySelector(".kix-appview-editor");
      }

      start() {
        if (!this.isGoogleDocs() || this.isActive) return;

        const editor = this.getEditorElement();
        if (!editor) {
          setTimeout(() => this.start(), 1000);
          return;
        }

        this.isActive = true;
        activeElement = editor;

        this.observer = new MutationObserver(() => {
          this.scheduleCheck();
        });

        this.observer.observe(editor, {
          childList: true,
          subtree: true,
          characterData: true,
        });

        if (settings.checkMode === "realtime") {
          this.scheduleCheck();
        }
      }

      private scheduleCheck() {
        if (!settings.enabled || settings.checkMode !== "realtime") return;

        if (this.checkDebounceTimer) {
          clearTimeout(this.checkDebounceTimer);
        }

        this.checkDebounceTimer = setTimeout(() => {
          this.performCheck();
        }, settings.realtimeDelay);
      }

      private async performCheck() {
        if (isChecking) return;

        const text = this.extractText();
        if (text.length < 10 || text === this.lastText) return;

        this.lastText = text;
        isChecking = true;
        showStatusButton("loading");

        try {
          const result = await checkGrammarRequest(text);
          if (result) {
            currentSuggestions = result.suggestions;
            if (currentSuggestions.length > 0) {
              showStatusButton("errors", currentSuggestions.length);
            } else {
              showStatusButton("clean");
            }
          }
        } catch (error) {
          console.error("Google Docs grammar check error:", error);
          showStatusButton("failed", 0, errorMessage(error));
        } finally {
          isChecking = false;
        }
      }

      triggerManualCheck() {
        if (!this.isActive) return;
        this.performCheck();
      }

      stop() {
        if (this.checkDebounceTimer) {
          clearTimeout(this.checkDebounceTimer);
          this.checkDebounceTimer = null;
        }
        if (this.observer) {
          this.observer.disconnect();
          this.observer = null;
        }
        this.isActive = false;
        this.lastText = "";
      }
    }

    const googleDocsHandler = new GoogleDocsHandler();
    googleDocsHandler.start();

    // Styles for Shadow DOM
    const STYLES = `
      * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .tc-underline {
        position: fixed;
        height: 3px;
        border-radius: 1px;
        pointer-events: auto;
        cursor: pointer;
        transition: opacity 0.2s, height 0.1s;
      }

      .tc-underline:hover {
        height: 4px;
        opacity: 0.9;
      }

      /* Status Button - like LanguageTool */
.tc-status-btn {
  position: fixed;
  display: flex;
  align-items: center;
  justify-content: center;

  min-width: 32px;
  height: 32px;

  padding: 0 7px;
  gap: 6px;
  white-space: nowrap;

  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,.1);
  cursor: pointer;
  pointer-events: auto;
  font-size: 13px;
  color: #374151;
  transition: all 0.2s;
  z-index: 2147483646;
}

      .tc-status-btn:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border-color: #d1d5db;
      }

      .tc-status-btn.tc-loading {
        color: #6b7280;
      }

      .tc-status-btn.tc-has-errors {
        border-color: #fca5a5;
        background: #fef2f2;
      }

      .tc-status-btn.tc-no-errors {
        border-color: #86efac;
        background: #f0fdf4;
      }

      .tc-status-btn.tc-check-failed {
        border-color: #fcd34d;
        background: #fffbeb;
        color: #92400e;
      }

      .tc-status-label {
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
      }

      .tc-status-icon {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .tc-status-icon svg {
        width: 16px;
        height: 16px;
      }

      .tc-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #e5e7eb;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: tc-spin 0.8s linear infinite;
      }

      @keyframes tc-spin {
        to { transform: rotate(360deg); }
      }

      .tc-error-count {
        background: #ef4444;
        color: white;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 10px;
        min-width: 20px;
        text-align: center;
      }

      /* Suggestion Panel */
      .tc-panel {
        position: fixed;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05);
        width: 360px;
        max-height: 400px;
        overflow: hidden;
        pointer-events: auto;
        animation: tc-slideUp 0.2s ease-out;
        z-index: 2147483647;
      }

      @keyframes tc-slideUp {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .tc-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid #f3f4f6;
        background: #f9fafb;
      }

      .tc-panel-title {
        font-weight: 600;
        font-size: 14px;
        color: #111827;
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
      }

      .tc-panel-title svg {
        width: 16px;
        height: 16px;
      }

      .tc-panel-close {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        color: #6b7280;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .tc-panel-close:hover {
        background: #e5e7eb;
        color: #374151;
      }

      .tc-panel-body {
        max-height: 340px;
        overflow-y: auto;
      }

      .tc-panel-empty {
        padding: 32px 16px;
        text-align: center;
        color: #6b7280;
      }

      .tc-panel-empty-icon {
        font-size: 32px;
        margin-bottom: 8px;
      }

      /* Individual suggestion card in panel */
      .tc-suggestion-card {
        padding: 12px 16px;
        border-bottom: 1px solid #f3f4f6;
        cursor: pointer;
        transition: background 0.15s;
      }

      .tc-suggestion-card:hover {
        background: #f9fafb;
      }

      .tc-suggestion-card:last-child {
        border-bottom: none;
      }

      .tc-suggestion-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }

      .tc-badge {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
        color: white;
      }

      .tc-suggestion-text {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        flex-wrap: wrap;
      }

      .tc-original {
        color: #dc2626;
        text-decoration: line-through;
      }

      .tc-arrow {
        color: #9ca3af;
      }

      .tc-replacement {
        color: #16a34a;
        font-weight: 500;
      }

      .tc-explanation {
        color: #6b7280;
        font-size: 12px;
        margin-top: 4px;
        line-height: 1.4;
      }

      .tc-suggestion-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }

      .tc-btn {
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: all 0.15s;
      }

      .tc-btn-primary {
        background: #2563eb;
        color: white;
      }

      .tc-btn-primary:hover {
        background: #1d4ed8;
      }

      .tc-btn-secondary {
        background: #f3f4f6;
        color: #374151;
      }

      .tc-btn-secondary:hover {
        background: #e5e7eb;
      }

      .tc-btn-sm {
        padding: 4px 8px;
        font-size: 11px;
      }

      /* Inline Popover (shown on underline click) */
      .tc-popover {
        position: fixed;
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
        padding: 12px;
        min-width: 280px;
        max-width: 380px;
        z-index: 2147483647;
        pointer-events: auto;
        animation: tc-fadeIn 0.15s ease-out;
      }

      @keyframes tc-fadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .tc-popover-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        flex-wrap: wrap;
      }

      .tc-popover-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }

      .tc-popover-actions .tc-btn {
        flex: 1;
      }

      .tc-btn-text {
        background: none;
        color: #6b7280;
        padding: 6px 8px;
        flex: 0 !important;
      }

      .tc-btn-text:hover {
        color: #374151;
        background: #f3f4f6;
      }

      /* Rewrite selected text: trigger button, style menu, preview card */
      .tc-rewrite-trigger {
        position: fixed;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 30px;
        padding: 0 10px 0 8px;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 600;
        background: white;
        color: #4f46e5;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        cursor: pointer;
        pointer-events: auto;
        z-index: 2147483647;
        animation: tc-fadeIn 0.12s ease-out;
      }

      .tc-rewrite-trigger:hover {
        background: #eef2ff;
        border-color: #c7d2fe;
      }

      .tc-rewrite-trigger svg {
        width: 16px;
        height: 16px;
      }

      .tc-rewrite-menu,
      .tc-rewrite-card {
        position: fixed;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
        pointer-events: auto;
        z-index: 2147483647;
        animation: tc-fadeIn 0.15s ease-out;
      }

      .tc-rewrite-menu {
        padding: 6px;
        min-width: 180px;
      }

      .tc-rewrite-menu-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px 8px;
        margin-bottom: 4px;
        border-bottom: 1px solid #f3f4f6;
        font-size: 12px;
        font-weight: 600;
        color: #4f46e5;
      }

      .tc-rewrite-menu-header svg {
        width: 14px;
        height: 14px;
      }

      .tc-rewrite-card-style {
        color: #6b7280;
        font-weight: 500;
      }

      .tc-rewrite-item {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 9px 12px;
        background: none;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        color: #1f2937;
        text-align: left;
        cursor: pointer;
      }

      .tc-rewrite-item:hover,
      .tc-rewrite-item:focus-visible {
        background: #f3f4f6;
        outline: none;
      }

      .tc-rewrite-item svg {
        width: 18px;
        height: 18px;
        color: #4b5563;
        flex-shrink: 0;
      }

      .tc-rewrite-item .tc-rewrite-chevron {
        width: 14px;
        height: 14px;
        margin-left: auto;
        color: #9ca3af;
      }

      .tc-rewrite-separator {
        height: 1px;
        margin: 4px 6px;
        background: #f3f4f6;
      }

      .tc-rewrite-languages {
        max-height: 280px;
        overflow-y: auto;
      }

      .tc-rewrite-back {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        margin-left: -6px;
        padding: 0;
        background: none;
        border: none;
        border-radius: 6px;
        color: #6b7280;
        cursor: pointer;
      }

      .tc-rewrite-back:hover,
      .tc-rewrite-back:focus-visible {
        background: #f3f4f6;
        outline: none;
      }

      .tc-rewrite-unchanged {
        font-size: 13px;
        color: #047857;
        line-height: 1.4;
      }

      .tc-rewrite-card {
        width: 380px;
        max-width: calc(100vw - 20px);
        padding: 12px;
      }

      .tc-rewrite-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 12px;
        font-weight: 600;
        color: #4f46e5;
      }

      .tc-rewrite-card-header svg {
        width: 14px;
        height: 14px;
      }

      .tc-rewrite-card-title {
        flex: 1;
      }

      .tc-rewrite-result {
        max-height: 220px;
        overflow-y: auto;
        font-size: 14px;
        line-height: 1.5;
        color: #111827;
        white-space: pre-wrap;
        word-wrap: break-word;
      }

      .tc-rewrite-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 0;
        font-size: 13px;
        color: #6b7280;
      }

      .tc-rewrite-error {
        font-size: 13px;
        color: #b91c1c;
        line-height: 1.4;
      }
    `;

    // Create Shadow DOM container
    function createOverlayContainer(): HTMLDivElement {
      if (overlayContainer && document.body.contains(overlayContainer)) {
        return overlayContainer;
      }

      overlayContainer = document.createElement("div");
      overlayContainer.id = "grammar-check-overlay";
      overlayContainer.style.cssText =
        "position: absolute; top: 0; left: 0; pointer-events: none; z-index: 2147483647;";

      const shadow = overlayContainer.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = STYLES;
      shadow.appendChild(style);
      document.body.appendChild(overlayContainer);

      return overlayContainer;
    }

    function cleanup() {
      currentSuggestions = [];
      hideStatusButton();
      hideSuggestionPanel();
      hidePopover();
      hideRewriteUI();
      if (overlayContainer) {
        overlayContainer.remove();
        overlayContainer = null;
      }
    }

    // Check grammar via background script. Throws on failure so callers can
    // show the error instead of leaving a spinner that never resolves.
    async function checkGrammarRequest(
      text: string,
      forceCheck = false
    ): Promise<GrammarCheckResult | null> {
      if (!text.trim() || text.length < 3) return null;

      const response = await browser.runtime.sendMessage({
        type: "CHECK_GRAMMAR",
        payload: { text, forceCheck },
      });

      if (!response?.success) {
        throw new Error(response?.error || "No response from the extension");
      }
      return response.result as GrammarCheckResult;
    }

    function errorMessage(error: unknown): string {
      return error instanceof Error ? error.message : String(error);
    }

    // SVG Icons
    const ICONS = {
      check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
      alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
      close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
      pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
      sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path></svg>`,
      briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path><rect width="20" height="14" x="2" y="6" rx="2"></rect></svg>`,
      hand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"></path><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"></path><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"></path><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path></svg>`,
      spellCheck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 16 6-12 6 12"></path><path d="M8 12h8"></path><path d="m16 20 2 2 4-4"></path></svg>`,
      languages: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"></path><path d="m4 14 6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="m22 22-5-10-5 10"></path><path d="M14 18h6"></path></svg>`,
      chevronRight: `<svg class="tc-rewrite-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>`,
      chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="m15 18-6-6 6-6"></path></svg>`,
      shrink: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-6"></path><path d="M12 8V2"></path><path d="m15 19-3-3-3 3"></path><path d="m15 5-3 3-3-3"></path></svg>`,
    };

    function getStatusButtonPosition(element: HTMLElement) {
  const rect = element.getBoundingClientRect();

  // The button grows when it shows the "Grammar Check" label, so measure it.
  const buttonWidth = statusButton?.offsetWidth || 32;
  const buttonHeight = 34;
  const margin = 8;

  let left = rect.right - buttonWidth;
  left = Math.max(10, Math.min(left, window.innerWidth - buttonWidth - 10));

  let top = rect.bottom + margin;

  // Si le bouton ne rentre pas sous le champ, on le place au-dessus
  if (top + buttonHeight > window.innerHeight) {
    top = rect.top - buttonHeight - margin;
  }

  top = Math.max(10, Math.min(top, window.innerHeight - buttonHeight - 10));

  return { left, top };
}

    // Show/update status button near the active element
    // Pages often run several writing tools at once, so every state names
    // this extension: a visible label while the AI call is in flight or has
    // failed, and a "Grammar Check: ..." tooltip on the compact states.
    function showStatusButton(
      state: "loading" | "errors" | "clean" | "failed",
      errorCount = 0,
      failureMessage = ""
    ) {
      if (!activeElement) return;

      const container = createOverlayContainer();
      const shadow = container.shadowRoot!;

      // Remove existing button
      shadow.querySelectorAll(".tc-status-btn").forEach((el) => {
        el.remove();
      });

      statusButton = document.createElement("div");
      statusButton.className = `tc-status-btn ${
        state === "loading"
          ? "tc-loading"
          : state === "errors"
          ? "tc-has-errors"
          : state === "failed"
          ? "tc-check-failed"
          : "tc-no-errors"
      }`;
      statusButton.setAttribute("role", "status");

      let tooltip: string;
      if (state === "loading") {
        statusButton.innerHTML = `
          <div class="tc-status-icon"><div class="tc-spinner"></div></div>
          <span class="tc-status-label"></span>
        `;
        statusButton.querySelector(".tc-status-label")!.textContent =
          "Grammar Check";
        tooltip = "Grammar Check is checking this text…";
      } else if (state === "errors") {
        statusButton.innerHTML = `
          <div class="tc-status-icon" style="color: #ef4444;">${ICONS.alert}</div>
          <span class="tc-error-count">${errorCount}</span>
        `;
        tooltip = `Grammar Check: ${errorCount} issue${
          errorCount > 1 ? "s" : ""
        } found. Click to see details.`;
      } else if (state === "failed") {
        statusButton.innerHTML = `
          <div class="tc-status-icon">${ICONS.alert}</div>
          <span class="tc-status-label"></span>
        `;
        statusButton.querySelector(".tc-status-label")!.textContent =
          "Grammar Check failed";
        tooltip = `Grammar Check failed: ${failureMessage || "unknown error"}`;
      } else {
        statusButton.innerHTML = `
          <div class="tc-status-icon" style="color: #22c55e;">
            ${ICONS.check}
          </div>
        `;
        tooltip = "Grammar Check: no issues found.";
      }
      statusButton.title = tooltip;
      statusButton.setAttribute("aria-label", tooltip);

      // Prevent mousedown from triggering outside-click handlers
      statusButton.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      statusButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state === "errors" && currentSuggestions.length > 0) {
          toggleSuggestionPanel();
        }
      });

      shadow.appendChild(statusButton);
      positionStatusButton();
    }

    function positionStatusButton() {
      if (!statusButton || !activeElement) return;
      const { left, top } = getStatusButtonPosition(activeElement);
      statusButton.style.left = `${left}px`;
      statusButton.style.top = `${top}px`;
    }

    function hideStatusButton() {
      if (overlayContainer?.shadowRoot) {
        overlayContainer.shadowRoot
          .querySelectorAll(".tc-status-btn")
          .forEach((el) => {
            el.remove();
          });
      }
      statusButton = null;
    }

    // Suggestion Panel (shows all suggestions)
    function toggleSuggestionPanel() {
      if (suggestionPanel) {
        hideSuggestionPanel();
      } else {
        showSuggestionPanel();
      }
    }

    function showSuggestionPanel() {
      if (!activeElement || currentSuggestions.length === 0) return;

      hideSuggestionPanel();
      hidePopover();

      const container = createOverlayContainer();
      const shadow = container.shadowRoot!;

      const rect = activeElement.getBoundingClientRect();
      suggestionPanel = document.createElement("div");
      suggestionPanel.className = "tc-panel";

      // Position panel
      let left = rect.right - 370;
      let top = rect.bottom + 8;

      if (left < 10) left = 10;
      if (top + 400 > window.innerHeight) {
        top = rect.top - 410;
        if (top < 10) top = 10;
      }

      suggestionPanel.style.cssText = `left: ${left}px; top: ${top}px;`;

      const errorCount = currentSuggestions.length;
      suggestionPanel.innerHTML = `
        <div class="tc-panel-header">
          <div class="tc-panel-title">
            ${ICONS.pencil}
            <span>${errorCount} issue${errorCount > 1 ? "s" : ""} found</span>
          </div>
          <button class="tc-panel-close" data-action="close-panel">${
            ICONS.close
          }</button>
        </div>
        <div class="tc-panel-body">
          ${currentSuggestions
            .map(
              (s, i) => `
            <div class="tc-suggestion-card" data-index="${i}">
              <div class="tc-suggestion-header">
                <span class="tc-badge" style="background: ${getSuggestionColor(
                  s.type
                )}">${getSuggestionLabel(s.type)}</span>
              </div>
              <div class="tc-suggestion-text">
                <span class="tc-original">${escapeHtml(s.original)}</span>
                <span class="tc-arrow">→</span>
                <span class="tc-replacement">${escapeHtml(s.replacement)}</span>
              </div>
              <div class="tc-explanation">${escapeHtml(s.explanation)}</div>
              <div class="tc-suggestion-actions">
                <button class="tc-btn tc-btn-primary tc-btn-sm" data-action="apply" data-index="${i}">Apply</button>
                <button class="tc-btn tc-btn-secondary tc-btn-sm" data-action="ignore" data-index="${i}">Ignore</button>
                ${
                  s.type === "spelling"
                    ? `<button class="tc-btn tc-btn-text tc-btn-sm" data-action="dictionary" data-index="${i}">Add to dictionary</button>`
                    : ""
                }
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      `;

      // Event delegation for panel actions
      suggestionPanel.addEventListener("click", async (e) => {
        const target = e.target as HTMLElement;
        const action = target.dataset.action;
        const indexStr = target.dataset.index;

        e.preventDefault();
        e.stopPropagation();

        if (action === "close-panel") {
          hideSuggestionPanel();
          return;
        }

        if (!indexStr) return;
        const index = parseInt(indexStr, 10);
        const suggestion = currentSuggestions[index];
        if (!suggestion) return;

        if (action === "apply") {
          applySuggestion(suggestion);
          updatePanelAfterChange();
        } else if (action === "ignore") {
          ignoreSuggestion(suggestion);
          updatePanelAfterChange();
        } else if (action === "dictionary") {
          await addToDictionary(suggestion.original);
          ignoreSuggestion(suggestion);
          updatePanelAfterChange();
        }
      });

      // Highlight text when hovering over suggestion card
      suggestionPanel.addEventListener("mouseover", (e) => {
        const card = (e.target as HTMLElement).closest(
          ".tc-suggestion-card"
        ) as HTMLElement;
        if (card) {
          const index = parseInt(card.dataset.index || "0", 10);
          highlightSuggestion(index);
        }
      });

      shadow.appendChild(suggestionPanel);

      // Close panel when clicking outside
      setTimeout(() => {
        document.addEventListener("mousedown", handlePanelOutsideClick, true);
      }, 10);
    }

    function handlePanelOutsideClick(e: MouseEvent) {
      // Use composedPath to properly detect clicks inside shadow DOM
      const path = e.composedPath();
      const clickedInPanel = suggestionPanel && path.includes(suggestionPanel);
      const clickedOnStatusBtn = statusButton && path.includes(statusButton);

      if (!clickedInPanel && !clickedOnStatusBtn) {
        hideSuggestionPanel();
        document.removeEventListener(
          "mousedown",
          handlePanelOutsideClick,
          true
        );
      }
    }

    function hideSuggestionPanel() {
      if (suggestionPanel?.parentNode) {
        suggestionPanel.remove();
      }
      suggestionPanel = null;
      document.removeEventListener("mousedown", handlePanelOutsideClick, true);
    }

    function updatePanelAfterChange() {
      if (currentSuggestions.length === 0) {
        hideSuggestionPanel();
        showStatusButton("clean");
      } else {
        // Re-render panel
        hideSuggestionPanel();
        showSuggestionPanel();
        showStatusButton("errors", currentSuggestions.length);
      }
      renderUnderlines();
    }

    function highlightSuggestion(index: number) {
      const suggestion = currentSuggestions[index];
      if (!suggestion || !activeElement) return;

      // Scroll the text into view if needed
      if (activeElement.tagName.toLowerCase() === "textarea") {
        // Could implement scroll to position for textarea
      }
    }

    // Get character position rectangles
    function getCharacterRects(
      element: HTMLElement,
      startIndex: number,
      endIndex: number
    ): DOMRect[] {
      const tagName = element.tagName.toLowerCase();

      if (tagName === "textarea" || tagName === "input") {
        return getTextareaCharacterRects(
          element as HTMLTextAreaElement | HTMLInputElement,
          startIndex,
          endIndex
        );
      }

      // For contenteditable
      const range = document.createRange();
      let currentIndex = 0;
      let startNode: Text | null = null;
      let startOffset = 0;
      let endNode: Text | null = null;
      let endOffset = 0;

      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node: Text | null;

      // biome-ignore lint/suspicious/noAssignInExpressions: standard TreeWalker loop
      while ((node = walker.nextNode() as Text)) {
        const nodeLength = node.length;

        if (!startNode && currentIndex + nodeLength > startIndex) {
          startNode = node;
          startOffset = startIndex - currentIndex;
        }

        if (!endNode && currentIndex + nodeLength >= endIndex) {
          endNode = node;
          endOffset = endIndex - currentIndex;
          break;
        }

        currentIndex += nodeLength;
      }

      if (!startNode || !endNode) return [];

      try {
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        return Array.from(range.getClientRects());
      } catch {
        return [];
      }
    }

    function getTextareaCharacterRects(
      element: HTMLTextAreaElement | HTMLInputElement,
      startIndex: number,
      endIndex: number
    ): DOMRect[] {
      const text = element.value;
      const computedStyle = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      const mirror = document.createElement("div");
      mirror.style.cssText = `
        position: absolute;
        top: -9999px;
        left: -9999px;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow: hidden;
        visibility: hidden;
        font-family: ${computedStyle.fontFamily};
        font-size: ${computedStyle.fontSize};
        font-weight: ${computedStyle.fontWeight};
        line-height: ${computedStyle.lineHeight};
        letter-spacing: ${computedStyle.letterSpacing};
        padding: ${computedStyle.padding};
        border: ${computedStyle.border};
        width: ${element.offsetWidth}px;
      `;

      const before = document.createElement("span");
      before.textContent = text.substring(0, startIndex);

      const marked = document.createElement("span");
      marked.textContent = text.substring(startIndex, endIndex);

      const after = document.createElement("span");
      after.textContent = text.substring(endIndex);

      mirror.appendChild(before);
      mirror.appendChild(marked);
      mirror.appendChild(after);
      document.body.appendChild(mirror);

      const markedRect = marked.getBoundingClientRect();
      const mirrorRect = mirror.getBoundingClientRect();

      const relativeTop = markedRect.top - mirrorRect.top;
      const relativeLeft = markedRect.left - mirrorRect.left;

      const scrollTop = element.scrollTop || 0;
      const scrollLeft = element.scrollLeft || 0;

      const finalRect = new DOMRect(
        rect.left + relativeLeft - scrollLeft,
        rect.top + relativeTop - scrollTop,
        markedRect.width,
        markedRect.height
      );

      document.body.removeChild(mirror);
      return [finalRect];
    }

    // Inline popover (shown on underline click)
    let currentPopover: HTMLDivElement | null = null;

    function showPopover(suggestion: GrammarSuggestion, anchorRect: DOMRect) {
      hidePopover();
      hideSuggestionPanel();

      const container = createOverlayContainer();
      const shadow = container.shadowRoot!;

      currentPopover = document.createElement("div");
      currentPopover.className = "tc-popover";

      // Position
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const spaceBelow = viewportHeight - anchorRect.bottom;
      const showAbove = spaceBelow < 180;

      let left = anchorRect.left;
      if (left + 300 > viewportWidth) left = viewportWidth - 310;
      if (left < 10) left = 10;

      currentPopover.style.left = `${left}px`;
      if (showAbove) {
        currentPopover.style.bottom = `${
          viewportHeight - anchorRect.top + 8
        }px`;
      } else {
        currentPopover.style.top = `${anchorRect.bottom + 8}px`;
      }

      const color = getSuggestionColor(suggestion.type);
      const label = getSuggestionLabel(suggestion.type);

      currentPopover.innerHTML = `
        <div class="tc-popover-header">
          <span class="tc-badge" style="background: ${color}">${label}</span>
          <span class="tc-original">${escapeHtml(suggestion.original)}</span>
          <span class="tc-arrow">→</span>
          <span class="tc-replacement">${escapeHtml(
            suggestion.replacement
          )}</span>
        </div>
        <div class="tc-explanation">${escapeHtml(suggestion.explanation)}</div>
        <div class="tc-popover-actions">
          <button class="tc-btn tc-btn-primary" data-action="apply">Apply</button>
          <button class="tc-btn tc-btn-secondary" data-action="ignore">Ignore</button>
          ${
            suggestion.type === "spelling"
              ? '<button class="tc-btn tc-btn-text" data-action="dictionary">+Dict</button>'
              : ""
          }
        </div>
      `;

      currentPopover.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });

      currentPopover.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const target = e.target as HTMLElement;
        const action = target.dataset.action;

        if (action === "apply") {
          applySuggestion(suggestion);
          hidePopover();
          updateStatusAfterChange();
        } else if (action === "ignore") {
          ignoreSuggestion(suggestion);
          hidePopover();
          updateStatusAfterChange();
        } else if (action === "dictionary") {
          await addToDictionary(suggestion.original);
          ignoreSuggestion(suggestion);
          hidePopover();
          updateStatusAfterChange();
        }
      });

      shadow.appendChild(currentPopover);

      // Close on outside click - with delay to prevent immediate close
      if (popoverCloseTimeout) clearTimeout(popoverCloseTimeout);
      popoverCloseTimeout = setTimeout(() => {
        document.addEventListener("mousedown", handlePopoverOutsideClick, true);
      }, 100);
    }

    function handlePopoverOutsideClick(e: MouseEvent) {
      // Use composedPath to properly detect clicks inside shadow DOM
      const path = e.composedPath();

      // Check if click is inside popover
      if (currentPopover && path.includes(currentPopover)) {
        return;
      }

      // Check if click is on an underline (will open new popover)
      const shadow = overlayContainer?.shadowRoot;
      if (shadow) {
        const underlines = shadow.querySelectorAll(".tc-underline");
        for (const underline of underlines) {
          if (path.includes(underline)) {
            return;
          }
        }
      }

      hidePopover();
    }

    function hidePopover() {
      if (popoverCloseTimeout) {
        clearTimeout(popoverCloseTimeout);
        popoverCloseTimeout = null;
      }
      document.removeEventListener(
        "mousedown",
        handlePopoverOutsideClick,
        true
      );

      if (currentPopover?.parentNode) {
        currentPopover.remove();
      }
      currentPopover = null;
    }

    function updateStatusAfterChange() {
      if (currentSuggestions.length === 0) {
        showStatusButton("clean");
      } else {
        showStatusButton("errors", currentSuggestions.length);
      }
      renderUnderlines();
    }

    function escapeHtml(text: string): string {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }

    function applySuggestion(suggestion: GrammarSuggestion) {
      if (!activeElement) return;

      const text = getTextFromElement(activeElement);
      const newText =
        text.substring(0, suggestion.startIndex) +
        suggestion.replacement +
        text.substring(suggestion.endIndex);
      setTextInElement(activeElement, newText);

      const lengthDiff =
        suggestion.replacement.length - suggestion.original.length;
      currentSuggestions = currentSuggestions
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
        .sendMessage({ type: "CORRECTION_APPLIED" })
        .catch(() => {});
    }

    function ignoreSuggestion(suggestion: GrammarSuggestion) {
      currentSuggestions = currentSuggestions.filter(
        (s) => s.id !== suggestion.id
      );
    }

    async function addToDictionary(word: string) {
      try {
        await browser.runtime.sendMessage({
          type: "ADD_TO_DICTIONARY",
          payload: { word },
        });
      } catch (error) {
        console.error("Failed to add to dictionary:", error);
      }
    }

    function renderUnderlines() {
      const container = createOverlayContainer();
      const shadow = container.shadowRoot!;

      shadow.querySelectorAll(".tc-underline").forEach((el) => {
        el.remove();
      });

      if (!activeElement || currentSuggestions.length === 0) return;

      currentSuggestions.forEach((suggestion) => {
        const rects = getCharacterRects(
          activeElement!,
          suggestion.startIndex,
          suggestion.endIndex
        );

        rects.forEach((rect) => {
          if (rect.width <= 0 || rect.height <= 0) return;

          const underline = document.createElement("div");
          underline.className = "tc-underline";
          underline.style.cssText = `
            left: ${rect.left}px;
            top: ${rect.bottom - 2}px;
            width: ${Math.max(rect.width, 4)}px;
            background: ${getSuggestionColor(suggestion.type)};
          `;

          underline.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
          });

          underline.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showPopover(suggestion, rect);
          });

          shadow.appendChild(underline);
        });
      });
    }

    // Rewrite selected text (Formalize / Friendly / Shorten / Proofread /
    // Translate). Selecting text only shows a small button; nothing is sent to
    // the AI until the user picks an action, and nothing is written to the
    // field until they click Replace.
    const REWRITE_OPTIONS: { style: RewriteStyle; label: string; icon: string }[] = [
      { style: REWRITE_STYLE.FORMAL, label: "Formalize", icon: ICONS.briefcase },
      { style: REWRITE_STYLE.CASUAL, label: "Friendly", icon: ICONS.hand },
      { style: REWRITE_STYLE.CONCISE, label: "Shorten", icon: ICONS.shrink },
    ];

    type RewriteRequest = { style: RewriteStyle; targetLanguage?: string };

    function rewriteLabel(request: RewriteRequest): string {
      if (request.style === REWRITE_STYLE.PROOFREAD) return "Proofread";
      if (request.style === REWRITE_STYLE.TRANSLATE) {
        const name =
          TRANSLATE_LANGUAGES.find((lang) => lang.code === request.targetLanguage)
            ?.name ?? request.targetLanguage;
        // "German (Deutsch)" -> "German", to keep the card title short
        return `Translate → ${name?.split(" (")[0]}`;
      }
      return REWRITE_OPTIONS.find((o) => o.style === request.style)?.label ?? "";
    }

    function rewriteLoadingText(style: RewriteStyle): string {
      if (style === REWRITE_STYLE.PROOFREAD) return "Proofreading…";
      if (style === REWRITE_STYLE.TRANSLATE) return "Translating…";
      return "Rewriting…";
    }
    const REWRITE_MIN_WORDS = 3;
    const REWRITE_MAX_CHARS = 4000;

    type RewriteCardState =
      | { kind: "loading" }
      | { kind: "result"; text: string }
      | { kind: "error"; message: string };

    let rewriteSelection: FieldSelection | null = null;
    let rewriteUI: HTMLElement | null = null;
    let rewriteStage: "trigger" | "menu" | "card" | null = null;
    // Bumped whenever the UI closes or a new request starts, so a late
    // response for an old selection is dropped instead of rendered.
    let rewriteRequestId = 0;
    let pointerDown = false;

    function getSelectionRect(selection: FieldSelection): DOMRect | null {
      if (selection.range) return getRangeRect(selection);
      return (
        getCharacterRects(selection.element, selection.start!, selection.end!)[0] ??
        null
      );
    }

    function updateRewriteTrigger() {
      // Keep an open menu or preview until the user dismisses it
      if (rewriteStage === "menu" || rewriteStage === "card" || pointerDown) return;

      const element = document.activeElement;
      const selection =
        settings.enabled &&
        settings.rewriteMenu &&
        !googleDocsHandler.isGoogleDocs() &&
        element instanceof HTMLElement &&
        isEditableElement(element)
          ? getFieldSelection(element)
          : null;

      const rect = selection && getSelectionRect(selection);
      if (
        !selection ||
        !rect ||
        countWords(selection.text) < REWRITE_MIN_WORDS ||
        selection.text.length > REWRITE_MAX_CHARS
      ) {
        if (rewriteStage === "trigger") hideRewriteUI();
        return;
      }

      rewriteSelection = selection;
      showRewriteTrigger();
    }

    const scheduleRewriteTrigger = debounce(() => updateRewriteTrigger(), 150);

    // The trigger and menu sit above the selection; the preview card goes
    // below it so the original text stays visible for comparison.
    function placeRewriteUI() {
      if (!rewriteUI || !rewriteSelection) return;
      const rect = getSelectionRect(rewriteSelection);
      if (!rect) return;

      const margin = 8;
      const width = rewriteUI.offsetWidth;
      const height = rewriteUI.offsetHeight;
      const above = rect.top - height - margin;
      const below = rect.bottom + margin;
      const fitsAbove = above >= 10;
      const fitsBelow = below + height <= window.innerHeight - 10;

      let top =
        rewriteStage === "card"
          ? fitsBelow || !fitsAbove ? below : above
          : fitsAbove ? above : below;
      top = Math.max(10, Math.min(top, window.innerHeight - height - 10));
      const left = Math.max(
        10,
        Math.min(rect.left, window.innerWidth - width - 10)
      );

      rewriteUI.style.left = `${left}px`;
      rewriteUI.style.top = `${top}px`;
    }

    function mountRewriteUI(
      element: HTMLElement,
      stage: "trigger" | "menu" | "card"
    ) {
      rewriteUI?.remove();
      rewriteUI = element;
      rewriteStage = stage;

      // preventDefault keeps focus and the selection in the page's field
      element.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      createOverlayContainer().shadowRoot!.appendChild(element);
      placeRewriteUI();
    }

    function showRewriteTrigger() {
      if (rewriteStage === "trigger" && rewriteUI) {
        placeRewriteUI();
        return;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "tc-rewrite-trigger";
      // Named like the status button, so it can't be mistaken for another
      // writing tool's button on the same page.
      button.innerHTML = `${ICONS.sparkles}<span>Grammar Check</span>`;
      button.title = "Grammar Check: rewrite selection";
      button.setAttribute("aria-label", "Grammar Check: rewrite selection");
      button.setAttribute("aria-haspopup", "menu");
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showRewriteMenu();
      });

      mountRewriteUI(button, "trigger");
    }

    function createRewriteItem(
      icon: string,
      text: string,
      onSelect: () => void,
      hasSubmenu = false
    ): HTMLButtonElement {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "tc-rewrite-item";
      item.setAttribute("role", "menuitem");
      item.innerHTML = icon;
      const label = document.createElement("span");
      label.textContent = text;
      item.appendChild(label);
      if (hasSubmenu) {
        item.setAttribute("aria-haspopup", "menu");
        item.insertAdjacentHTML("beforeend", ICONS.chevronRight);
      }
      item.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect();
      });
      return item;
    }

    function createRewriteSeparator(): HTMLElement {
      const separator = document.createElement("div");
      separator.className = "tc-rewrite-separator";
      separator.setAttribute("role", "separator");
      return separator;
    }

    function showRewriteMenu() {
      const menu = document.createElement("div");
      menu.className = "tc-rewrite-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "Grammar Check: rewrite selection");
      menu.innerHTML = `<div class="tc-rewrite-menu-header" aria-hidden="true">${ICONS.sparkles}<span>Grammar Check</span></div>`;

      for (const option of REWRITE_OPTIONS) {
        menu.appendChild(
          createRewriteItem(option.icon, option.label, () =>
            runRewrite({ style: option.style })
          )
        );
      }
      menu.appendChild(createRewriteSeparator());
      menu.appendChild(
        createRewriteItem(ICONS.spellCheck, "Proofread", () =>
          runRewrite({ style: REWRITE_STYLE.PROOFREAD })
        )
      );
      menu.appendChild(
        createRewriteItem(ICONS.languages, "Translate", showTranslateMenu, true)
      );

      mountRewriteUI(menu, "menu");
    }

    function showTranslateMenu() {
      const menu = document.createElement("div");
      menu.className = "tc-rewrite-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "Grammar Check: translate selection to");
      menu.innerHTML = `
        <div class="tc-rewrite-menu-header">
          <button type="button" class="tc-rewrite-back" aria-label="Back">${ICONS.chevronLeft}</button>
          <span>Translate to</span>
        </div>
        <div class="tc-rewrite-languages"></div>
      `;
      menu.querySelector(".tc-rewrite-back")!.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showRewriteMenu();
      });

      // Last-used language first, so repeating a translation is two clicks
      const languages = [...TRANSLATE_LANGUAGES].sort(
        (a, b) =>
          Number(b.code === settings.translateTo) -
          Number(a.code === settings.translateTo)
      );
      const list = menu.querySelector(".tc-rewrite-languages")!;
      for (const lang of languages) {
        list.appendChild(
          createRewriteItem(ICONS.languages, lang.name, () => {
            if (lang.code !== settings.translateTo) {
              updateSettings({ translateTo: lang.code }).catch((error) =>
                console.error("Failed to save translate language:", error)
              );
            }
            runRewrite({ style: REWRITE_STYLE.TRANSLATE, targetLanguage: lang.code });
          })
        );
      }

      mountRewriteUI(menu, "menu");
    }

    async function runRewrite(request: RewriteRequest) {
      const selection = rewriteSelection;
      if (!selection) return;

      const requestId = ++rewriteRequestId;
      showRewriteCard(request, { kind: "loading" });

      try {
        const response = await browser.runtime.sendMessage({
          type: "REWRITE_TEXT",
          payload: { text: selection.text, ...request },
        });
        if (requestId !== rewriteRequestId) return;
        if (!response?.success) {
          throw new Error(response?.error || "No response from the extension");
        }
        showRewriteCard(request, { kind: "result", text: response.result as string });
      } catch (error) {
        if (requestId !== rewriteRequestId) return;
        console.error("Rewrite error:", error);
        showRewriteCard(request, { kind: "error", message: errorMessage(error) });
      }
    }

    function showRewriteCard(request: RewriteRequest, state: RewriteCardState) {
      const label = rewriteLabel(request);

      const card = document.createElement("div");
      card.className = "tc-rewrite-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-label", `Grammar Check: ${label} suggestion`);
      card.innerHTML = `
        <div class="tc-rewrite-card-header">
          ${ICONS.sparkles}
          <span class="tc-rewrite-card-title">Grammar Check · <span class="tc-rewrite-card-style"></span></span>
          <button type="button" class="tc-panel-close" data-action="close" aria-label="Close">${ICONS.close}</button>
        </div>
        <div class="tc-rewrite-body"></div>
        <div class="tc-popover-actions"></div>
      `;
      card.querySelector(".tc-rewrite-card-style")!.textContent = label;

      const body = card.querySelector(".tc-rewrite-body")!;
      const actions = card.querySelector<HTMLElement>(".tc-popover-actions")!;

      if (state.kind === "loading") {
        body.innerHTML = `<div class="tc-rewrite-loading" role="status"><div class="tc-spinner"></div><span>${rewriteLoadingText(request.style)}</span></div>`;
        actions.remove();
      } else if (
        state.kind === "result" &&
        request.style === REWRITE_STYLE.PROOFREAD &&
        state.text.trim() === rewriteSelection?.text.trim()
      ) {
        // A Replace that changes nothing would only add an undo step
        const unchanged = document.createElement("div");
        unchanged.className = "tc-rewrite-unchanged";
        unchanged.setAttribute("role", "status");
        unchanged.textContent = "No changes needed. This text looks good.";
        body.appendChild(unchanged);
        actions.remove();
      } else if (state.kind === "result") {
        const result = document.createElement("div");
        result.className = "tc-rewrite-result";
        result.textContent = state.text;
        body.appendChild(result);
        actions.innerHTML = `
          <button type="button" class="tc-btn tc-btn-primary" data-action="replace">Replace</button>
          <button type="button" class="tc-btn tc-btn-secondary" data-action="copy">Copy</button>
          <button type="button" class="tc-btn tc-btn-text" data-action="retry">Try again</button>
        `;
      } else {
        const error = document.createElement("div");
        error.className = "tc-rewrite-error";
        error.setAttribute("role", "alert");
        error.textContent = state.message;
        body.appendChild(error);
        actions.innerHTML = `<button type="button" class="tc-btn tc-btn-secondary" data-action="retry">Try again</button>`;
      }

      card.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const button = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-action]"
        );
        const action = button?.dataset.action;

        if (action === "close") {
          hideRewriteUI();
        } else if (action === "retry") {
          runRewrite(request);
        } else if (action === "copy" && state.kind === "result") {
          navigator.clipboard.writeText(state.text).then(
            () => (button!.textContent = "Copied"),
            () => (button!.textContent = "Copy failed")
          );
        } else if (action === "replace" && state.kind === "result") {
          if (replaceFieldSelection(rewriteSelection!, state.text)) {
            hideRewriteUI();
          } else {
            showRewriteCard(request, {
              kind: "error",
              message:
                "The text changed since you selected it. Select it again to rewrite.",
            });
          }
        }
      });

      mountRewriteUI(card, "card");
    }

    function hideRewriteUI() {
      rewriteRequestId++;
      rewriteUI?.remove();
      rewriteUI = null;
      rewriteStage = null;
      rewriteSelection = null;
    }

    // Event handlers
    function handleFocus(element: HTMLElement) {
      if (!settings.enabled || !isEditableElement(element)) return;

      activeElement = element;

      if (settings.checkMode === "realtime") {
        const text = getTextFromElement(element);
        if (text.length > 10) {
          debouncedCheck(text);
        }
      }
    }

    function handleBlur() {
      setTimeout(() => {
        if (document.activeElement !== activeElement) {
          cleanup();
          activeElement = null;
        }
      }, 300);
    }

    function handleInput(element: HTMLElement) {
      if (!settings.enabled || !isEditableElement(element)) return;

      activeElement = element;
      hideSuggestionPanel();
      hidePopover();
      // Typing replaces the selection; an open preview stays, and Replace
      // re-checks that the selected text is still there.
      if (rewriteStage === "trigger" || rewriteStage === "menu") hideRewriteUI();

      if (settings.checkMode === "realtime") {
        const text = getTextFromElement(element);
        if (text.length > 10) {
          debouncedCheck(text);
        } else {
          cleanup();
        }
      }
    }

    // Set when a check is requested while another is in flight. Dropping it
    // instead would leave the field with no indicator at all, because the
    // in-flight result is stale by the time it arrives.
    let recheckPending = false;

    async function runCheck(forceCheck = false) {
      if (!activeElement) return;
      if (isChecking) {
        recheckPending = true;
        return;
      }

      const requestedText = getTextFromElement(activeElement);

      if (requestedText.trim().length < 3) {
        cleanup();
        return;
      }

      isChecking = true;
      lastRequestedText = requestedText;

      showStatusButton("loading");

      try {
        const result = await checkGrammarRequest(requestedText, forceCheck);
        const latestText = activeElement ? getTextFromElement(activeElement) : "";

        // Text changed while waiting: keep the spinner and let the queued
        // recheck render the fresh result.
        if (latestText !== lastRequestedText) {
          recheckPending = true;
          return;
        }

        if (result && activeElement) {
          currentSuggestions = result.suggestions;
          renderUnderlines();

          if (currentSuggestions.length > 0) {
            showStatusButton("errors", currentSuggestions.length);
          } else {
            showStatusButton("clean");
          }
        }
      } catch (error) {
        console.error("Grammar check error:", error);
        showStatusButton("failed", 0, errorMessage(error));
      } finally {
        isChecking = false;
        if (recheckPending) {
          recheckPending = false;
          runCheck(forceCheck);
        }
      }
    }

    const debouncedCheck = debounce(
      (_text: string) => runCheck(),
      settings.realtimeDelay
    );

    // Message listener for keyboard shortcut
    browser.runtime.onMessage.addListener((message) => {
      if (message.type === "TRIGGER_CHECK") {
        if (googleDocsHandler.isGoogleDocs()) {
          googleDocsHandler.triggerManualCheck();
        } else if (activeElement) {
          runCheck(true);
        }
      }
    });

    // Setup event listeners
    document.addEventListener(
      "focusin",
      (e) => {
        if (e.target instanceof HTMLElement) handleFocus(e.target);
      },
      true
    );

    document.addEventListener("focusout", () => handleBlur(), true);

    document.addEventListener(
      "input",
      (e) => {
        if (e.target instanceof HTMLElement) handleInput(e.target);
      },
      true
    );

    const handleScroll = debounce(() => {
      if (activeElement && currentSuggestions.length > 0) {
        renderUnderlines();
      }
      // Also while loading or failed, so the indicator stays by its field
      positionStatusButton();
      placeRewriteUI();
    }, 50);

    window.addEventListener("scroll", handleScroll, {
      passive: true,
      capture: true,
    });
    document.addEventListener("scroll", handleScroll, {
      passive: true,
      capture: true,
    });

    window.addEventListener(
      "resize",
      () => {
        if (activeElement && currentSuggestions.length > 0) {
          renderUnderlines();
        }
        placeRewriteUI();
      },
      { passive: true }
    );

    // Rewrite menu: show the trigger once a selection settles, and close the
    // menu or preview on an outside click or Escape. ctx removes these
    // listeners when the extension reloads.
    ctx.addEventListener(document, "selectionchange", () => scheduleRewriteTrigger());
    ctx.addEventListener(
      document,
      "keyup",
      (e) => {
        // A mouseup outside the window never reaches us
        pointerDown = false;
        if (e.key !== "Escape") scheduleRewriteTrigger();
      },
      { capture: true }
    );
    ctx.addEventListener(
      document,
      "mousedown",
      (e) => {
        if (rewriteUI && e.composedPath().includes(rewriteUI)) return;
        pointerDown = true;
        if (rewriteStage) hideRewriteUI();
      },
      { capture: true }
    );
    ctx.addEventListener(
      document,
      "mouseup",
      () => {
        pointerDown = false;
        scheduleRewriteTrigger();
      },
      { capture: true }
    );
    ctx.addEventListener(
      document,
      "keydown",
      (e) => {
        if (e.key !== "Escape" || !rewriteStage) return;
        // Only swallow Escape when it closes something the user opened, so
        // the page's own Escape handling (dialogs etc.) still works.
        if (rewriteStage !== "trigger") {
          e.preventDefault();
          e.stopPropagation();
        }
        hideRewriteUI();
      },
      { capture: true }
    );

    ctx.onInvalidated(() => {
      textareaObserver.stop();
      googleDocsHandler.stop();
      cleanup();
      if (unwatchSettings) unwatchSettings();
    });
  },
});
