import { Component, computed, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CodeBlock, codeFileName, extractCodeBlocks, languageLabel } from './code-fences';
import { playgroundFor } from './code-playgrounds';

// i18n codeBlocks.copy: Copy code
// i18n codeBlocks.copyNamed: Copy {{name}} code
// i18n codeBlocks.copied: Copied
// i18n codeBlocks.save: Save as {{file}}
// i18n codeBlocks.open: Open in {{playground}}
// i18n codeBlocks.copyFailed: Couldn't copy. Select the code and copy it instead.

interface Row {
  block: CodeBlock;
  index: number;
  label: string;
  file: string;
  playground: string | null;
}

/**
 * The code-block rows in a post's ••• menu: copy, save as a file, and open in
 * a playground, once per block. The toolbar under a post is full, so these
 * live in the menu, and only on posts that contain a fenced block.
 */
@Component({
  selector: 'app-code-menu-items',
  imports: [TranslocoPipe],
  template: `
    @for (row of rows(); track row.index) {
      <button type="button" (click)="copy(row, $event)">
        @if (copied() === row.index) {
          {{ 'codeBlocks.copied' | transloco }}
        } @else if (row.label) {
          {{ 'codeBlocks.copyNamed' | transloco: { name: row.label } }}
        } @else {
          {{ 'codeBlocks.copy' | transloco }}
        }
      </button>
      <button type="button" (click)="save(row, $event)">
        {{ 'codeBlocks.save' | transloco: { file: row.file } }}
      </button>
      @if (row.playground; as playground) {
        <button type="button" (click)="open(row, $event)">
          {{ 'codeBlocks.open' | transloco: { playground } }}
        </button>
      }
    }
    @if (failed()) {
      <p role="alert">{{ 'codeBlocks.copyFailed' | transloco }}</p>
    }
  `,
  // A row in a ••• menu, matching its other entries (see media-download-menu-item).
  styles: `
    :host {
      display: contents;
    }
    button {
      display: block;
      width: 100%;
      text-align: left;
      cursor: pointer;
      font: inherit;
      color: inherit;
      background: none;
      border: 0;
      padding: 7px 9px;
      border-radius: 6px;
    }
    button:hover,
    button:focus-visible {
      background: var(--border);
    }
    [role='alert'] {
      margin: 0;
      padding: 4px 9px;
      font-size: 0.85rem;
    }
  `,
})
export class CodeMenuItems {
  /** The post's HTML, as the server sent it. */
  readonly content = input('');

  protected readonly copied = signal<number | null>(null);
  protected readonly failed = signal(false);

  protected readonly rows = computed<Row[]>(() => {
    const blocks = extractCodeBlocks(this.content());
    const several = blocks.length > 1;
    return blocks.map((block, index) => ({
      block,
      index,
      // With one block, "Copy code" is enough; with several, say which.
      label: several ? languageLabel(block.language) || `#${index + 1}` : '',
      file: codeFileName(block, index),
      playground: playgroundFor(block)?.name ?? null,
    }));
  });

  protected async copy(row: Row, event: Event): Promise<void> {
    event.stopPropagation();
    this.failed.set(false);
    try {
      await navigator.clipboard.writeText(row.block.code);
      this.copied.set(row.index);
      setTimeout(() => this.copied.set(null), 1500);
    } catch {
      this.failed.set(true);
    }
  }

  protected save(row: Row, event: Event): void {
    event.stopPropagation();
    const url = URL.createObjectURL(new Blob([row.block.code], { type: 'text/plain' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = row.file;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    this.close(event);
  }

  protected async open(row: Row, event: Event): Promise<void> {
    event.stopPropagation();
    const playground = playgroundFor(row.block);
    if (!playground) return;
    // Open the tab synchronously (popup blockers), then point it at the URL.
    const tab = window.open('about:blank', '_blank');
    const url = await playground.url(row.block.code);
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    this.close(event);
  }

  private close(event: Event): void {
    (event.target as HTMLElement | null)?.closest('details')?.removeAttribute('open');
  }
}
