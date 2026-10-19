import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { DEFAULT_SETTINGS } from "@/types";
import type { GrammarSuggestion, Settings } from "@/types";

// State shared by the content-script modules. One instance per main() run,
// so a reloaded extension (or each test) starts clean.
export interface ContentState {
  ctx: ContentScriptContext;
  settings: Settings;
  suggestions: GrammarSuggestion[];
  // "Google Gemini · gemini-3.8-flash" for the last result, shown in the panel footer
  modelLabel: string;
  activeElement: HTMLElement | null;
  overlayContainer: HTMLDivElement | null;
  isChecking: boolean;
}

export function createContentState(ctx: ContentScriptContext): ContentState {
  return {
    ctx,
    settings: DEFAULT_SETTINGS,
    suggestions: [],
    modelLabel: "",
    activeElement: null,
    overlayContainer: null,
    isChecking: false,
  };
}
