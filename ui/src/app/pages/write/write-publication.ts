import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { DraftMedia, DraftSnapshot } from '../../drafts';
import { ComposeOptions } from '../../models';
import { applyMinimalMarkdown } from '../../markdown';
import { PasteProviderRegistry } from '../../providers/paste/paste-provider-registry';
import { PasteHistory } from '../../providers/paste/paste-history';
import { PasteCreateInput } from '../../providers/paste/paste-provider';
import { MataroaApi } from '../../providers/mataroa/mataroa-api';
import { BloggerApi } from '../../providers/blogger/blogger-api';
import { BloggerSession } from '../../providers/blogger/blogger-session';
import { HugoPublish } from '../../providers/hugo/hugo-publish';
import { HugoDeployWatch } from '../../providers/hugo/hugo-deploy-watch';
import { BlueskyPublication } from './bluesky-publication';

/** Publishing belongs to Write, never to a mounted mini composer or a Home handoff. */
@Injectable()
export class WritePublication {
  private api = inject(Api);
  private auth = inject(Auth);
  private server = inject(Server);
  private destroyRef = inject(DestroyRef);
  private bluesky = inject(BlueskyPublication);
  private pastes = inject(PasteProviderRegistry);
  private pasteHistory = inject(PasteHistory);
  private mataroa = inject(MataroaApi);
  private blogger = inject(BloggerApi);
  private bloggerSession = inject(BloggerSession);
  private hugo = inject(HugoPublish);
  private deployWatch = inject(HugoDeployWatch);
  readonly progress = signal('');
  readonly link = signal<string | null>(null);
  private operation: {
    key: string;
    id: string;
    parts: string[];
    confirmed: string[];
  } | null = null;

  async publish(snapshot: DraftSnapshot, media: DraftMedia[], scheduleAt: string): Promise<void> {
    const parts = snapshot.segments.map((part) => part.trim()).filter(Boolean);
    const target = snapshot.target ?? 'fedi';
    const title = snapshot.spoilerText.trim();
    const body = parts.join('\n\n');
    this.link.set(null);
    this.progress.set('Publishing…');
    if (target === 'paste') {
      const provider = this.pastes.get(snapshot.pasteProviderId ?? '') ?? this.pastes.default;
      const input: PasteCreateInput = {
        title,
        content: body,
        language: snapshot.pasteLanguage ?? 'text',
        expiry:
          provider.expiries.find((item) => item.value === snapshot.pasteExpiry)?.value ?? 'never',
        visibility:
          snapshot.visibility === 'public' && provider.visibilities.includes('public')
            ? 'public'
            : 'unlisted',
      };
      const created = await firstValueFrom(provider.create(input));
      this.pasteHistory.add(provider.id, provider.label, input, created);
      this.link.set(created.url);
      return;
    }
    if (target === 'blog') {
      await firstValueFrom(this.mataroa.createPost(title, body));
      return;
    }
    if (target === 'blogger') {
      const blogId = this.bloggerSession.blogId();
      if (!blogId) throw new Error('Choose a blog in Settings before publishing.');
      const created = await this.blogger.createPost({
        blogId,
        title,
        content: applyMinimalMarkdown(body),
        isDraft: false,
      });
      this.link.set(created.url ?? null);
      return;
    }
    if (target === 'hugo') {
      const account = this.auth.account();
      if (!account) throw new Error('Sign in before publishing.');
      const result = await this.hugo.publish({ title, body, account, isDraft: false });
      this.deployWatch.watch(result.commit.commitSha);
      return;
    }
    if (target === 'bsky') {
      await this.bluesky.publish(parts, media);
      return;
    }
    const account = this.auth.account()?.id;
    if (!account) throw new Error('Sign in before publishing.');
    const identity = () => JSON.stringify([this.server.baseUrl(), this.auth.account()?.id]);
    const initialIdentity = identity();
    const options: ComposeOptions = {
      visibility: snapshot.visibility,
      spoilerText: snapshot.spoilerText,
      sensitive: snapshot.sensitive,
      language: snapshot.postLanguage || undefined,
      mediaIds: media.map((item) => item.media.id),
      poll: snapshot.poll
        ? {
            options: snapshot.poll.options.filter((option) => option.trim()),
            multiple: snapshot.poll.multiple,
            expiresIn: snapshot.poll.expiresIn,
          }
        : undefined,
      scheduledAt: scheduleAt ? new Date(scheduleAt).toISOString() : undefined,
    };
    const key = JSON.stringify([
      initialIdentity,
      target,
      options,
      media.map((item) => item.description),
    ]);
    const previous = this.operation;
    if (
      previous &&
      (previous.key !== key || previous.confirmed.some((_, i) => previous.parts[i] !== parts[i]))
    ) {
      throw new Error(
        'This thread has already started. Keep its account, options and confirmed posts unchanged; edit only unfinished posts to retry.',
      );
    }
    const operation = previous ?? { key, id: crypto.randomUUID(), parts, confirmed: [] };
    this.operation = operation;
    operation.parts = [...parts];
    const checkContext = () => {
      if (this.destroyRef.destroyed || identity() !== initialIdentity)
        throw new Error('Publishing stopped because you left Write or changed accounts.');
    };
    try {
      for (const item of media) {
        checkContext();
        await firstValueFrom(this.api.updateMedia(item.media.id, item.description));
      }
      while (operation.confirmed.length < parts.length) {
        checkContext();
        const index = operation.confirmed.length;
        this.progress.set(`Publishing post ${index + 1} of ${parts.length}…`);
        const created = await firstValueFrom(
          this.api.postStatus(
            parts[index],
            index === 0
              ? options
              : {
                  visibility: options.visibility,
                  language: options.language,
                  spoilerText: options.spoilerText,
                  inReplyToId: operation.confirmed[index - 1],
                },
            `${operation.id}:${index}`,
          ),
        );
        operation.confirmed.push(created.id);
      }
      if (target === 'both') {
        checkContext();
        this.progress.set('Publishing to Bluesky…');
        await this.bluesky.publish(
          parts,
          media.filter((item) => item.file?.type.startsWith('image/')).slice(0, 4),
        );
      }
      this.operation = null;
    } catch (cause: unknown) {
      throw new Error(
        `${operation.confirmed.length} of ${parts.length} Mastodon posts confirmed. Retry here to continue without repeating confirmed posts. ${cause instanceof Error ? cause.message : 'The server could not publish the post.'}`,
        { cause },
      );
    }
  }
}
