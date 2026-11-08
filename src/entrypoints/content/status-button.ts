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

// Pointer travel (px) before a press counts as a drag rather than a click.
const DRAG_THRESHOLD = 4;
// Keep this much of the viewport edge free so the button can always be grabbed.
const VIEWPORT_MARGIN = 10;

function getStatusButtonPosition(
  element: HTMLElement,
  statusButton: HTMLDivElement | null
) {
  const rect = element.getBoundingClientRect();

  // The button grows when it shows the "Grammar Check" label, so measure it.
  const buttonWidth = statusButton?.offsetWidth || 32;
  const buttonHeight = 34;
  const margin = 8;

  // Sit inside the field's right edge so it is obvious which input it belongs
  // to; a button below the field can land on unrelated content when a page
  // has several inputs close together.
  let left = rect.right - buttonWidth - margin;
  left = Math.max(10, Math.min(left, window.innerWidth - buttonWidth - 10));

  const isSingleLine = rect.height <= buttonHeight * 2;
  let top = isSingleLine
    ? rect.top + (rect.height - buttonHeight) / 2
    : rect.bottom - buttonHeight - margin;

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
  let errorCard: HTMLDivElement | null = null;
  // Offset from the auto-computed anchor, set by dragging. Kept for the whole
  // main() run so the button stays where the user put it while they keep
  // typing, and so switching fields doesn't snap it back under the cursor.
  let dragOffset: { x: number; y: number } | null = null;
  // Set while a drag is in flight so the click that ends it doesn't open the panel.
  let suppressClick = false;

  function removeErrorCard() {
    errorCard?.remove();
    errorCard = null;
  }

  // The tooltip only appears on hover and is easy to miss, so a click on the failed
  // button shows the full reason (e.g. "run ollama pull ...") in a card next to it.
  function toggleErrorCard(shadow: ShadowRoot, message: string) {
    if (errorCard) {
      removeErrorCard();
      return;
    }
    errorCard = document.createElement("div");
    errorCard.className = "tc-error-card";
    errorCard.setAttribute("role", "alert");
    errorCard.textContent = message || "unknown error";
    shadow.appendChild(errorCard);
    positionErrorCard();
  }

  function positionErrorCard() {
    if (!statusButton || !errorCard) return;
    const rect = statusButton.getBoundingClientRect();
    const cardWidth = errorCard.offsetWidth || 300;
    const left = Math.max(10, Math.min(rect.right - cardWidth, window.innerWidth - cardWidth - 10));
    errorCard.style.left = `${left}px`;
    if (rect.top > window.innerHeight / 2) {
      errorCard.style.bottom = `${window.innerHeight - rect.top + 8}px`;
      errorCard.style.top = "auto";
    } else {
      errorCard.style.top = `${rect.bottom + 8}px`;
      errorCard.style.bottom = "auto";
    }
  }

  function clamp(left: number, top: number, button: HTMLDivElement) {
    const width = button.offsetWidth || 32;
    const height = button.offsetHeight || 34;
    return {
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN)
      ),
      top: Math.max(
        VIEWPORT_MARGIN,
        Math.min(top, window.innerHeight - height - VIEWPORT_MARGIN)
      ),
    };
  }

  function position() {
    if (!statusButton || !state.activeElement) return;
    const anchor = getStatusButtonPosition(state.activeElement, statusButton);
    const moved = clamp(
      anchor.left + (dragOffset?.x ?? 0),
      anchor.top + (dragOffset?.y ?? 0),
      statusButton
    );
    statusButton.style.left = `${moved.left}px`;
    statusButton.style.top = `${moved.top}px`;
    positionErrorCard();
  }

  // The button sits over the page, so on a cramped layout it can cover the very
  // text it reports on. Let the user drag it anywhere in the viewport; the
  // offset is remembered and reapplied on every reposition.
  function makeDraggable(button: HTMLDivElement) {
    button.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const rect = button.getBoundingClientRect();
      const baseLeft = rect.left;
      const baseTop = rect.top;
      let dragging = false;

      const onMove = (move: PointerEvent) => {
        const dx = move.clientX - startX;
        const dy = move.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!dragging) {
          dragging = true;
          button.classList.add("tc-dragging");
          // happy-dom (tests) and old engines lack pointer capture.
          button.setPointerCapture?.(move.pointerId);
        }
        const next = clamp(baseLeft + dx, baseTop + dy, button);
        button.style.left = `${next.left}px`;
        button.style.top = `${next.top}px`;
        positionErrorCard();
      };

      const onUp = (up: PointerEvent) => {
        button.removeEventListener("pointermove", onMove);
        button.removeEventListener("pointerup", onUp);
        button.removeEventListener("pointercancel", onUp);
        if (!dragging) return;
        button.classList.remove("tc-dragging");
        if (button.hasPointerCapture?.(up.pointerId)) {
          button.releasePointerCapture(up.pointerId);
        }
        // Store the delta against the anchor, not absolute coordinates, so the
        // button keeps following the field as the page scrolls or resizes.
        if (state.activeElement) {
          const anchor = getStatusButtonPosition(state.activeElement, button);
          dragOffset = {
            x: button.getBoundingClientRect().left - anchor.left,
            y: button.getBoundingClientRect().top - anchor.top,
          };
        }
        suppressClick = true;
      };

      button.addEventListener("pointermove", onMove);
      button.addEventListener("pointerup", onUp);
      button.addEventListener("pointercancel", onUp);
    });
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
    removeErrorCard();

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
    // Prevent mousedown from triggering outside-click handlers
    statusButton.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    statusButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (status === "stale") {
        hide();
      } else if (status === "failed") {
        toggleErrorCard(shadow, failureMessage);
      } else if (status === "errors" && state.suggestions.length > 0) {
        onOpenPanel();
      }
    });

    makeDraggable(statusButton);
    statusButton.title = tooltip;
    // Dragging is not obvious, so say so for screen readers; the visible title
    // stays short.
    statusButton.setAttribute("aria-label", `${tooltip} Drag to move.`);

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
    removeErrorCard();
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
