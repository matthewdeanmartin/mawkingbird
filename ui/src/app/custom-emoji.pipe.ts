import { DOCUMENT } from '@angular/common';
import { inject, Pipe, PipeTransform } from '@angular/core';
import { CustomEmoji } from './models';

/** Replace shortcodes in text nodes only; keep URLs, attributes and code intact. */
@Pipe({ name: 'customEmoji' })
export class CustomEmojiPipe implements PipeTransform {
  private document = inject(DOCUMENT);

  transform(value: string, emojis: CustomEmoji[] | undefined, plainText = false): string {
    if (!plainText && (!emojis?.length || !value.includes(':'))) return value;
    const root = this.document.createElement('div');
    if (plainText) root.textContent = value;
    else root.innerHTML = value;
    if (!emojis?.length || !value.includes(':')) return root.innerHTML;
    const byCode = new Map(emojis.map((emoji) => [emoji.shortcode, emoji]));
    const visit = (parent: Node): void => {
      for (const node of [...parent.childNodes]) {
        if (node.nodeType === 1) {
          if (!['CODE', 'PRE', 'SCRIPT', 'STYLE'].includes((node as Element).tagName)) visit(node);
          continue;
        }
        if (node.nodeType !== 3) continue;
        const text = node.textContent ?? '';
        const fragment = this.document.createDocumentFragment();
        let last = 0;
        for (const match of text.matchAll(/:([a-zA-Z0-9_]+):/g)) {
          const emoji = byCode.get(match[1]);
          if (!emoji) continue;
          const src = emoji.static_url || emoji.url;
          if (!src) continue;
          try {
            if (!['https:', 'http:'].includes(new URL(src, this.document.baseURI).protocol))
              continue;
          } catch {
            continue;
          }
          fragment.append(this.document.createTextNode(text.slice(last, match.index)));
          const image = this.document.createElement('img');
          image.className = 'custom-emoji';
          image.src = src;
          image.alt = match[0];
          image.title = match[0];
          fragment.append(image);
          last = match.index + match[0].length;
        }
        if (last) {
          fragment.append(this.document.createTextNode(text.slice(last)));
          parent.replaceChild(fragment, node);
        }
      }
    };
    visit(root);
    return root.innerHTML;
  }
}
