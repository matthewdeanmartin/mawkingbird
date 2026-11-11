import { Component, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbHelp } from '../../design-system/help/help';
import { MbNotice } from '../../design-system/notice/notice';
import {
  BskyPostControlsValue,
  BskyReplyRule,
} from '../../connections/bluesky/bluesky-post-controls';

// i18n bskyControls.title: Bluesky reply and quote controls
// i18n bskyControls.close: Cancel
// i18n bskyControls.save: Apply
// i18n bskyControls.replies: Who can reply?
// i18n bskyControls.everyone: Everyone
// i18n bskyControls.nobody: Nobody
// i18n bskyControls.some: Only some people
// i18n bskyControls.mention: People mentioned in the post
// i18n bskyControls.follower: My followers
// i18n bskyControls.following: People I follow
// i18n bskyControls.lists: Members of {{count}} list(s) chosen on bsky.app can also reply. Choosing Everyone or Nobody removes them.
// i18n bskyControls.quotes: Who can quote this?
// i18n bskyControls.quotesOn: Anyone
// i18n bskyControls.quotesOff: Nobody
// i18n bskyControls.help: About these controls
// i18n bskyControls.explanation: Bluesky keeps these beside the post, and bsky.app shows the same settings. Limiting replies does not hide replies already made. Turning quotes off stops new quotes; to drop an existing one, detach it from the quote.
/**
 * Bluesky's own controls for a post: who may reply (threadgate) and whether
 * it may be quoted (postgate). Separate from the Mastodon permissions dialog
 * because the models differ: Bluesky posts are always public, and replies are
 * limited by rule (mentioned, followers, following) rather than by audience.
 */
@Component({
  selector: 'app-bluesky-post-controls-dialog',
  imports: [
    FormsModule,
    TranslocoPipe,
    MbDialog,
    MbField,
    MbControl,
    MbCheckbox,
    MbButton,
    MbHelp,
    MbNotice,
  ],
  template: `
    <mb-dialog
      [title]="'bskyControls.title' | transloco"
      [closeLabel]="'bskyControls.close' | transloco"
      [busy]="busy()"
      (dismissed)="closed.emit()"
    >
      <mb-field [label]="'bskyControls.replies' | transloco">
        <select mbControl [ngModel]="mode()" (ngModelChange)="mode.set($event)" [disabled]="busy()">
          <option value="everyone">{{ 'bskyControls.everyone' | transloco }}</option>
          <option value="some">{{ 'bskyControls.some' | transloco }}</option>
          <option value="nobody">{{ 'bskyControls.nobody' | transloco }}</option>
        </select>
      </mb-field>
      @if (mode() === 'some') {
        @for (rule of ruleNames; track rule) {
          <mb-checkbox
            [label]="ruleLabels[rule] | transloco"
            [checked]="rules().includes(rule)"
            [disabled]="busy()"
            (checkedChange)="toggle(rule, $event)"
          />
        }
        @if (initial().lists) {
          <p>{{ 'bskyControls.lists' | transloco: { count: initial().lists } }}</p>
        }
      }
      <mb-field [label]="'bskyControls.quotes' | transloco">
        <select
          mbControl
          [ngModel]="quotes()"
          (ngModelChange)="quotes.set($event)"
          [disabled]="busy()"
        >
          <option [ngValue]="true">{{ 'bskyControls.quotesOn' | transloco }}</option>
          <option [ngValue]="false">{{ 'bskyControls.quotesOff' | transloco }}</option>
        </select>
      </mb-field>
      @if (error()) {
        <mb-notice tone="error" announcement="alert">{{ error() }}</mb-notice>
      }
      <mb-help [label]="'bskyControls.help' | transloco">{{
        'bskyControls.explanation' | transloco
      }}</mb-help>
      <button
        mbDialogActions
        mbButton
        variant="outline"
        [disabled]="busy()"
        (click)="closed.emit()"
      >
        {{ 'bskyControls.close' | transloco }}
      </button>
      <button mbDialogActions mbButton [disabled]="busy()" (click)="apply()">
        {{ 'bskyControls.save' | transloco }}
      </button>
    </mb-dialog>
  `,
})
export class BlueskyPostControlsDialog implements OnInit {
  readonly initial = input.required<BskyPostControlsValue>();
  readonly busy = input(false);
  readonly error = input('');
  readonly closed = output<void>();
  readonly saved = output<BskyPostControlsValue>();

  protected readonly ruleNames: readonly BskyReplyRule[] = ['mention', 'follower', 'following'];
  protected readonly ruleLabels: Record<BskyReplyRule, string> = {
    mention: 'bskyControls.mention',
    follower: 'bskyControls.follower',
    following: 'bskyControls.following',
  };
  protected mode = signal<'everyone' | 'some' | 'nobody'>('everyone');
  protected rules = signal<BskyReplyRule[]>([]);
  protected quotes = signal(true);

  ngOnInit(): void {
    const { replies, quotes } = this.initial();
    this.mode.set(Array.isArray(replies) ? 'some' : replies);
    this.rules.set(Array.isArray(replies) ? replies : ['mention']);
    this.quotes.set(quotes);
  }

  protected toggle(rule: BskyReplyRule, on: boolean): void {
    this.rules.update((rules) =>
      on ? [...rules.filter((r) => r !== rule), rule] : rules.filter((r) => r !== rule),
    );
  }

  apply(): void {
    if (this.busy()) return;
    const mode = this.mode();
    // "Only some people" with nothing ticked and no lists is nobody, said plainly.
    const replies =
      mode !== 'some'
        ? mode
        : this.rules().length || this.initial().lists
          ? this.ruleNames.filter((rule) => this.rules().includes(rule))
          : 'nobody';
    this.saved.emit({ replies, quotes: this.quotes(), lists: this.initial().lists });
  }
}
