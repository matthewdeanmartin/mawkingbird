import { MbNotice } from '../design-system/notice/notice';
import { Component, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbDialog } from '../design-system/dialog/dialog';
import { MbField, MbControl } from '../design-system/field/field';
import { MbButton } from '../design-system/button/button';
import { MbHelp } from '../design-system/help/help';

export interface PostPermissionsValue {
  visibility: string;
  quoteApprovalPolicy?: string;
  muteNotifications?: boolean;
}
// i18n permissions.title: Post permissions
// i18n permissions.close: Cancel
// i18n permissions.save: Apply
// i18n permissions.audience: Who can read this?
// i18n permissions.everyone: Everyone
// i18n permissions.followers: Followers only
// i18n permissions.mentioned: Mentioned people only
// i18n permissions.discovery: Public timelines and discovery
// i18n permissions.listed: Include in public timelines
// i18n permissions.unlisted: Keep out of public timelines (unlisted)
// i18n permissions.quotes: Who can quote this?
// i18n permissions.default: Account default
// i18n permissions.nobody: Nobody else
// i18n permissions.notifications: Thread notifications for me
// i18n permissions.on: On
// i18n permissions.off: Off
// i18n permissions.help: About these permissions
// i18n permissions.explanation: Unlisted posts are still public. This does not guarantee exclusion from search engines. Mentioned-only posts are not end-to-end encrypted. Turning off notifications does not prevent replies. Quote and notification controls apply to Mastodon. Quote controls require Mastodon 4.5 or newer and do not revoke existing quotes.
// i18n permissions.published: Mastodon cannot change a published post's audience or public-timeline visibility. Choose these before publishing; quote and notification settings can still be changed.
// i18n permissions.unsupported: Quote and notification controls here apply to Mastodon. Other publishing destinations keep their own permissions.
@Component({
  selector: 'app-post-permissions',
  imports: [FormsModule, TranslocoPipe, MbDialog, MbField, MbControl, MbButton, MbHelp, MbNotice],
  template: `
    <mb-dialog
      [title]="'permissions.title' | transloco"
      [closeLabel]="'permissions.close' | transloco"
      [busy]="busy()"
      (dismissed)="closed.emit()"
    >
      <mb-field [label]="'permissions.audience' | transloco">
        <select
          mbControl
          [ngModel]="audience()"
          (ngModelChange)="audience.set($event)"
          [disabled]="busy() || locked() || published()"
        >
          <option value="public">{{ 'permissions.everyone' | transloco }}</option>
          <option value="private">{{ 'permissions.followers' | transloco }}</option>
          <option value="direct">{{ 'permissions.mentioned' | transloco }}</option>
        </select>
      </mb-field>
      @if (audience() === 'public') {
        <mb-field [label]="'permissions.discovery' | transloco">
          <select
            mbControl
            [ngModel]="listed()"
            (ngModelChange)="listed.set($event)"
            [disabled]="busy() || locked() || published()"
          >
            <option [ngValue]="true">{{ 'permissions.listed' | transloco }}</option>
            <option [ngValue]="false">{{ 'permissions.unlisted' | transloco }}</option>
          </select>
        </mb-field>
      }
      @if (published()) {
        <p>{{ 'permissions.published' | transloco }}</p>
      }
      @if (mastodon()) {
        <mb-field [label]="'permissions.quotes' | transloco">
          <select
            mbControl
            [ngModel]="audience() === 'public' ? quotes() : 'nobody'"
            (ngModelChange)="quotes.set($event)"
            [disabled]="busy() || audience() !== 'public'"
          >
            <option value="">{{ 'permissions.default' | transloco }}</option>
            <option value="public">{{ 'permissions.everyone' | transloco }}</option>
            <option value="followers">{{ 'permissions.followers' | transloco }}</option>
            <option value="nobody">{{ 'permissions.nobody' | transloco }}</option>
          </select>
        </mb-field>
        <mb-field [label]="'permissions.notifications' | transloco">
          <select
            mbControl
            [disabled]="busy()"
            [ngModel]="muted()"
            (ngModelChange)="muted.set($event)"
          >
            <option [ngValue]="false">{{ 'permissions.on' | transloco }}</option>
            <option [ngValue]="true">{{ 'permissions.off' | transloco }}</option>
          </select>
        </mb-field>
      } @else {
        <p>{{ 'permissions.unsupported' | transloco }}</p>
      }
      @if (error()) {
        <mb-notice tone="error" announcement="alert">{{ error() }}</mb-notice>
      }
      <mb-help [label]="'permissions.help' | transloco">{{
        'permissions.explanation' | transloco
      }}</mb-help>
      <button
        mbDialogActions
        mbButton
        variant="outline"
        [disabled]="busy()"
        (click)="closed.emit()"
      >
        {{ 'permissions.close' | transloco }}
      </button>
      <button mbDialogActions mbButton [disabled]="busy()" (click)="apply()">
        {{ 'permissions.save' | transloco }}
      </button>
    </mb-dialog>
  `,
})
export class PostPermissions implements OnInit {
  readonly initial = input.required<PostPermissionsValue>();
  readonly busy = input(false);
  readonly error = input('');
  readonly published = input(false);
  readonly locked = input(false);
  readonly mastodon = input(true);
  readonly closed = output<void>();
  readonly saved = output<PostPermissionsValue>();
  protected audience = signal('public');
  protected listed = signal(true);
  protected quotes = signal('');
  protected muted = signal(false);
  ngOnInit(): void {
    const value = this.initial();
    this.audience.set(value.visibility === 'unlisted' ? 'public' : value.visibility);
    this.listed.set(value.visibility !== 'unlisted');
    this.quotes.set(value.quoteApprovalPolicy ?? '');
    this.muted.set(value.muteNotifications ?? false);
  }
  apply(): void {
    if (this.busy()) return;
    this.saved.emit({
      visibility:
        this.published() || this.locked()
          ? this.initial().visibility
          : this.audience() === 'public' && !this.listed()
            ? 'unlisted'
            : this.audience(),
      quoteApprovalPolicy: this.mastodon()
        ? this.audience() === 'public'
          ? this.quotes() || undefined
          : 'nobody'
        : undefined,
      muteNotifications: this.mastodon() && this.muted(),
    });
  }
}
