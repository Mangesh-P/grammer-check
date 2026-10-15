import { debounce, getTextFromElement } from "@/lib/utils";
import { MESSAGE_TYPE } from "@/types";
import type { GrammarCheckResult } from "@/types";
import { errorMessage, isContextInvalidated } from "./errors";
import type { ContentState } from "./state";
import type { StatusButton } from "./status-button";

// Check grammar via background script. Throws on failure so callers can
// show the error instead of leaving a spinner that never resolves.
export async function checkGrammarRequest(
  text: string,
  forceCheck = false
): Promise<GrammarCheckResult | null> {
  if (!text.trim() || text.length < 3) return null;

  const response = await browser.runtime.sendMessage({
    type: MESSAGE_TYPE.CHECK_GRAMMAR,
    payload: { text, forceCheck },
  });

  if (!response?.success) {
    throw new Error(response?.error || "No response from the extension");
  }
  return response.result as GrammarCheckResult;
}

interface CheckerDeps {
  statusButton: StatusButton;
  renderUnderlines: () => void;
  cleanup: () => void;
}

export interface Checker {
  run(forceCheck?: boolean): Promise<void>;
  // Real-time check, debounced by settings.realtimeDelay
  schedule(): void;
}

export function createChecker(state: ContentState, deps: CheckerDeps): Checker {
  let lastRequestedText = "";
  // Set when a check is requested while another is in flight. Dropping it
  // instead would leave the field with no indicator at all, because the
  // in-flight result is stale by the time it arrives.
  let recheckPending = false;

  async function run(forceCheck = false) {
    if (!state.activeElement) return;
    if (state.isChecking) {
      recheckPending = true;
      return;
    }

    const requestedText = getTextFromElement(state.activeElement);

    if (requestedText.trim().length < 3) {
      deps.cleanup();
      return;
    }

    state.isChecking = true;
    lastRequestedText = requestedText;

    deps.statusButton.show("loading");

    try {
      const result = await checkGrammarRequest(requestedText, forceCheck);
      const latestText = state.activeElement
        ? getTextFromElement(state.activeElement)
        : "";

      // Text changed while waiting: keep the spinner and let the queued
      // recheck render the fresh result.
      if (latestText !== lastRequestedText) {
        recheckPending = true;
        return;
      }

      if (result && state.activeElement) {
        state.suggestions = result.suggestions;
        deps.renderUnderlines();

        if (state.suggestions.length > 0) {
          deps.statusButton.show("errors", state.suggestions.length);
        } else {
          deps.statusButton.show("clean");
        }
      }
    } catch (error) {
      if (isContextInvalidated(state.ctx, error)) {
        deps.cleanup();
        return;
      }
      console.error("Grammar check error:", error);
      deps.statusButton.show("failed", 0, errorMessage(error));
    } finally {
      state.isChecking = false;
      if (recheckPending) {
        recheckPending = false;
        run(forceCheck);
      }
    }
  }

  const schedule = debounce(() => run(), state.settings.realtimeDelay);

  return { run, schedule };
}
