import {
  countWords,
  getFieldSelection,
  getRangeRect,
  replaceFieldSelection,
  type FieldSelection,
} from "@/lib/selection";
import { getDeepActiveElement } from "@/lib/shadow-dom";
import { updateSettings } from "@/lib/storage";
import { getCharacterRects } from "@/lib/text-rects";
import { debounce, isEditableElement } from "@/lib/utils";
import { MESSAGE_TYPE, REWRITE_STYLE, TRANSLATE_LANGUAGES } from "@/types";
import type { RewriteStyle } from "@/types";
import { ACTION, ICONS } from "./constants";
import { errorMessage, isContextInvalidated } from "./errors";
import { createOverlayContainer } from "./overlay";
import type { ContentState } from "./state";

// Rewrite selected text (Formalize / Friendly / Shorten / Proofread /
// Translate). Selecting text only shows a small button; nothing is sent to
// the AI until the user picks an action, and nothing is written to the
// field until they click Replace.
const REWRITE_OPTIONS: { style: RewriteStyle; label: string; icon: string }[] = [
  { style: REWRITE_STYLE.FORMAL, label: "Formalize", icon: ICONS.briefcase },
  { style: REWRITE_STYLE.CASUAL, label: "Friendly", icon: ICONS.hand },
  { style: REWRITE_STYLE.CONCISE, label: "Shorten", icon: ICONS.shrink },
];

const REWRITE_MIN_WORDS = 3;
const REWRITE_MAX_CHARS = 4000;

type RewriteRequest = { style: RewriteStyle; targetLanguage?: string };

type RewriteCardState =
  | { kind: "loading" }
  | { kind: "result"; text: string }
  | { kind: "error"; message: string };

export type RewriteStage = "trigger" | "menu" | "card";

export interface RewriteMenu {
  hide(): void;
  place(): void;
  readonly stage: RewriteStage | null;
}

function rewriteLabel(request: RewriteRequest): string {
  if (request.style === REWRITE_STYLE.PROOFREAD) return "Proofread";
  if (request.style === REWRITE_STYLE.TRANSLATE) {
    const name =
      TRANSLATE_LANGUAGES.find((lang) => lang.code === request.targetLanguage)
        ?.name ?? request.targetLanguage;
    // "German (Deutsch)" -> "German", to keep the card title short
    return `Translate → ${name?.split(" (")[0]}`;
  }
  return REWRITE_OPTIONS.find((o) => o.style === request.style)?.label ?? "";
}

function rewriteLoadingText(style: RewriteStyle): string {
  if (style === REWRITE_STYLE.PROOFREAD) return "Proofreading…";
  if (style === REWRITE_STYLE.TRANSLATE) return "Translating…";
  return "Rewriting…";
}

function getSelectionRect(selection: FieldSelection): DOMRect | null {
  if (selection.range) return getRangeRect(selection);
  if (selection.start === undefined || selection.end === undefined) return null;
  return (
    getCharacterRects(selection.element, selection.start, selection.end)[0] ??
    null
  );
}

function createRewriteItem(
  icon: string,
  text: string,
  onSelect: () => void,
  hasSubmenu = false
): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "tc-rewrite-item";
  item.setAttribute("role", "menuitem");
  item.innerHTML = icon;
  const label = document.createElement("span");
  label.textContent = text;
  item.appendChild(label);
  if (hasSubmenu) {
    item.setAttribute("aria-haspopup", "menu");
    item.insertAdjacentHTML("beforeend", ICONS.chevronRight);
  }
  item.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
  });
  return item;
}

function createRewriteSeparator(): HTMLElement {
  const separator = document.createElement("div");
  separator.className = "tc-rewrite-separator";
  separator.setAttribute("role", "separator");
  return separator;
}

