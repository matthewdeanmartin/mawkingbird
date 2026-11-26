import { Component, inject, importProvidersFrom, ChangeDetectionStrategy } from "@angular/core";
import {
  provideHttpClient,
  withInterceptors,
  HttpResponse,
} from "../../ui/src/app/testing/storybook-http";
import { provideRouter, withDisabledInitialNavigation } from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { NEVER, of } from "rxjs";
import { Conversations } from "../../ui/src/app/publishing/conversations/conversations";
import { Auth } from "../../ui/src/app/platform/session/auth";
import { Streaming } from "../../ui/src/app/platform/api/streaming";
import { Account, Status } from "../../ui/src/app/platform/api/models";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

const account = (id: string) =>
  ({
    id,
    username: id,
    acct: id + "@example.social",
    display_name: id,
    avatar: "/favicon-32x32.png",
    avatar_static: "/favicon-32x32.png",
    emojis: [],
    fields: [],
    note: "",
    url: "https://example.social/@" + id,
  }) as unknown as Account;
const alice = account("alice");
const status = {
  id: "hello",
  account: alice,
  content: "<p>Hello there!</p>",
  visibility: "public",
  created_at: "2026-11-14T12:00:00Z",
  media_attachments: [],
  mentions: [],
  emojis: [],
  spoiler_text: "",
  favourites_count: 0,
  reblogs_count: 0,
} as unknown as Status;

@Component({ imports: [Conversations], changeDetection: ChangeDetectionStrategy.Eager,
 template: `<app-conversations />` })
class ChatReview {
  constructor() {
    const auth = inject(Auth);
    auth.setToken("chat-preview-only");
    auth.account.set(account("reader"));
  }
}

export default {
  title: "Adoption/Chat",
  component: ChatReview,
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([], withDisabledInitialNavigation()),
        importProvidersFrom(translocoTesting()),
        {
          provide: Streaming,
          useValue: { open: () => NEVER, retryNow: () => undefined },
        },
        provideHttpClient(
          withInterceptors([
            (request) => {
              let body: unknown = [];
              if (request.url.includes("/notifications"))
                body = [
                  {
                    id: "notification",
                    type: "mention",
                    account: alice,
                    status,
                  },
                ];
              if (request.url.endsWith("/context"))
                body = { ancestors: [], descendants: [] };
              if (request.url.includes("/instance"))
                body = { configuration: { statuses: { max_characters: 500 } } };
              if (request.url.includes("/search"))
                body = { accounts: [alice], statuses: [], hashtags: [] };
              if (
                request.url === "/api/v1/statuses" &&
                request.method === "POST"
              ) {
                const posted = request.body as {
                  status: string;
                  in_reply_to_id: string;
                  visibility: string;
                };
                body = {
                  ...status,
                  id: "emoji-reply",
                  account: account("reader"),
                  content: `<p>${posted.status}</p>`,
                  in_reply_to_id: posted.in_reply_to_id,
                  visibility: posted.visibility,
                };
              }
              return of(new HttpResponse({ body }));
            },
          ]),
        ),
      ],
    }),
  ],
} satisfies Meta<ChatReview>;
export const Conversation: StoryObj<ChatReview> = {};
