import type { SuggestionType } from '@/types';

export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function getSuggestionColor(type: SuggestionType): string {
  switch (type) {
    case 'spelling':
      return '#ef4444'; // red
    case 'grammar':
      return '#f59e0b'; // amber
    case 'punctuation':
      return '#3b82f6'; // blue
    case 'style':
      return '#8b5cf6'; // purple
    default:
      return '#6b7280'; // gray
  }
}

export function getSuggestionLabel(type: SuggestionType): string {
  switch (type) {
    case 'spelling':
      return 'Spelling';
    case 'grammar':
      return 'Grammar';
    case 'punctuation':
      return 'Punctuation';
    case 'style':
      return 'Style';
    default:
      return 'Issue';
  }
}

// Autocomplete tokens that indicate the field holds sensitive data
const SENSITIVE_AUTOCOMPLETE = [
  'cc-', 'one-time-code', 'password', 'username', 'email', 'tel',
  'bday', 'postal-code', 'street-address', 'address-line', 'transaction-',
];

// Name/id/placeholder hints for sensitive fields that lack autocomplete attributes
const SENSITIVE_NAME_PATTERN =
  /pass|pwd|card|cvv|cvc|iban|account|routing|ssn|social|tax|otp|token|secret|pin|code|security|login|user|email|phone|zip|postal/i;

function isSensitiveField(element: Element): boolean {
  // Respect explicit opt-outs used by sites and other grammar tools
  if (element.getAttribute('spellcheck') === 'false') return true;
  if (element.getAttribute('data-gramm') === 'false') return true;
  if (element.getAttribute('data-enable-grammarly') === 'false') return true;

  const autocomplete = (element.getAttribute('autocomplete') || '').toLowerCase();
  return SENSITIVE_AUTOCOMPLETE.some((token) => autocomplete.includes(token));
}

function hasSensitiveNameHint(element: Element): boolean {
  const hints = [
    element.getAttribute('name'),
    element.id,
    element.getAttribute('placeholder'),
    element.getAttribute('aria-label'),
  ].filter(Boolean).join(' ');
  return SENSITIVE_NAME_PATTERN.test(hints);
}

export function isEditableElement(element: Element): boolean {
  if (!element) return false;

  const tagName = element.tagName.toLowerCase();

  if (isSensitiveField(element)) return false;

  // Standard editable elements
  if (tagName === 'textarea') return true;
  if (tagName === 'input') {
    // Only free-text single-line inputs; never email/tel/url/password/number,
    // and skip inputs that look like credentials, payment or identity fields
    const type = (element as HTMLInputElement).type.toLowerCase();
    if (!['text', 'search'].includes(type)) return false;
    return !hasSensitiveNameHint(element);
  }

  // Contenteditable elements
  if (element.getAttribute('contenteditable') === 'true') return true;

  // Check for common rich text editor patterns
  if (element.getAttribute('role') === 'textbox') return true;

  // Gmail-specific editable attribute
  if (element.getAttribute('g_editable') === 'true') return true;

  return false;
}

export function getTextFromElement(element: HTMLElement): string {
  if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
    return (element as HTMLInputElement | HTMLTextAreaElement).value;
  }

  // For contenteditable
  return element.innerText || element.textContent || '';
}

export function setTextInElement(element: HTMLElement, text: string): void {
  if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
    (element as HTMLInputElement | HTMLTextAreaElement).value = text;
    // Trigger input event for frameworks that listen to it
    element.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // For contenteditable
  element.innerText = text;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
