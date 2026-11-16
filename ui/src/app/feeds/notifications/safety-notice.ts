import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MastodonNotification } from '../../platform/api/models';
import { Server } from '../../platform/http/server';

/** English source strings; see scripts/extract-i18n.mjs. */
// i18n pages.notifications.safety.warningTitle: A moderator acted on your account
// i18n pages.notifications.safety.action.none: Your server’s moderators sent you a warning.
// i18n pages.notifications.safety.action.disable: Your server’s moderators disabled your account. You can’t use it until this is reversed.
// i18n pages.notifications.safety.action.mark_statuses_as_sensitive: Your server’s moderators marked some of your posts as sensitive.
// i18n pages.notifications.safety.action.delete_statuses: Your server’s moderators deleted some of your posts.
// i18n pages.notifications.safety.action.sensitive: Your server’s moderators will mark your media as sensitive from now on.
// i18n pages.notifications.safety.action.silence: Your server’s moderators limited your account. Only people who already follow you see your posts.
// i18n pages.notifications.safety.action.suspend: Your server’s moderators suspended your account.
// i18n pages.notifications.safety.action.other: Your server’s moderators took action on your account.
// i18n pages.notifications.safety.moderatorSaid: The moderator wrote:
// i18n pages.notifications.safety.affectedPosts: Posts affected:
// i18n pages.notifications.safety.post: Post {{n}}
// i18n pages.notifications.safety.appeal: Appeal on {{server}}
// i18n pages.notifications.safety.appealSent: You already appealed. See it on {{server}}
// i18n pages.notifications.safety.severedTitle: You lost some connections
// i18n pages.notifications.safety.severed.domain_block: Your server’s admins blocked {{target}}. You lost {{followers}} followers and {{following}} people you followed.
// i18n pages.notifications.safety.severed.user_domain_block: You blocked {{target}}. You lost {{followers}} followers and {{following}} people you followed.
// i18n pages.notifications.safety.severed.account_suspension: Your server’s admins suspended {{target}}. You lost {{followers}} followers and {{following}} people you followed.
// i18n pages.notifications.safety.severed.other: {{target}} is no longer reachable from your server. You lost {{followers}} followers and {{following}} people you followed.
// i18n pages.notifications.safety.download: Download the list on {{server}}

/** Notification types that are account-safety notices, not engagement. */
const SAFETY_NOTICE_TYPES: ReadonlySet<string> = new Set([
  'moderation_warning',
  'severed_relationships',
]);

/** True for a notice about the viewer's own account; filters never hide these. */
export function isSafetyNotice(notification: MastodonNotification): boolean {
  return SAFETY_NOTICE_TYPES.has(notification.type);
}

const KNOWN_ACTIONS = new Set([
  'none',
  'disable',
  'mark_statuses_as_sensitive',
  'delete_statuses',
  'sensitive',
  'silence',
  'suspend',
]);
const KNOWN_SEVERANCE = new Set(['domain_block', 'user_domain_block', 'account_suspension']);

/**
 * A moderation warning or a severed-relationships notice, rendered plainly.
 *
 * Both concern the viewer's own account, so the actor is not worth showing.
 * Neither has a REST API for its follow-up (the appeal form, the CSV of lost
 * accounts): those are pages on the viewer's server, so the links open there,
 * in the browser. No push, sound or badge is attached to these.
 */
@Component({
  selector: 'app-safety-notice',
  imports: [RouterLink, TranslocoPipe],
  template: `
    @let n = notification();
    @if (n.moderation_warning; as warning) {
      <div class="notif safety-notice" data-safety="moderation_warning">
        <span class="safety-icon" aria-hidden="true">⚠️</span>
        <div class="notif-body">
          <strong>{{ 'pages.notifications.safety.warningTitle' | transloco }}</strong>
          <p class="safety-what">{{ actionKey() | transloco }}</p>
          @if (warning.text) {
            <p class="muted">{{ 'pages.notifications.safety.moderatorSaid' | transloco }}</p>
            <blockquote class="safety-quote">{{ warning.text }}</blockquote>
          }
          @if (warning.status_ids?.length) {
            <p class="safety-posts">
              {{ 'pages.notifications.safety.affectedPosts' | transloco }}
              @for (id of warning.status_ids; track id; let i = $index, last = $last) {
                <a [routerLink]="['/statuses', id]">{{
                  'pages.notifications.safety.post' | transloco: { n: i + 1 }
                }}</a
                >{{ last ? '' : ', ' }}
              }
            </p>
          }
          <a class="safety-link" [href]="appealUrl()" target="_blank" rel="noopener noreferrer"
            >{{
              (warning.appeal
                ? 'pages.notifications.safety.appealSent'
                : 'pages.notifications.safety.appeal'
              ) | transloco: { server: serverName() }
            }}
            ↗</a
          >
        </div>
      </div>
    } @else if (n.event; as event) {
      <div class="notif safety-notice" data-safety="severed_relationships">
        <span class="safety-icon" aria-hidden="true">🔗</span>
        <div class="notif-body">
          <strong>{{ 'pages.notifications.safety.severedTitle' | transloco }}</strong>
          <p class="safety-what">
            {{
              severanceKey()
                | transloco
                  : {
                      target: event.target_name,
                      followers: event.followers_count,
                      following: event.following_count,
                    }
            }}
          </p>
          <a class="safety-link" [href]="severedUrl()" target="_blank" rel="noopener noreferrer"
            >{{ 'pages.notifications.safety.download' | transloco: { server: serverName() } }} ↗</a
          >
        </div>
      </div>
    }
  `,
  styles: `
    .safety-notice {
      border-left: 3px solid var(--warning, #d29922);
    }
    .safety-icon {
      font-size: 1.4em;
      width: 40px;
      text-align: center;
      flex: none;
    }
    .safety-notice p {
      margin: 4px 0;
    }
    .safety-quote {
      margin: 4px 0 8px;
      padding-left: 10px;
      border-left: 2px solid var(--border);
      white-space: pre-wrap;
    }
  `,
})
export class SafetyNotice {
  readonly notification = input.required<MastodonNotification>();
  private readonly server = inject(Server);

  /** The viewer's own server, where the appeal form and the CSV live. */
  private readonly origin = computed(() => {
    const base = this.server.baseUrl();
    try {
      return new URL(base || location.origin).origin;
    } catch {
      return location.origin;
    }
  });

  protected readonly serverName = computed(() => new URL(this.origin()).host);

  protected readonly actionKey = computed(() => {
    const action = this.notification().moderation_warning?.action ?? '';
    return `pages.notifications.safety.action.${KNOWN_ACTIONS.has(action) ? action : 'other'}`;
  });

  protected readonly severanceKey = computed(() => {
    const type = this.notification().event?.type ?? '';
    return `pages.notifications.safety.severed.${KNOWN_SEVERANCE.has(type) ? type : 'other'}`;
  });

  protected readonly appealUrl = computed(() => {
    const id = this.notification().moderation_warning?.id ?? '';
    return `${this.origin()}/disputes/strikes/${encodeURIComponent(id)}`;
  });

  protected readonly severedUrl = computed(() => `${this.origin()}/severed_relationships`);
}
