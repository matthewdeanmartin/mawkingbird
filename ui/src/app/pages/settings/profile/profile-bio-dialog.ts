import {
  Component,
  computed,
  ElementRef,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../../design-system/button/button';
import { MbDialog } from '../../../design-system/dialog/dialog';
import { MbControl, MbField } from '../../../design-system/field/field';
import { EmojiPicker } from '../../../emoji-picker/emoji-picker';
import { renderStatusText } from '../../../compose/status-text';
import { CustomEmoji } from '../../../models';

// i18n settings.profile.bio.edit: Edit bio
// i18n settings.profile.bio.cancel: Cancel
// i18n settings.profile.bio.editorHint: Write your bio as plain text. Links, line breaks and emoji are supported. Apply returns to your profile settings; Save changes publishes it.
// i18n settings.profile.bio.apply: Apply
// i18n settings.profile.bio.preview: Preview
// i18n settings.profile.bio.emoji: Emoji
// i18n settings.profile.bio.bullet: Bullet
// i18n settings.profile.bio.characters: {{count}} characters
// i18n settings.profile.bio.limit: {{count}} / {{limit}} characters
// i18n settings.profile.bio.tooLong: Shorten your bio to {{limit}} characters before applying.

/** Text-only sibling of Write's editor: no post, media, scheduling or publishing state. */
@Component({
  selector: 'app-profile-bio-dialog',
  imports: [FormsModule, TranslocoPipe, MbButton, MbDialog, MbControl, MbField, EmojiPicker],
  template: `
    <mb-dialog
      [title]="'settings.profile.bio.edit' | transloco"
      [closeLabel]="'settings.profile.bio.cancel' | transloco"
      [description]="'settings.profile.bio.editorHint' | transloco"
      (dismissed)="cancelled.emit()"
    >
      <div class="tools">
        <button
          mbButton
          type="button"
          variant="outline"
          size="small"
          [attr.aria-expanded]="showEmoji()"
          (click)="showEmoji.set(!showEmoji())"
        >
          {{ 'settings.profile.bio.emoji' | transloco }}
        </button>
        <button mbButton type="button" variant="outline" size="small" (click)="insert('• ')">
          {{ 'settings.profile.bio.bullet' | transloco }}
        </button>
      </div>
      @if (showEmoji()) {
        <app-emoji-picker (picked)="insert($event); showEmoji.set(false)" />
      }
      <mb-field
        [label]="'settings.profile.bio' | transloco"
        [hint]="
          (limit() === null ? 'settings.profile.bio.characters' : 'settings.profile.bio.limit')
            | transloco: { count: count(), limit: limit() }
        "
        [error]="tooLong() ? ('settings.profile.bio.tooLong' | transloco: { limit: limit() }) : ''"
      >
        <textarea
          #editor
          mbControl
          rows="12"
          [ngModel]="draft()"
          (ngModelChange)="draft.set($event)"
          [ngModelOptions]="{ standalone: true }"
          (select)="rememberSelection()"
          (click)="rememberSelection()"
          (keyup)="rememberSelection()"
          (blur)="rememberSelection()"
        ></textarea>
      </mb-field>
      <h3>{{ 'settings.profile.bio.preview' | transloco }}</h3>
      <div class="bio-preview" [innerHTML]="preview()"></div>
      <div mbDialogActions>
        <button mbButton type="button" variant="outline" (click)="cancelled.emit()">
          {{ 'settings.profile.bio.cancel' | transloco }}
        </button>
        <button mbButton type="button" [disabled]="tooLong()" (click)="apply()">
          {{ 'settings.profile.bio.apply' | transloco }}
        </button>
      </div>
    </mb-dialog>
  `,
  styles: `
    .tools,
    [mbDialogActions] {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    textarea {
      min-height: 32vh;
      resize: vertical;
      line-height: 1.5;
    }
    h3 {
      font-size: 1rem;
      margin-bottom: 8px;
    }
    .bio-preview {
      overflow-wrap: anywhere;
      line-height: 1.5;
    }
  `,
})
export class ProfileBioDialog implements OnInit {
  readonly text = input.required<string>();
  readonly emojis = input<CustomEmoji[]>([]);
  readonly limit = input<number | null>(null);
  readonly applied = output<string>();
  readonly cancelled = output<void>();
  protected draft = signal('');
  protected showEmoji = signal(false);
  private editor = viewChild.required<ElementRef<HTMLTextAreaElement>>('editor');
  private selection = { start: 0, end: 0 };
  protected count = computed(
    () =>
      [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(this.draft())].length,
  );
  protected tooLong = computed(() => this.limit() !== null && this.count() > this.limit()!);
  protected preview = computed(() => renderStatusText(this.draft(), this.emojis()));

  ngOnInit(): void {
    this.draft.set(this.text());
  }
  protected rememberSelection(): void {
    const editor = this.editor().nativeElement;
    this.selection = { start: editor.selectionStart, end: editor.selectionEnd };
  }
  protected insert(text: string): void {
    const { start, end } = this.selection;
    this.draft.update((value) => value.slice(0, start) + text + value.slice(end));
    const editor = this.editor().nativeElement;
    editor.value = this.draft();
    editor.focus();
    editor.setSelectionRange(start + text.length, start + text.length);
    this.rememberSelection();
  }
  protected apply(): void {
    if (!this.tooLong()) this.applied.emit(this.draft());
  }
}
