import { escapeHtml, getSuggestionColor, getSuggestionLabel } from "@/lib/utils";
import { ACTION, ICONS } from "./constants";
import { createOverlayContainer } from "./overlay";
import type { ContentState } from "./state";
import type { StatusButton } from "./status-button";
import { addToDictionary, applySuggestion, ignoreSuggestion } from "./suggestions";

export interface SuggestionPanel {
  show(): void;
  hide(): void;
  toggle(): void;
}

interface SuggestionPanelDeps {
  statusButton: StatusButton;
  hidePopover: () => void;
  renderUnderlines: () => void;
}

// The panel listing every suggestion, opened from the status button.
export function createSuggestionPanel(
  state: ContentState,
  deps: SuggestionPanelDeps
): SuggestionPanel {
  let suggestionPanel: HTMLDivElement | null = null;

  function toggle() {
    if (suggestionPanel) {
      hide();
    } else {
      show();
    }
  }

  function show() {
    if (!state.activeElement || state.suggestions.length === 0) return;

    hide();
    deps.hidePopover();

    const container = createOverlayContainer(state);
    const shadow = container.shadowRoot;
    if (!shadow) return;

    const rect = state.activeElement.getBoundingClientRect();
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

    const errorCount = state.suggestions.length;
    suggestionPanel.innerHTML = `
      <div class="tc-panel-header">
        <div class="tc-panel-title">
          ${ICONS.pencil}
          <span>${errorCount} issue${errorCount > 1 ? "s" : ""} found</span>
        </div>
        <button class="tc-panel-close" data-action="${ACTION.CLOSE_PANEL}">${
          ICONS.close
        }</button>
      </div>
      <div class="tc-panel-body">
        ${state.suggestions
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
              <button class="tc-btn tc-btn-primary tc-btn-sm" data-action="${ACTION.APPLY}" data-index="${i}">Apply</button>
              <button class="tc-btn tc-btn-secondary tc-btn-sm" data-action="${ACTION.IGNORE}" data-index="${i}">Ignore</button>
              ${
                s.type === "spelling"
                  ? `<button class="tc-btn tc-btn-text tc-btn-sm" data-action="${ACTION.DICTIONARY}" data-index="${i}">Add to dictionary</button>`
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

      if (action === ACTION.CLOSE_PANEL) {
        hide();
        return;
      }

      if (!indexStr) return;
      const index = parseInt(indexStr, 10);
      const suggestion = state.suggestions[index];
      if (!suggestion) return;

      if (action === ACTION.APPLY) {
        applySuggestion(state, suggestion);
        updateAfterChange();
      } else if (action === ACTION.IGNORE) {
        ignoreSuggestion(state, suggestion);
        updateAfterChange();
      } else if (action === ACTION.DICTIONARY) {
        await addToDictionary(state, suggestion.original);
        ignoreSuggestion(state, suggestion);
        updateAfterChange();
      }
    });

    shadow.appendChild(suggestionPanel);

    // Close panel when clicking outside
    setTimeout(() => {
      document.addEventListener("mousedown", handleOutsideClick, true);
    }, 10);
  }

  function handleOutsideClick(e: MouseEvent) {
    // Use composedPath to properly detect clicks inside shadow DOM
    const path = e.composedPath();
    const clickedInPanel = suggestionPanel && path.includes(suggestionPanel);
    const statusEl = deps.statusButton.element;
    const clickedOnStatusBtn = statusEl && path.includes(statusEl);

    if (!clickedInPanel && !clickedOnStatusBtn) {
      hide();
      document.removeEventListener("mousedown", handleOutsideClick, true);
    }
  }

  function hide() {
    if (suggestionPanel?.parentNode) {
      suggestionPanel.remove();
    }
    suggestionPanel = null;
    document.removeEventListener("mousedown", handleOutsideClick, true);
  }

  function updateAfterChange() {
    if (state.suggestions.length === 0) {
      hide();
      deps.statusButton.show("clean");
    } else {
      // Re-render panel
      hide();
      show();
      deps.statusButton.show("errors", state.suggestions.length);
    }
    deps.renderUnderlines();
  }

  return { show, hide, toggle };
}
