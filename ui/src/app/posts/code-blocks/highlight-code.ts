import { Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';

type Highlighter = typeof import('./code-highlight');
let loading: Promise<Highlighter> | null = null;

/** Load the highlighter once, on first need. */
export function loadHighlighter(): Promise<Highlighter> {
  loading ??= import('./code-highlight');
  return loading;
}

/**
 * Colour the code blocks inside this element after it renders.
 *
 * Bind it to the same content the element shows (`[appHighlightCode]="html"`),
 * so it runs again whenever that content changes. Posts without a code block
 * cost one `querySelector`; the highlighter itself loads only when a block is
 * actually on screen.
 */
@Directive({ selector: '[appHighlightCode]' })
export class HighlightCode {
  readonly appHighlightCode = input<unknown>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterRenderEffect(() => {
      this.appHighlightCode();
      const blocks = [
        ...this.host.nativeElement.querySelectorAll<HTMLElement>('pre.mb-code > code'),
      ].filter((code) => !code.dataset['highlighted'] && /language-/.test(code.className));
      if (!blocks.length) return;
      void loadHighlighter()
        .then(({ highlightElement }) => {
          for (const code of blocks) {
            if (code.isConnected && !code.dataset['highlighted']) {
              highlightElement(code);
              code.dataset['highlighted'] = '1';
            }
          }
        })
        .catch(() => undefined);
    });
  }
}
