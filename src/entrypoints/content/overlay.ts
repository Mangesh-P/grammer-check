import type { ContentState } from "./state";
import { STYLES } from "./styles";

// Create (or reuse) the Shadow DOM container all injected UI lives in.
export function createOverlayContainer(state: ContentState): HTMLDivElement {
  if (state.overlayContainer && document.body.contains(state.overlayContainer)) {
    return state.overlayContainer;
  }

  const container = document.createElement("div");
  container.id = "grammar-check-overlay";
  container.style.cssText =
    "position: absolute; top: 0; left: 0; pointer-events: none; z-index: 2147483647;";

  const shadow = container.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLES;
  shadow.appendChild(style);
  document.body.appendChild(container);

  state.overlayContainer = container;
  return container;
}

export function removeOverlayContainer(state: ContentState) {
  if (state.overlayContainer) {
    state.overlayContainer.remove();
    state.overlayContainer = null;
  }
}
