import { getCharacterRects } from "@/lib/text-rects";
import { getSuggestionColor } from "@/lib/utils";
import type { GrammarSuggestion } from "@/types";
import { createOverlayContainer } from "./overlay";
import type { ContentState } from "./state";

// Draw one coloured underline per suggestion rect; clicking one opens its popover.
export function renderUnderlines(
  state: ContentState,
  onClick: (suggestion: GrammarSuggestion, rect: DOMRect) => void
) {
  const container = createOverlayContainer(state);
  const shadow = container.shadowRoot;
  if (!shadow) return;

  shadow.querySelectorAll(".tc-underline").forEach((el) => {
    el.remove();
  });

  const element = state.activeElement;
  if (!element || state.suggestions.length === 0) return;

  state.suggestions.forEach((suggestion) => {
    const rects = getCharacterRects(
      element,
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
        onClick(suggestion, rect);
      });

      shadow.appendChild(underline);
    });
  });
}