export function createRewriteMenu(
  state: ContentState,
  isGoogleDocs: () => boolean
): RewriteMenu {
  let rewriteSelection: FieldSelection | null = null;
  let rewriteUI: HTMLElement | null = null;
  let rewriteStage: RewriteStage | null = null;
  // Bumped whenever the UI closes or a new request starts, so a late
  // response for an old selection is dropped instead of rendered.
  let rewriteRequestId = 0;
  let pointerDown = false;

  function updateTrigger() {
    // Keep an open menu or preview until the user dismisses it
    if (rewriteStage === "menu" || rewriteStage === "card" || pointerDown) return;

    const { settings } = state;
    const element = getDeepActiveElement();
    const selection =
      settings.enabled &&
      settings.rewriteMenu &&
      !isGoogleDocs() &&
      element instanceof HTMLElement &&
      isEditableElement(element)
        ? getFieldSelection(element)
        : null;

    const rect = selection && getSelectionRect(selection);
    if (
      !selection ||
      !rect ||
      countWords(selection.text) < REWRITE_MIN_WORDS ||
      selection.text.length > REWRITE_MAX_CHARS
    ) {
      if (rewriteStage === "trigger") hide();
      return;
    }

    rewriteSelection = selection;
    showTrigger();
  }

  const scheduleTrigger = debounce(() => updateTrigger(), 150);

  // The trigger and menu sit above the selection; the preview card goes
  // below it so the original text stays visible for comparison.
  function place() {
    if (!rewriteUI || !rewriteSelection) return;
    const rect = getSelectionRect(rewriteSelection);
    if (!rect) return;

    const margin = 8;
    const width = rewriteUI.offsetWidth;
    const height = rewriteUI.offsetHeight;
    const above = rect.top - height - margin;
    const below = rect.bottom + margin;
    const fitsAbove = above >= 10;
    const fitsBelow = below + height <= window.innerHeight - 10;

    let top =
      rewriteStage === "card"
        ? fitsBelow || !fitsAbove ? below : above
        : fitsAbove ? above : below;
    top = Math.max(10, Math.min(top, window.innerHeight - height - 10));
    const left = Math.max(10, Math.min(rect.left, window.innerWidth - width - 10));

    rewriteUI.style.left = `${left}px`;
    rewriteUI.style.top = `${top}px`;
  }

  function mount(element: HTMLElement, stage: RewriteStage) {
    rewriteUI?.remove();
    rewriteUI = element;
    rewriteStage = stage;

    // preventDefault keeps focus and the selection in the page's field
    element.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    createOverlayContainer(state).shadowRoot?.appendChild(element);
    place();
  }

  function showTrigger() {
    if (rewriteStage === "trigger" && rewriteUI) {
      place();
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "tc-rewrite-trigger";
    // Named like the status button, so it can't be mistaken for another
    // writing tool's button on the same page.
    button.innerHTML = `${ICONS.sparkles}<span>Grammar Check</span>`;
    button.title = "Grammar Check: rewrite selection";
    button.setAttribute("aria-label", "Grammar Check: rewrite selection");
    button.setAttribute("aria-haspopup", "menu");
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showMenu();
    });

    mount(button, "trigger");
  }

  function showMenu() {
    const menu = document.createElement("div");
    menu.className = "tc-rewrite-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Grammar Check: rewrite selection");
    menu.innerHTML = `<div class="tc-rewrite-menu-header" aria-hidden="true">${ICONS.sparkles}<span>Grammar Check</span></div>`;

    for (const option of REWRITE_OPTIONS) {
      menu.appendChild(
        createRewriteItem(option.icon, option.label, () =>
          runRewrite({ style: option.style })
        )
      );
    }
    menu.appendChild(createRewriteSeparator());
    menu.appendChild(
      createRewriteItem(ICONS.spellCheck, "Proofread", () =>
        runRewrite({ style: REWRITE_STYLE.PROOFREAD })
      )
    );
    menu.appendChild(
      createRewriteItem(ICONS.languages, "Translate", showTranslateMenu, true)
    );

    mount(menu, "menu");
  }

  function showTranslateMenu() {
    const menu = document.createElement("div");
    menu.className = "tc-rewrite-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Grammar Check: translate selection to");
    menu.innerHTML = `
      <div class="tc-rewrite-menu-header">
        <button type="button" class="tc-rewrite-back" aria-label="Back">${ICONS.chevronLeft}</button>
        <span>Translate to</span>
      </div>
      <div class="tc-rewrite-languages"></div>
    `;
    menu.querySelector(".tc-rewrite-back")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showMenu();
    });

    // Last-used language first, so repeating a translation is two clicks
    const { translateTo } = state.settings;
    const languages = [...TRANSLATE_LANGUAGES].sort(
      (a, b) => Number(b.code === translateTo) - Number(a.code === translateTo)
    );
    const list = menu.querySelector(".tc-rewrite-languages");
    if (!list) return;
    for (const lang of languages) {
      list.appendChild(
        createRewriteItem(ICONS.languages, lang.name, () => {
          if (lang.code !== state.settings.translateTo) {
            updateSettings({ translateTo: lang.code }).catch((error) =>
              console.error("Failed to save translate language:", error)
            );
          }
          runRewrite({ style: REWRITE_STYLE.TRANSLATE, targetLanguage: lang.code });
        })
      );
    }

    mount(menu, "menu");
  }

  async function runRewrite(request: RewriteRequest) {
    const selection = rewriteSelection;
    if (!selection) return;

    const requestId = ++rewriteRequestId;
    showCard(request, { kind: "loading" });

    try {
      const response = await browser.runtime.sendMessage({
        type: MESSAGE_TYPE.REWRITE_TEXT,
        payload: { text: selection.text, ...request },
      });
      if (requestId !== rewriteRequestId) return;
      if (!response?.success) {
        throw new Error(response?.error || "No response from the extension");
      }
      showCard(request, { kind: "result", text: response.result as string });
    } catch (error) {
      if (requestId !== rewriteRequestId) return;
      if (isContextInvalidated(state.ctx, error)) {
        hide();
        return;
      }
      console.error("Rewrite error:", error);
      showCard(request, { kind: "error", message: errorMessage(error) });
    }
  }

  function showCard(request: RewriteRequest, cardState: RewriteCardState) {
    const label = rewriteLabel(request);

    const card = document.createElement("div");
    card.className = "tc-rewrite-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", `Grammar Check: ${label} suggestion`);
    card.innerHTML = `
      <div class="tc-rewrite-card-header">
        ${ICONS.sparkles}
        <span class="tc-rewrite-card-title">Grammar Check · <span class="tc-rewrite-card-style"></span></span>
        <button type="button" class="tc-panel-close" data-action="${ACTION.CLOSE}" aria-label="Close">${ICONS.close}</button>
      </div>
      <div class="tc-rewrite-body"></div>
      <div class="tc-popover-actions"></div>
    `;
    const styleLabel = card.querySelector(".tc-rewrite-card-style");
    if (styleLabel) styleLabel.textContent = label;

    const body = card.querySelector(".tc-rewrite-body");
    const actions = card.querySelector<HTMLElement>(".tc-popover-actions");
    if (!body || !actions) return;

    if (cardState.kind === "loading") {
      body.innerHTML = `<div class="tc-rewrite-loading" role="status"><div class="tc-spinner"></div><span>${rewriteLoadingText(request.style)}</span></div>`;
      actions.remove();
    } else if (
      cardState.kind === "result" &&
      request.style === REWRITE_STYLE.PROOFREAD &&
      cardState.text.trim() === rewriteSelection?.text.trim()
    ) {
      // A Replace that changes nothing would only add an undo step
      const unchanged = document.createElement("div");
      unchanged.className = "tc-rewrite-unchanged";
      unchanged.setAttribute("role", "status");
      unchanged.textContent = "No changes needed. This text looks good.";
      body.appendChild(unchanged);
      actions.remove();
    } else if (cardState.kind === "result") {
      const result = document.createElement("div");
      result.className = "tc-rewrite-result";
      result.textContent = cardState.text;
      body.appendChild(result);
      actions.innerHTML = `
        <button type="button" class="tc-btn tc-btn-primary" data-action="${ACTION.REPLACE}">Replace</button>
        <button type="button" class="tc-btn tc-btn-secondary" data-action="${ACTION.COPY}">Copy</button>
        <button type="button" class="tc-btn tc-btn-text" data-action="${ACTION.RETRY}">Try again</button>
      `;
    } else {
      const error = document.createElement("div");
      error.className = "tc-rewrite-error";
      error.setAttribute("role", "alert");
      error.textContent = cardState.message;
      body.appendChild(error);
      actions.innerHTML = `<button type="button" class="tc-btn tc-btn-secondary" data-action="${ACTION.RETRY}">Try again</button>`;
    }

    card.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const button = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (!button) return;
      const action = button.dataset.action;

      if (action === ACTION.CLOSE) {
        hide();
      } else if (action === ACTION.RETRY) {
        runRewrite(request);
      } else if (action === ACTION.COPY && cardState.kind === "result") {
        navigator.clipboard.writeText(cardState.text).then(
          () => (button.textContent = "Copied"),
          () => (button.textContent = "Copy failed")
        );
      } else if (action === ACTION.REPLACE && cardState.kind === "result") {
        if (rewriteSelection && replaceFieldSelection(rewriteSelection, cardState.text)) {
          hide();
        } else {
          showCard(request, {
            kind: "error",
            message:
              "The text changed since you selected it. Select it again to rewrite.",
          });
        }
      }
    });

    mount(card, "card");
  }

  function hide() {
    rewriteRequestId++;
    rewriteUI?.remove();
    rewriteUI = null;
    rewriteStage = null;
    rewriteSelection = null;
  }

  // Show the trigger once a selection settles, and close the menu or preview
  // on an outside click or Escape. ctx removes these listeners when the
  // extension reloads.
  const { ctx } = state;
  ctx.addEventListener(document, "selectionchange", () => scheduleTrigger());
  ctx.addEventListener(
    document,
    "keyup",
    (e) => {
      // A mouseup outside the window never reaches us
      pointerDown = false;
      if (e.key !== "Escape") scheduleTrigger();
    },
    { capture: true }
  );
  ctx.addEventListener(
    document,
    "mousedown",
    (e) => {
      if (rewriteUI && e.composedPath().includes(rewriteUI)) return;
      pointerDown = true;
      if (rewriteStage) hide();
    },
    { capture: true }
  );
  ctx.addEventListener(
    document,
    "mouseup",
    () => {
      pointerDown = false;
      scheduleTrigger();
    },
    { capture: true }
  );
  ctx.addEventListener(
    document,
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !rewriteStage) return;
      // Only swallow Escape when it closes something the user opened, so
      // the page's own Escape handling (dialogs etc.) still works.
      if (rewriteStage !== "trigger") {
        e.preventDefault();
        e.stopPropagation();
      }
      hide();
    },
    { capture: true }
  );

  return {
    hide,
    place,
    get stage() {
      return rewriteStage;
    },
  };
}
