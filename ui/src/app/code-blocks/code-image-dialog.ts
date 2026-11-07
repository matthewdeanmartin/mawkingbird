import { Component, OnDestroy, computed, effect, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { MbDialog } from '../design-system/dialog/dialog';
import { HIGHLIGHT_LANGUAGES, languageLabel } from './code-fences';
import { ALT_TEXT_LIMIT, MAX_IMAGE_LINES, renderCodeImage } from './code-image';

// i18n codeImage.title: Code image
// i18n codeImage.close: Close
// i18n codeImage.intro: Paste code to post it as an image. The code itself becomes the image description, so screen readers and search still get the text.
// i18n codeImage.code: Code
// i18n codeImage.language: Language
// i18n codeImage.plain: Plain text
// i18n codeImage.preview: Preview of the code image
// i18n codeImage.count: {{count}} of {{limit}} characters for the description
// i18n codeImage.tooLong: Too long for an image description ({{limit}} characters). Share it as a paste instead, or post a shorter excerpt.
// i18n codeImage.tooManyLines: Only the first {{max}} lines fit in the image.
// i18n codeImage.failed: The image could not be made in this browser.
// i18n codeImage.attach: Attach image
// i18n codeImage.cancel: Cancel

/** What the dialog hands back: a PNG and its description (the code). */
export interface CodeImageResult {
  file: File;
  description: string;
}

/**
 * Paste code, get an image with the code as its alt text.
 *
 * Everything happens in the browser: highlight, draw onto a canvas, PNG. The
 * description limit is checked here, because an image of code whose text
 * cannot fit in its description would shut out exactly the readers alt text is
 * for.
 */
@Component({
  selector: 'app-code-image-dialog',
  imports: [MbDialog, MbButton, FormsModule, TranslocoPipe],
  template: `
    <mb-dialog
      size="wide"
      [title]="'codeImage.title' | transloco"
      [closeLabel]="'codeImage.close' | transloco"
      [description]="'codeImage.intro' | transloco"
      (dismissed)="closed.emit()"
    >
      <label class="field">
        <span>{{ 'codeImage.language' | transloco }}</span>
        <select [ngModel]="language()" (ngModelChange)="language.set($event)" name="language">
          <option value="">{{ 'codeImage.plain' | transloco }}</option>
          @for (lang of languages; track lang) {
            <option [value]="lang">{{ label(lang) }}</option>
          }
        </select>
      </label>
      <label class="field">
        <span>{{ 'codeImage.code' | transloco }}</span>
        <textarea
          class="code-input"
          rows="10"
          spellcheck="false"
          [ngModel]="code()"
          (ngModelChange)="code.set($event)"
          name="code"
        ></textarea>
      </label>
      <p class="muted small" [class.over]="tooLong()">
        @if (tooLong()) {
          {{ 'codeImage.tooLong' | transloco: { limit } }}
        } @else {
          {{ 'codeImage.count' | transloco: { count: code().length, limit } }}
        }
      </p>
      @if (tooManyLines()) {
        <p class="muted small">{{ 'codeImage.tooManyLines' | transloco: { max: maxLines } }}</p>
      }
      @if (failed()) {
        <p role="alert">{{ 'codeImage.failed' | transloco }}</p>
      }
      @if (previewUrl(); as url) {
        <img class="preview" [src]="url" [alt]="'codeImage.preview' | transloco" />
      }
      <div mbDialogActions>
        <button mbButton variant="outline" type="button" (click)="closed.emit()">
          {{ 'codeImage.cancel' | transloco }}
        </button>
        <button mbButton type="button" [disabled]="!canAttach()" (click)="attach()">
          {{ 'codeImage.attach' | transloco }}
        </button>
      </div>
    </mb-dialog>
  `,
  styles: `
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 8px;
    }
    .code-input {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.9em;
      width: 100%;
      box-sizing: border-box;
      tab-size: 4;
    }
    .over {
      color: var(--danger, #c0392b);
    }
    .preview {
      display: block;
      max-width: 100%;
      margin-top: 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
    }
  `,
})
export class CodeImageDialog implements OnDestroy {
  readonly attached = output<CodeImageResult>();
  readonly closed = output<void>();

  protected readonly languages = HIGHLIGHT_LANGUAGES;
  protected readonly limit = ALT_TEXT_LIMIT;
  protected readonly maxLines = MAX_IMAGE_LINES;
  protected readonly label = languageLabel;

  protected readonly code = signal('');
  protected readonly language = signal('python');
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly failed = signal(false);
  private blob: Blob | null = null;
  private renderId = 0;

  protected readonly tooLong = computed(() => this.code().length > ALT_TEXT_LIMIT);
  protected readonly tooManyLines = computed(
    () => this.code().split('\n').length > MAX_IMAGE_LINES,
  );
  protected readonly canAttach = computed(
    () => !!this.code().trim() && !this.tooLong() && !!this.previewUrl(),
  );

  constructor() {
    // Redraw shortly after typing pauses; a stale draw never replaces a newer one.
    effect((onCleanup) => {
      const code = this.code();
      const language = this.language();
      if (!code.trim()) {
        this.setPreview(null, null);
        return;
      }
      const id = ++this.renderId;
      const timer = setTimeout(() => {
        renderCodeImage(code, language)
          .then((blob) => {
            if (id !== this.renderId) return;
            this.failed.set(false);
            this.setPreview(blob, URL.createObjectURL(blob));
          })
          .catch(() => {
            if (id === this.renderId) this.failed.set(true);
          });
      }, 250);
      onCleanup(() => clearTimeout(timer));
    });
  }

  ngOnDestroy(): void {
    this.setPreview(null, null);
  }

  protected attach(): void {
    if (!this.blob || !this.canAttach()) return;
    const name = `code${this.language() ? `-${this.language()}` : ''}.png`;
    this.attached.emit({
      file: new File([this.blob], name, { type: 'image/png' }),
      description: this.code(),
    });
  }

  private setPreview(blob: Blob | null, url: string | null): void {
    const old = this.previewUrl();
    if (old) URL.revokeObjectURL(old);
    this.blob = blob;
    this.previewUrl.set(url);
  }
}
