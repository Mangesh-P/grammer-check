import type { ContentScriptContext } from "wxt/utils/content-script-context";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// After the extension is updated or reloaded, this orphaned script keeps
// running in already-open tabs but can no longer reach the background.
// That's not a check failure the user can act on, so tear down quietly.
export function isContextInvalidated(
  ctx: ContentScriptContext,
  error: unknown
): boolean {
  return (
    ctx.isInvalid ||
    errorMessage(error).includes("Extension context invalidated")
  );
}
