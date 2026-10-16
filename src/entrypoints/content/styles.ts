// CSS for everything injected into the Shadow DOM overlay. It lives in the
// shadow root, so host-page styles can't reach it and it can't leak out.
export const STYLES = `
      * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .tc-underline {
        position: fixed;
        height: 3px;
        border-radius: 1px;
        pointer-events: auto;
        cursor: pointer;
        transition: opacity 0.2s, height 0.1s;
      }

      .tc-underline:hover {
        height: 4px;
        opacity: 0.9;
      }

      /* Status Button - like LanguageTool */
.tc-status-btn {
  position: fixed;
  display: flex;
  align-items: center;
  justify-content: center;

  min-width: 32px;
  height: 32px;

  padding: 0 7px;
  gap: 6px;
  white-space: nowrap;

  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,.1);
  cursor: pointer;
  pointer-events: auto;
  font-size: 13px;
  color: #374151;
  transition: all 0.2s;
  z-index: 2147483646;
}

      .tc-status-btn:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border-color: #d1d5db;
      }

      .tc-status-btn.tc-loading {
        color: #6b7280;
      }

      .tc-status-btn.tc-has-errors {
        border-color: #fca5a5;
        background: #fef2f2;
      }

      .tc-status-btn.tc-no-errors {
        border-color: #86efac;
        background: #f0fdf4;
      }

      .tc-status-btn.tc-check-failed {
        border-color: #fcd34d;
        background: #fffbeb;
        color: #92400e;
      }

      .tc-status-btn.tc-stale {
        border-color: #d4d4d8;
        background: #f4f4f5;
        color: #3f3f46;
        cursor: pointer;
      }

      .tc-status-label {
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
      }

      .tc-status-icon {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .tc-status-icon svg {
        width: 16px;
        height: 16px;
      }

      .tc-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #e5e7eb;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: tc-spin 0.8s linear infinite;
      }

      @keyframes tc-spin {
        to { transform: rotate(360deg); }
      }

      .tc-error-count {
        background: #ef4444;
        color: white;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 10px;
        min-width: 20px;
        text-align: center;
      }

      /* Suggestion Panel */
      .tc-panel {
        position: fixed;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05);
        width: 360px;
        max-height: 400px;
        overflow: hidden;
        pointer-events: auto;
        animation: tc-slideUp 0.2s ease-out;
        z-index: 2147483647;
      }

      @keyframes tc-slideUp {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .tc-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid #f3f4f6;
        background: #f9fafb;
      }

      .tc-panel-title {
        font-weight: 600;
        font-size: 14px;
        color: #111827;
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
      }

      .tc-panel-title svg {
        width: 16px;
        height: 16px;
      }

      .tc-panel-apply-all {
        margin-right: 8px;
      }

      .tc-panel-close {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        color: #6b7280;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .tc-panel-close:hover {
        background: #e5e7eb;
        color: #374151;
      }

      .tc-panel-body {
        max-height: 340px;
        overflow-y: auto;
      }

      .tc-panel-empty {
        padding: 32px 16px;
        text-align: center;
        color: #6b7280;
      }

      .tc-panel-empty-icon {
        font-size: 32px;
        margin-bottom: 8px;
      }

      /* Individual suggestion card in panel */
      .tc-suggestion-card {
        padding: 12px 16px;
        border-bottom: 1px solid #f3f4f6;
        cursor: pointer;
        transition: background 0.15s;
      }

      .tc-suggestion-card:hover {
        background: #f9fafb;
      }

      .tc-suggestion-card:last-child {
        border-bottom: none;
      }

      .tc-suggestion-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }

      .tc-badge {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
        color: white;
      }

      .tc-suggestion-text {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        flex-wrap: wrap;
      }

      .tc-original {
        color: #dc2626;
        text-decoration: line-through;
      }

      .tc-arrow {
        color: #9ca3af;
      }

      .tc-replacement {
        color: #16a34a;
        font-weight: 500;
      }

      .tc-explanation {
        color: #6b7280;
        font-size: 12px;
        margin-top: 4px;
        line-height: 1.4;
      }

      .tc-suggestion-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }

      .tc-btn {
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: all 0.15s;
      }

      .tc-btn-primary {
        background: #2563eb;
        color: white;
      }

      .tc-btn-primary:hover {
        background: #1d4ed8;
      }

      .tc-btn-secondary {
        background: #f3f4f6;
        color: #374151;
      }

      .tc-btn-secondary:hover {
        background: #e5e7eb;
      }

      .tc-btn-sm {
        padding: 4px 8px;
        font-size: 11px;
      }

      /* Inline Popover (shown on underline click) */
      .tc-popover {
        position: fixed;
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
        padding: 12px;
        min-width: 280px;
        max-width: 380px;
        z-index: 2147483647;
        pointer-events: auto;
        animation: tc-fadeIn 0.15s ease-out;
      }

      @keyframes tc-fadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .tc-popover-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        flex-wrap: wrap;
      }

      .tc-popover-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }

      .tc-popover-actions .tc-btn {
        flex: 1;
      }

      .tc-btn-text {
        background: none;
        color: #6b7280;
        padding: 6px 8px;
        flex: 0 !important;
      }

      .tc-btn-text:hover {
        color: #374151;
        background: #f3f4f6;
      }

      /* Rewrite selected text: trigger button, style menu, preview card */
      .tc-rewrite-trigger {
        position: fixed;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 30px;
        padding: 0 10px 0 8px;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 600;
        background: white;
        color: #4f46e5;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        cursor: pointer;
        pointer-events: auto;
        z-index: 2147483647;
        animation: tc-fadeIn 0.12s ease-out;
      }

      .tc-rewrite-trigger:hover {
        background: #eef2ff;
        border-color: #c7d2fe;
      }

      .tc-rewrite-trigger svg {
        width: 16px;
        height: 16px;
      }

      .tc-rewrite-menu,
      .tc-rewrite-card {
        position: fixed;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
        pointer-events: auto;
        z-index: 2147483647;
        animation: tc-fadeIn 0.15s ease-out;
      }

      .tc-rewrite-menu {
        padding: 6px;
        min-width: 180px;
      }

      .tc-rewrite-menu-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px 8px;
        margin-bottom: 4px;
        border-bottom: 1px solid #f3f4f6;
        font-size: 12px;
        font-weight: 600;
        color: #4f46e5;
      }

      .tc-rewrite-menu-header svg {
        width: 14px;
        height: 14px;
      }

      .tc-rewrite-card-style {
        color: #6b7280;
        font-weight: 500;
      }

      .tc-rewrite-item {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 9px 12px;
        background: none;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        color: #1f2937;
        text-align: left;
        cursor: pointer;
      }

      .tc-rewrite-item:hover,
      .tc-rewrite-item:focus-visible {
        background: #f3f4f6;
        outline: none;
      }

      .tc-rewrite-item svg {
        width: 18px;
        height: 18px;
        color: #4b5563;
        flex-shrink: 0;
      }

      .tc-rewrite-item .tc-rewrite-chevron {
        width: 14px;
        height: 14px;
        margin-left: auto;
        color: #9ca3af;
      }

      .tc-rewrite-separator {
        height: 1px;
        margin: 4px 6px;
        background: #f3f4f6;
      }

      .tc-rewrite-languages {
        max-height: 280px;
        overflow-y: auto;
      }

      .tc-rewrite-back {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        margin-left: -6px;
        padding: 0;
        background: none;
        border: none;
        border-radius: 6px;
        color: #6b7280;
        cursor: pointer;
      }

      .tc-rewrite-back:hover,
      .tc-rewrite-back:focus-visible {
        background: #f3f4f6;
        outline: none;
      }

      .tc-rewrite-unchanged {
        font-size: 13px;
        color: #047857;
        line-height: 1.4;
      }

      .tc-rewrite-card {
        width: 380px;
        max-width: calc(100vw - 20px);
        padding: 12px;
      }

      .tc-rewrite-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 12px;
        font-weight: 600;
        color: #4f46e5;
      }

      .tc-rewrite-card-header svg {
        width: 14px;
        height: 14px;
      }

      .tc-rewrite-card-title {
        flex: 1;
      }

      .tc-rewrite-result {
        max-height: 220px;
        overflow-y: auto;
        font-size: 14px;
        line-height: 1.5;
        color: #111827;
        white-space: pre-wrap;
        word-wrap: break-word;
      }

      .tc-rewrite-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 0;
        font-size: 13px;
        color: #6b7280;
      }

      .tc-rewrite-error {
        font-size: 13px;
        color: #b91c1c;
        line-height: 1.4;
      }
`;
