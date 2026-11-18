import { booleanAttribute, Component, input, output, signal } from '@angular/core';

/** A picked or dropped file, with its path inside a picked folder when there is one. */
export interface MbPickedFile {
  path: string;
  file: File;
}

let nextId = 0;

/**
 * A native file input as a drop target.
 *
 * The whole surface is the input's `<label>`, so a click, Enter or Space opens
 * the system picker, and the visually hidden input keeps its native semantics
 * and Tab stop. Dropping files on the surface emits them the same way. The
 * caller owns what the files mean, reading them, and the busy state.
 *
 * `presentation="target"` is the large dashed surface for a page's main
 * input; `presentation="link"` is a single line in the accent colour, for a
 * secondary way in ("Already unzipped? Choose the folder").
 */
@Component({
  selector: 'mb-file-drop',
  template: `
    <label
      class="surface"
      [attr.data-presentation]="presentation()"
      [attr.data-dragging]="dragging() || null"
      [attr.data-busy]="busy() || null"
      (dragover)="over($event)"
      (dragleave)="dragging.set(false)"
      (drop)="dropped($event)"
    >
      <input
        class="native"
        type="file"
        [accept]="accept()"
        [multiple]="multiple() || directory()"
        [disabled]="disabled() || busy()"
        [attr.webkitdirectory]="directory() ? '' : null"
        [attr.aria-describedby]="hint() ? hintId : null"
        [attr.aria-busy]="busy() || null"
        (change)="picked($event)"
      />
      @if (presentation() === 'target') {
        <span class="icon" aria-hidden="true"><ng-content select="[mbFileDropIcon]" /></span>
      }
      <span class="title" [attr.role]="busy() ? 'status' : null">{{ label() }}</span>
      @if (hint() && presentation() === 'target') {
        <span class="hint" [id]="hintId">{{ hint() }}</span>
      }
      @if (action() && presentation() === 'target' && !busy()) {
        <span class="action" aria-hidden="true">{{ action() }}</span>
      }
    </label>
  `,
  styleUrl: './file-drop.css',
})
export class MbFileDrop {
  /** The surface's visible text and the input's name; pass the busy text while busy. */
  readonly label = input.required<string>();
  readonly hint = input('');
  /** Visible button-like text inside a target ("Choose the .zip…"). */
  readonly action = input('');
  readonly accept = input('');
  readonly multiple = input(false, { transform: booleanAttribute });
  /** Pick a whole folder (Chromium, Firefox and Safari support `webkitdirectory`). */
  readonly directory = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
  readonly presentation = input<'target' | 'link'>('target');

  /** Files picked or dropped; never emitted empty. */
  readonly files = output<MbPickedFile[]>();

  protected readonly dragging = signal(false);
  protected readonly hintId = `mb-file-drop-hint-${nextId++}`;

  protected over(event: DragEvent): void {
    if (this.disabled() || this.busy()) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  protected dropped(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.disabled() || this.busy()) return;
    this.emit([...(event.dataTransfer?.files ?? [])]);
  }

  protected picked(event: Event): void {
    const native = event.target as HTMLInputElement;
    const files = [...(native.files ?? [])];
    native.value = '';
    this.emit(files);
  }

  private emit(files: File[]): void {
    if (!files.length) return;
    this.files.emit(files.map((file) => ({ path: file.webkitRelativePath || file.name, file })));
  }
}
