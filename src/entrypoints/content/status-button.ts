import { ICONS } from "./constants";
import { createOverlayContainer } from "./overlay";
import type { ContentState } from "./state";

export type StatusState = "loading" | "errors" | "clean" | "failed" | "stale";

export interface StatusButton {
  show(state: StatusState, errorCount?: number, failureMessage?: string): void;
  position(): void;
  hide(): void;
  readonly element: HTMLDivElement | null;
}

function getStatusButtonPosition(
  element: HTMLElement,
  statusButton: HTMLDivElement | null
) {
  const rect = element.getBoundingClientRect();

  // The button grows when it shows the "Grammar Check" label, so measure it.
  const buttonWidth = statusButton?.offsetWidth || 32;
  const buttonHeight = 34;
  const margin = 8;

  let left = rect.right - buttonWidth;
  left = Math.max(10, Math.min(left, window.innerWidth - buttonWidth - 10));

  let top = rect.bottom + margin;

  // If the button doesn't fit below the field, place it above
  if (top + buttonHeight > window.innerHeight) {
    top = rect.top - buttonHeight - margin;
  }

  top = Math.max(10, Math.min(top, window.innerHeight - buttonHeight - 10));

  return { left, top };
}

// The small indicator next to the active field: spinner, issue count,
// all-clear tick, or failure.
export function createStatusButton(
  state: ContentState,
  onOpenPanel: () => void
): StatusButton {
  let statusButton: HTMLDivElement | null = null;

  function position() {
    if (!statusButton || !state.activeElement) return;
    const { left, top } = getStatusButtonPosition(state.activeElement, statusButton);
    statusButton.style.left = `${left}px`;
    statusButton.style.top = `${top}px`;
  }

  // Pages often run several writing tools at once, so every state names
  // this extension: a visible label while the AI call is in flight or has
  // failed, and a "Grammar Check: ..." tooltip on the compact states.
  function show(status: StatusState, errorCount = 0, failureMessage = "") {
    if (!state.activeElement) return;

    const container = createOverlayContainer(state);
    const shadow = container.shadowRoot;
    if (!shadow) return;

    // Remove existing button
    shadow.querySelectorAll(".tc-status-btn").forEach((el) => {
      el.remove();
    });

    statusButton = document.createElement("div");
    statusButton.className = `tc-status-btn ${
      status === "loading"
        ? "tc-loading"
        : status === "errors"
        ? "tc-has-errors"
        : status === "failed"
        ? "tc-check-failed"
        : status === "stale"
        ? "tc-stale"
        : "tc-no-errors"
    }`;
    statusButton.setAttribute("role", "status");

    let tooltip: string;
    if (status === "loading") {
      statusButton.innerHTML = `
        <div class="tc-status-icon"><div class="tc-spinner"></div></div>
        <span class="tc-status-label"></span>
      `;
      const label = statusButton.querySelector(".tc-status-label");
      if (label) label.textContent = "Grammar Check";
      tooltip = "Grammar Check is checking this text…";
    } else if (status === "errors") {
      statusButton.innerHTML = `
        <div class="tc-status-icon" style="color: #ef4444;">${ICONS.alert}</div>
        <span class="tc-error-count">${errorCount}</span>
      `;
      tooltip = `Grammar Check: ${errorCount} issue${
        errorCount > 1 ? "s" : ""
      } found. Click to see details.`;
    } else if (status === "failed") {
      statusButton.innerHTML = `
        <div class="tc-status-icon">${ICONS.alert}</div>
        <span class="tc-status-label"></span>
      `;
      const label = statusButton.querySelector(".tc-status-label");
      if (label) label.textContent = "Grammar Check failed";
      tooltip = `Grammar Check failed: ${failureMessage || "unknown error"}`;
    } else if (status === "stale") {
      // Not an error the user caused: the extension was updated or reloaded
      // and Chrome doesn't re-inject into open tabs, so only a refresh helps.
      statusButton.innerHTML = `<span class="tc-status-label"></span>`;
      const label = statusButton.querySelector(".tc-status-label");
      if (label) label.textContent = "Grammar Check: refresh page";
      tooltip =
        "Grammar Check was updated. Refresh the page to keep checking.";
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
      if (status === "stale") {
        hide();
      } else if (status === "errors" && state.suggestions.length > 0) {
        onOpenPanel();
      }
    });

    shadow.appendChild(statusButton);
    position();
  }

  function hide() {
    if (state.overlayContainer?.shadowRoot) {
      state.overlayContainer.shadowRoot
        .querySelectorAll(".tc-status-btn")
        .forEach((el) => {
          el.remove();
        });
    }
    statusButton = null;
  }

  return {
    show,
    position,
    hide,
    get element() {
      return statusButton;
    },
  };
}
