import { errorMessage, isContextInvalidated } from "./errors";
import type { ContentState } from "./state";
import type { StatusButton } from "./status-button";
import type { GrammarCheckResult } from "@/types";

interface GoogleDocsDeps {
  statusButton: StatusButton;
  checkGrammarRequest: (text: string) => Promise<GrammarCheckResult | null>;
}

// Special support for the Google Docs canvas-based editor (experimental).
export class GoogleDocsHandler {
  private observer: MutationObserver | null = null;
  private checkDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isActive = false;
  private lastText = "";

  constructor(
    private readonly state: ContentState,
    private readonly deps: GoogleDocsDeps
  ) {}

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
    this.state.activeElement = editor;

    this.observer = new MutationObserver(() => {
      this.scheduleCheck();
    });

    this.observer.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    if (this.state.settings.checkMode === "realtime") {
      this.scheduleCheck();
    }
  }

  private scheduleCheck() {
    if (!this.state.settings.enabled || this.state.settings.checkMode !== "realtime") return;

    if (this.checkDebounceTimer) {
      clearTimeout(this.checkDebounceTimer);
    }

    this.checkDebounceTimer = setTimeout(() => {
      this.performCheck();
    }, this.state.settings.realtimeDelay);
  }

  private async performCheck() {
    if (this.state.isChecking) return;

    const text = this.extractText();
    if (text.length < 10 || text === this.lastText) return;

    this.lastText = text;
    this.state.isChecking = true;
    this.deps.statusButton.show("loading");

    try {
      const result = await this.deps.checkGrammarRequest(text);
      if (result) {
        this.state.suggestions = result.suggestions;
        if (this.state.suggestions.length > 0) {
          this.deps.statusButton.show("errors", this.state.suggestions.length);
        } else {
          this.deps.statusButton.show("clean");
        }
      }
    } catch (error) {
      if (isContextInvalidated(this.state.ctx, error)) {
        this.deps.statusButton.show("stale");
        return;
      }
      console.error("Google Docs grammar check error:", error);
      this.deps.statusButton.show("failed", 0, errorMessage(error));
    } finally {
      this.state.isChecking = false;
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
