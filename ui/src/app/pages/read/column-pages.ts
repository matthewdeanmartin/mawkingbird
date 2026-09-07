/** Native columns own line breaking; this index only locates text for navigation. */
export interface ColumnPages {
  text: string[];
  starts: (Range | null)[];
  stride: number;
}

export const READER_COLUMN_GAP = 48;

/** A column's zero-based index, independent of the viewport's scroll position. */
export function columnOf(rect: DOMRect, origin: DOMRect, stride: number): number {
  return Math.max(0, Math.floor((rect.left - origin.left + 1) / stride));
}

/**
 * Index the live DOM, never a differently styled measuring copy. A text node
 * may cross many columns. Binary search finds its breaks without measuring
 * every character. The DOM and its inline markup remain untouched.
 */
export function readColumnPages(element: HTMLElement): ColumnPages {
  const origin = element.getBoundingClientRect();
  const stride = origin.width + READER_COLUMN_GAP;
  if (!origin.width || !origin.height) {
    return { text: [element.textContent ?? ''], starts: [null], stride: 0 };
  }
  const count = Math.max(1, Math.round((element.scrollWidth + READER_COLUMN_GAP) / stride));
  const text = Array.from({ length: count }, () => '');
  const starts: (Range | null)[] = Array.from({ length: count }, () => null);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.length || node.parentElement?.closest('[aria-hidden="true"]')) {
      continue;
    }
    range.selectNodeContents(node);
    if (![...range.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0)) continue;
    const at = (offset: number): number => {
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      const rect = range.getClientRects()[0];
      return rect ? Math.min(count - 1, columnOf(rect, origin, stride)) : 0;
    };
    let start = 0;
    while (start < node.length) {
      const page = at(start);
      let low = start + 1;
      let high = node.length;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (at(mid) === page) low = mid + 1;
        else high = mid;
      }
      if (!starts[page]) {
        range.setStart(node, start);
        range.setEnd(node, Math.min(start + 1, node.length));
        starts[page] = range.cloneRange();
      }
      text[page] += node.data.slice(start, low);
      start = low;
    }
    // Preserve block boundaries through nested emphasis, and keep inline spaces.
    let tail: Node = node;
    while (!tail.nextSibling && tail.parentElement && tail.parentElement !== element) {
      tail = tail.parentElement;
      if ((tail as Element).matches('p,li,h1,h2,h3,h4,h5,h6,pre,section')) {
        text[at(node.length - 1)] += '\n';
        break;
      }
    }
  }
  return { text, starts, stride };
}
