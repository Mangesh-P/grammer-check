import { getDeepActiveElement, getEventTarget } from "@/lib/shadow-dom";
import { settingsStorage } from "@/lib/storage";
import { debounce, getTextFromElement, isEditableElement, visibleLength } from "@/lib/utils";
import { MESSAGE_TYPE } from "@/types";
import { checkGrammarRequest, createChecker } from "./checker";
import { FieldObserver } from "./field-observer";
import { GoogleDocsHandler } from "./google-docs";
import { removeOverlayContainer } from "./overlay";
import { createPopover } from "./popover";
import { createRewriteMenu } from "./rewrite-menu";
import { createContentState } from "./state";
import { createStatusButton } from "./status-button";
import { createSuggestionPanel } from "./suggestion-panel";
import { renderUnderlines as drawUnderlines } from "./underlines";

export default defineContentScript({
  matches: ["<all_urls>"],
  allFrames: true,
  // Rich-text editors like TinyMCE and CKEditor 4 type into about:blank or
  // srcdoc iframes, which plain match patterns never inject into.
  matchAboutBlank: true,
  matchOriginAsFallback: { chrome: true },
  runAt: "document_idle",

  async main(ctx) {
    const state = createContentState(ctx);
    let unwatchSettings: (() => void) | null = null;

    // Load initial settings
    try {
      state.settings = await settingsStorage.getValue();
    } catch (error) {
      console.error("Failed to load settings:", error);
    }

    // Watch for settings changes
    try {
      unwatchSettings = settingsStorage.watch((newSettings) => {
        if (newSettings) {
          state.settings = newSettings;
          if (!state.settings.enabled) {
            cleanup();
          }
        }
      });
    } catch (error) {
      console.error("Failed to watch settings:", error);
    }

    // The UI modules call each other (panel <-> popover, underlines ->
    // popover), so they're wired with closures that resolve at call time.
    const renderUnderlines = () =>
      drawUnderlines(state, (suggestion, rect) => popover.show(suggestion, rect));

    const statusButton = createStatusButton(state, () => panel.toggle());
    const panel = createSuggestionPanel(state, {
      statusButton,
      hidePopover: () => popover.hide(),
      renderUnderlines,
    });
    const popover = createPopover(state, {
      hidePanel: () => panel.hide(),
      onChange: () => {
        if (state.suggestions.length === 0) {
          statusButton.show("clean");
        } else {
          statusButton.show("errors", state.suggestions.length);
        }
        renderUnderlines();
      },
    });
    const checker = createChecker(state, { statusButton, renderUnderlines, cleanup });
    const googleDocsHandler = new GoogleDocsHandler(state, {
      statusButton,
      checkGrammarRequest,
    });
    const rewriteMenu = createRewriteMenu(state, () =>
      googleDocsHandler.isGoogleDocs()
    );

    function cleanup() {
      state.suggestions = [];
      statusButton.hide();
      panel.hide();
      popover.hide();
      rewriteMenu.hide();
      removeOverlayContainer(state);
    }

    // Editors with their own model (Lexical, ProseMirror, Draft.js) handle
    // Ctrl+Z themselves and rewrite the DOM without an input event, which left
    // the "clean" tick on text that had just been un-corrected. Watching the
    // field's DOM catches those changes too.
    let lastSeenText = "";
    const textWatcher = new MutationObserver(() => {
      const element = state.activeElement;
      if (!element || getTextFromElement(element) === lastSeenText) return;
      handleInput(element);
    });

    function watchText(element: HTMLElement) {
      textWatcher.disconnect();
      lastSeenText = getTextFromElement(element);
      textWatcher.observe(element, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    // Event handlers
    function handleFocus(element: HTMLElement) {
      if (!state.settings.enabled || !isEditableElement(element)) return;

      state.activeElement = element;
      watchText(element);

      if (state.settings.checkMode === "realtime") {
        const text = getTextFromElement(element);
        if (visibleLength(text) > 10) {
          checker.schedule();
        }
      }
    }

    function handleBlur() {
      setTimeout(() => {
        if (getDeepActiveElement() !== state.activeElement) {
          cleanup();
          textWatcher.disconnect();
          state.activeElement = null;
        }
      }, 300);
    }

    function handleInput(element: HTMLElement) {
      if (!state.settings.enabled || !isEditableElement(element)) return;

      if (state.activeElement !== element) watchText(element);
      state.activeElement = element;
      lastSeenText = getTextFromElement(element);
      panel.hide();
      popover.hide();
      // Typing replaces the selection; an open preview stays, and Replace
      // re-checks that the selected text is still there.
      if (rewriteMenu.stage === "trigger" || rewriteMenu.stage === "menu") {
        rewriteMenu.hide();
      }

      if (state.settings.checkMode === "realtime") {
        const text = getTextFromElement(element);
        if (visibleLength(text) > 10) {
          checker.schedule();
        } else {
          cleanup();
        }
      }
    }

    const fieldObserver = new FieldObserver(handleFocus);
    fieldObserver.start();
    googleDocsHandler.start();

    // Message listener for keyboard shortcut
    browser.runtime.onMessage.addListener((message) => {
      if (message.type === MESSAGE_TYPE.TRIGGER_CHECK) {
        if (googleDocsHandler.isGoogleDocs()) {
          googleDocsHandler.triggerManualCheck();
        } else if (state.activeElement) {
          checker.run(true);
        }
      }
    });

    // Setup event listeners
    document.addEventListener(
      "focusin",
      (e) => {
        const target = getEventTarget(e);
        if (target instanceof HTMLElement) handleFocus(target);
      },
      true
    );

    document.addEventListener("focusout", () => handleBlur(), true);

    document.addEventListener(
      "input",
      (e) => {
        const target = getEventTarget(e);
        if (target instanceof HTMLElement) handleInput(target);
      },
      true
    );

    const handleScroll = debounce(() => {
      if (state.activeElement && state.suggestions.length > 0) {
        renderUnderlines();
      }
      // Also while loading or failed, so the indicator stays by its field
      statusButton.position();
      rewriteMenu.place();
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
        if (state.activeElement && state.suggestions.length > 0) {
          renderUnderlines();
        }
        rewriteMenu.place();
      },
      { passive: true }
    );

    ctx.onInvalidated(() => {
      fieldObserver.stop();
      textWatcher.disconnect();
      googleDocsHandler.stop();
      cleanup();
      if (unwatchSettings) unwatchSettings();
    });
  },
});
