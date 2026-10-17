import { Component, inject, importProvidersFrom, signal } from "@angular/core";
import { applicationConfig, Meta, StoryObj } from "@storybook/angular";
import { provideRouter, withDisabledInitialNavigation } from "@angular/router";
import { of } from "rxjs";
import {
  provideHttpClient,
  withInterceptors,
  HttpResponse,
} from "../../ui/src/app/testing/storybook-http";
import { Notifications } from "../../ui/src/app/pages/notifications/notifications";
import { Auth } from "../../ui/src/app/auth";
import { Streaming } from "../../ui/src/app/streaming";
import { FakeStreaming } from "../../ui/src/app/testing/fake-streaming";
import { BlueskySession } from "../../ui/src/app/providers/bluesky/bluesky-session";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";
import { Account, Status } from "../../ui/src/app/models";
const account: Account = {
  id: "reader",
  username: "reader",
  acct: "reader@example.social",
  display_name: "Reader",
  avatar: "",
  avatar_static: "",
  header: "",
  note: "",
  url: "https://example.social/@reader",
  followers_count: 4,
  following_count: 4,
  statuses_count: 4,
  bot: false,
  locked: false,
  fields: [],
};
const status: Status = {
  edited_at: null,
  url: null,
  reblog: null,
  quote: null,
  in_reply_to_id: null,
  favourited: false,
  reblogged: false,
  bookmarked: false,
  muted: false,
  pinned: false,
  poll: null,
  quote_approval_policy: null,
  id: "post",
  account,
  content:
    "<p>A longer notification with enough text to wrap on a phone.</p><p>The action belongs below this text, alongside the other actions.</p>",
  created_at: "2026-10-17T12:00:00Z",
  media_attachments: [],
  visibility: "public",
  favourites_count: 1,
  reblogs_count: 0,
  replies_count: 0,
  emojis: [],
  spoiler_text: "",
  sensitive: false,
};
const notifications = ["mention", "reblog", "favourite", "favourite"].map(
  (type, i) => ({
    id: String(i),
    type,
    account: { ...account, id: String(i) },
    status,
    created_at: "2026-10-17T12:00:00Z",
  }),
);
@Component({
  selector: "notification-layout",
  imports: [Notifications],
  template: `<app-notifications />`,
})
class NotificationLayout {
  constructor() {
    const auth = inject(Auth);
    auth.kind.set("mastodon");
    auth.token.set("preview");
    auth.account.set(account);
  }
}
export default {
  title: "Adoption/Notification layout",
  component: NotificationLayout,
  decorators: [
    applicationConfig({
      providers: [
        importProvidersFrom(translocoTesting()),
        provideRouter([], withDisabledInitialNavigation()),
        { provide: Streaming, useClass: FakeStreaming },
        { provide: BlueskySession, useValue: { linked: signal(false) } },
        provideHttpClient(
          withInterceptors([
            (request) =>
              of(
                new HttpResponse({
                  status: 200,
                  body: request.url.includes("/notifications")
                    ? notifications
                    : [],
                }),
              ),
          ]),
        ),
      ],
    }),
  ],
} satisfies Meta<NotificationLayout>;
export const CompactActions: StoryObj<NotificationLayout> = {};
