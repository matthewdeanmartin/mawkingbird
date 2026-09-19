import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { TranslocoService } from '@jsverse/transloco';
import { Api } from '../api';
import { AppDialogs } from '../app-dialogs';
import { qualifiedHandle } from '../account-handle';
import { BlueskyApi } from '../providers/bluesky/bluesky-api';
import { HttpErrorResponse } from '@angular/common/http';

// i18n compose.mentions.invalid: Check @{{handle}} — that handle is not valid. Your reply has not been sent.
// i18n compose.mentions.missing: No exact account was found for @{{handle}}. Check the spelling; your reply has not been sent.
// i18n compose.mentions.unavailable: Could not check @{{handle}} right now. Try again; your reply has not been sent.
// i18n compose.mentions.title: Check the people you are mentioning
// i18n compose.mentions.review: Your reply will mention: {{people}}
// i18n compose.mentions.continue: Use these mentions

/** Ignore addresses/URLs and explicitly quoted code; keep malformed handles to explain them. */
export function replyMentions(text: string): string[] {
  const prose = text.replace(/```[\s\S]*?```|`[^`\n]*`|https?:\/\/\S+|^\s*>.*$/gm, '');
  return [
    ...new Set(
      Array.from(prose.matchAll(/(?:^|[\s(])@([^\s<>"'()[\]{}]+)/g), (match) =>
        match[1].replace(/[.,!?;:]+$/, '').toLowerCase(),
      ).filter(Boolean),
    ),
  ];
}

@Injectable({ providedIn: 'root' })
export class ReplyMentions {
  private api = inject(Api);
  private bluesky = inject(BlueskyApi);
  private i18n = inject(TranslocoService);
  private dialogs = inject(AppDialogs);

  async review(
    handles: string[],
    network: 'mastodon' | 'bluesky',
    current: () => boolean,
  ): Promise<boolean> {
    const people: string[] = [];
    for (const handle of handles) {
      if (!current()) return false;
      const valid =
        network === 'mastodon'
          ? /^[\w.-]+(?:@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i.test(handle) ||
            /^[\w.-]+$/.test(handle)
          : /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i.test(handle);
      if (!valid) throw new Error(this.i18n.translate('compose.mentions.invalid', { handle }));
      let person: string | null = null;
      try {
        if (network === 'bluesky') {
          const profile = await firstValueFrom(
            this.bluesky.getProfile(handle).pipe(timeout(10_000)),
          );
          if (profile.handle.toLowerCase() === handle)
            person = `${profile.displayName || profile.handle} (@${profile.handle})`;
        } else {
          const result = await firstValueFrom(
            this.api.resolveReplyMention(handle).pipe(timeout(10_000)),
          );
          const account = result.accounts.find(
            (account) =>
              account.acct.toLowerCase() === handle ||
              qualifiedHandle(account)?.toLowerCase() === handle,
          );
          if (account)
            person = `${account.display_name || account.username} (@${qualifiedHandle(account) || account.acct})`;
        }
      } catch (error) {
        throw new Error(
          this.i18n.translate(
            error instanceof HttpErrorResponse && error.status === 404
              ? 'compose.mentions.missing'
              : 'compose.mentions.unavailable',
            { handle },
          ),
          { cause: error },
        );
      }
      if (!person) throw new Error(this.i18n.translate('compose.mentions.missing', { handle }));
      people.push(person);
    }
    if (!current()) return false;
    return (
      !people.length ||
      (await this.dialogs.confirm(
        this.i18n.translate('compose.mentions.review', { people: people.join(', ') }),
        {
          title: this.i18n.translate('compose.mentions.title'),
          confirmLabel: this.i18n.translate('compose.mentions.continue'),
        },
      ))
    );
  }
}
