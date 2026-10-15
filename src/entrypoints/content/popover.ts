import { escapeHtml, getSuggestionColor, getSuggestionLabel } from "@/lib/utils";
import type { GrammarSuggestion } from "@/types";
import { ACTION } from "./constants";
import { createOverlayContainer } from "./overlay";
import type { ContentState } from "./state";
import { addToDictionary, applySuggestion, ignoreSuggestion } from "./suggestions";

export interface Popover {
  show(suggestion: GrammarSuggestion, anchorRect: DOMRect): void;
  hide(): void;
}

interface PopoverDeps {
  hidePanel: () => void;
  // Refresh the status button and underlines after a suggestion is handled
  onChange: () => void;
}

// The inline card shown when an underline is clicked.
export function createPopover(state: ContentState, deps: PopoverDeps): Popover {
  let currentPopover: HTMLDivElement | null = null;
  let closeTimeout: ReturnType<typeof setTimeout> | null = null;

  function show(suggestion: GrammarSuggestion, anchorRect: DOMRect) {
    hide();
    deps.hidePanel();

    const container = createOverlayContainer(state);
    const shadow = container.shadowRoot;
    if (!shadow) return;

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
      currentPopover.style.bottom = `${viewportHeight - anchorRect.top + 8}px`;
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
        <span class="tc-replacement">${escapeHtml(suggestion.replacement)}</span>
      </div>
      <div class="tc-explanation">${escapeHtml(suggestion.explanation)}</div>
      <div class="tc-popover-actions">
        <button class="tc-btn tc-btn-primary" data-action="${ACTION.APPLY}">Apply</button>
        <button class="tc-btn tc-btn-secondary" data-action="${ACTION.IGNORE}">Ignore</button>
        ${
          suggestion.type === "spelling"
            ? `<button class="tc-btn tc-btn-text" data-action="${ACTION.DICTIONARY}">+Dict</button>`
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

      if (action === ACTION.APPLY) {
        applySuggestion(state, suggestion);
        hide();
        deps.onChange();
      } else if (action === ACTION.IGNORE) {
        ignoreSuggestion(state, suggestion);
        hide();
        deps.onChange();
      } else if (action === ACTION.DICTIONARY) {
        await addToDictionary(state, suggestion.original);
        ignoreSuggestion(state, suggestion);
        hide();
        deps.onChange();
      }
    });

    shadow.appendChild(currentPopover);

    // Close on outside click - with delay to prevent immediate close
    if (closeTimeout) clearTimeout(closeTimeout);
    closeTimeout = setTimeout(() => {
      document.addEventListener("mousedown", handleOutsideClick, true);
    }, 100);
  }

  function handleOutsideClick(e: MouseEvent) {
    // Use composedPath to properly detect clicks inside shadow DOM
    const path = e.composedPath();

    // Check if click is inside popover
    if (currentPopover && path.includes(currentPopover)) {
      return;
    }

    // Check if click is on an underline (will open new popover)
    const shadow = state.overlayContainer?.shadowRoot;
    if (shadow) {
      const underlines = shadow.querySelectorAll(".tc-underline");
      for (const underline of underlines) {
        if (path.includes(underline)) {
          return;
        }
      }
    }

    hide();
  }

  function hide() {
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = null;
    }
    document.removeEventListener("mousedown", handleOutsideClick, true);

    if (currentPopover?.parentNode) {
      currentPopover.remove();
    }
    currentPopover = null;
  }

  return { show, hide };
}
