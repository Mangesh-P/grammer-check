// Screen rectangles for a character range inside an editable field, used to
// draw underlines and to anchor the rewrite UI to a selection.
export function getCharacterRects(
  element: HTMLElement,
  startIndex: number,
  endIndex: number
): DOMRect[] {
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'textarea' || tagName === 'input') {
    return getTextareaCharacterRects(
      element as HTMLTextAreaElement | HTMLInputElement,
      startIndex,
      endIndex
    );
  }

  const range = getTextRange(element, startIndex, endIndex);
  return range ? Array.from(range.getClientRects()) : [];
}

// DOM Range covering a character range of a contenteditable's text nodes.
export function getTextRange(
  element: HTMLElement,
  startIndex: number,
  endIndex: number
): Range | null {
  let currentIndex = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node: Text | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: standard TreeWalker loop
  while ((node = walker.nextNode() as Text)) {
    const nodeLength = node.length;

    if (!startNode && currentIndex + nodeLength > startIndex) {
      startNode = node;
      startOffset = startIndex - currentIndex;
    }

    if (!endNode && currentIndex + nodeLength >= endIndex) {
      endNode = node;
      endOffset = endIndex - currentIndex;
      break;
    }

    currentIndex += nodeLength;
  }

  if (!startNode || !endNode) return null;

  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  } catch {
    return null;
  }
}

export function getTextareaCharacterRects(
  element: HTMLTextAreaElement | HTMLInputElement,
  startIndex: number,
  endIndex: number
): DOMRect[] {
  const text = element.value;
  const computedStyle = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  const mirror = document.createElement('div');
  mirror.style.cssText = `
    position: absolute;
    top: -9999px;
    left: -9999px;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow: hidden;
    visibility: hidden;
    font-family: ${computedStyle.fontFamily};
    font-size: ${computedStyle.fontSize};
    font-weight: ${computedStyle.fontWeight};
    line-height: ${computedStyle.lineHeight};
    letter-spacing: ${computedStyle.letterSpacing};
    padding: ${computedStyle.padding};
    border: ${computedStyle.border};
    width: ${element.offsetWidth}px;
  `;

  const before = document.createElement('span');
  before.textContent = text.substring(0, startIndex);

  const marked = document.createElement('span');
  marked.textContent = text.substring(startIndex, endIndex);

  const after = document.createElement('span');
  after.textContent = text.substring(endIndex);

  mirror.appendChild(before);
  mirror.appendChild(marked);
  mirror.appendChild(after);
  document.body.appendChild(mirror);

  const markedRect = marked.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();

  const relativeTop = markedRect.top - mirrorRect.top;
  const relativeLeft = markedRect.left - mirrorRect.left;

  const scrollTop = element.scrollTop || 0;
  const scrollLeft = element.scrollLeft || 0;

  const finalRect = new DOMRect(
    rect.left + relativeLeft - scrollLeft,
    rect.top + relativeTop - scrollTop,
    markedRect.width,
    markedRect.height
  );

  document.body.removeChild(mirror);
  return [finalRect];
}
