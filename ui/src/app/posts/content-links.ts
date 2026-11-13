import { Directive, Pipe, PipeTransform } from '@angular/core';

/** Display only: never use this shortened label as a navigation target. */
export function compactUrlLabel(href: string): string {
  try {
    const url = new URL(href);
    if (!['http:', 'https:'].includes(url.protocol)) return href;
    const tail =
      url.pathname === '/' && !url.search && !url.hash ? '' : url.pathname + url.search + url.hash;
    const characters = Array.from(tail);
    return url.host + characters.slice(0, 20).join('') + (characters.length > 20 ? '…' : '');
  } catch {
    return href;
  }
}

export interface LinkedTextPart {
  text: string;
  href?: string;
}

/** Plain text stays text, including model output that happens to contain HTML. */
export function splitLinkedText(text: string): LinkedTextPart[] {
  const parts: LinkedTextPart[] = [];
  let end = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/giu)) {
    let href = match[0].replace(/[.,!?;:]+$/u, '');
    for (const [open, close] of [
      ['(', ')'],
      ['[', ']'],
      ['{', '}'],
    ]) {
      while (href.endsWith(close) && href.split(close).length > href.split(open).length)
        href = href.slice(0, -1);
    }
    try {
      new URL(href);
    } catch {
      continue;
    }
    if (match.index > end) parts.push({ text: text.slice(end, match.index) });
    parts.push({ text: compactUrlLabel(href), href });
    end = match.index + href.length;
  }
  if (end < text.length) parts.push({ text: text.slice(end) });
  return parts;
}

/** Shared post/chat/inbox presentation; descriptive labels and code stay intact. */
export function compactContentLinks(
  content: string,
  embeddedPostUrl: string | null = null,
): string {
  const doc = new DOMParser().parseFromString(content, 'text/html');
  for (const anchor of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = anchor.getAttribute('href')!;
    if (embeddedPostUrl === href) {
      const parent = anchor.parentElement;
      anchor.remove();
      if (parent?.tagName === 'P' && !parent.textContent?.trim() && !parent.children.length)
        parent.remove();
      continue;
    }
    if (anchor.closest('pre, code') || anchor.matches('.mention, .hashtag')) continue;
    try {
      const url = new URL(href);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      const visible = (anchor.textContent ?? '').trim();
      // Mastodon can split a URL between invisible/ellipsis spans; textContent
      // reconstructs it. Other providers omit the scheme from their labels.
      if (
        /^https?:\/\/\S+$/iu.test(visible) ||
        (visible.startsWith(url.host) &&
          !/\s/u.test(visible) &&
          ['', '/', '?', '#'].includes(visible.slice(url.host.length, url.host.length + 1)))
      ) {
        anchor.textContent = compactUrlLabel(href);
      }
    } catch {
      /* Relative and malformed links retain their supplied label. */
    }
  }
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (node.parentElement?.closest('a, pre, code, script, style, textarea')) continue;
    const parts = splitLinkedText(node.data);
    if (!parts.some((part) => part.href)) continue;
    const fragment = doc.createDocumentFragment();
    for (const part of parts) {
      if (!part.href) fragment.append(doc.createTextNode(part.text));
      else {
        const anchor = doc.createElement('a');
        anchor.setAttribute('href', part.href);
        anchor.textContent = part.text;
        fragment.append(anchor);
      }
    }
    node.replaceWith(fragment);
  }
  return doc.body.innerHTML;
}

@Pipe({ name: 'compactLinks' })
export class CompactLinksPipe implements PipeTransform {
  transform(content: string): string {
    return compactContentLinks(content);
  }
}

/** Let an excerpt's URL open itself instead of triggering the containing row. */
function stopContentLinkPropagation(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element) || !(event.currentTarget instanceof Element)) return;
  const anchor = target.closest('a[href]');
  if (anchor && event.currentTarget.contains(anchor)) event.stopPropagation();
}

/** Delegates native anchor clicks (including keyboard activation); the container is not a control. */
@Directive({ selector: '[appContentLinks]', host: { '(click)': 'stopClick($event)' } })
export class ContentLinks {
  protected readonly stopClick = stopContentLinkPropagation;
}
