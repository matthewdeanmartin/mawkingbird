import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable, Subject, takeUntil, timeout, timer } from 'rxjs';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { scopeSuffixForMastodonAccount } from '../../account-scope';
import { MediaAttachment, Status } from '../../models';
import { AudioCatalogue } from './audio-catalogue';
import { matchesMedia } from '../../media-query';

const CATALOGUE_KEY = 'mockingbird_radio_catalogue';
interface UploadLimits {
  configuration?: {
    media_attachments?: {
      supported_mime_types?: string[];
      video_size_limit?: number;
      audio_size_limit?: number;
    };
  };
}

/** Lazy, tab-lived workspace. Draft bytes never enter browser storage. */
@Injectable({ providedIn: 'root' })
export class RadioStudioSession {
  private readonly api = inject(Api);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly server = inject(Server);
  private readonly aborted = new Subject<void>();
  private identity = '';
  private key = '';
  private accountId = '';
  readonly ready = signal(false);
  readonly error = signal('');
  readonly storageFailed = signal(false);
  readonly catalogue = signal(this.newCatalogue());
  readonly file = signal<File | null>(null);
  readonly preview = signal('');
  readonly busy = signal(false);
  readonly locked = signal(false);
  readonly published = signal<Status | null>(null);
  readonly opened = signal<Status | null>(null);
  readonly opening = signal(false);
  readonly attached = signal<MediaAttachment | null>(null);
  private media?: MediaAttachment;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.aborted.next();
      this.catalogue().cancel();
      this.releasePreview();
    });
    effect(() => {
      const identity = this.currentIdentity();
      if (identity === this.identity) return;
      this.aborted.next();
      this.catalogue().cancel();
      this.discard();
      this.identity = identity;
      this.key = '';
      this.accountId = '';
      this.ready.set(false);
      this.opened.set(null);
      this.opening.set(false);
      this.storageFailed.set(false);
      this.catalogue.set(this.newCatalogue());
      if (!this.auth.isAnonymous && !this.auth.isBlueskyPrimary) void this.initialize();
    });
  }

  private currentIdentity(): string {
    return `${this.auth.kind()}:${this.auth.token()}:${this.server.baseUrl()}`;
  }

  async initialize(): Promise<void> {
    const identity = this.identity;
    this.error.set('');
    try {
      const account = await this.request(this.api.verifyCredentials());
      if (!this.isCurrent(identity)) return;
      this.accountId = account.id;
      this.key = CATALOGUE_KEY + scopeSuffixForMastodonAccount(account.id, this.server.baseUrl());
      try {
        this.catalogue().restore(localStorage.getItem(this.key));
      } catch {
        this.storageFailed.set(true);
      }
      this.ready.set(true);
    } catch {
      if (this.isCurrent(identity)) this.error.set('radio.studioFailed');
    }
  }

  scan(refresh = false): void {
    if (!this.ready() || !this.isCurrent(this.identity)) return;
    const id = this.accountId;
    void this.catalogue().scan(
      (maxId) =>
        this.api.getAccountStatuses(id, {
          maxId,
          limit: 40,
          onlyMedia: false,
          excludeReblogs: true,
        }),
      refresh,
    );
  }

  async open(id: string): Promise<void> {
    if (this.opening() || !this.ready() || !this.isCurrent(this.identity)) return;
    const identity = this.identity;
    this.opening.set(true);
    this.opened.set(null);
    this.error.set('');
    try {
      const post = await this.request(this.api.getStatus(id));
      if (!this.isCurrent(identity)) return;
      if (post.account.id !== this.accountId || !matchesMedia(post, ['audio'])) {
        this.catalogue().unavailable(id);
        return;
      }
      this.opened.set(post);
      this.catalogue().remember(post);
    } catch (error) {
      if (!this.isCurrent(identity)) return;
      if ([404, 410].includes((error as { status?: number }).status ?? 0))
        this.catalogue().unavailable(id);
      else this.error.set('radio.studioFailed');
    } finally {
      if (this.isCurrent(identity)) this.opening.set(false);
    }
  }

  stage(file: File): void {
    if (this.busy() || this.locked()) return;
    this.error.set('');
    if (!file.type.startsWith('audio/') || !file.size) {
      this.error.set('radio.audioOnly');
      return;
    }
    this.releasePreview();
    this.file.set(file);
    this.preview.set(URL.createObjectURL(file));
    this.published.set(null);
  }

  discard(): void {
    this.releasePreview();
    this.file.set(null);
    this.busy.set(false);
    this.locked.set(false);
    this.media = undefined;
    this.attached.set(null);
    this.error.set('');
    this.published.set(null);
  }

  /**
   * Upload the staged recording and wait until the server finishes processing
   * it, so the composer can publish it. Nothing uploads before this explicit step;
   * a retry after a failure reuses the upload rather than sending the bytes again.
   */
  async attach(): Promise<MediaAttachment | null> {
    const file = this.file();
    if (!file || this.busy() || !this.ready() || !this.isCurrent(this.identity)) return null;
    if (this.attached()) return this.attached();
    const identity = this.identity;
    this.busy.set(true);
    this.error.set('');
    try {
      if (!this.media) {
        // Home server: background-role instance info may target a different configured server.
        const info = await this.request(this.http.get<UploadLimits>('/api/v2/instance'));
        if (!this.isCurrent(identity)) return null;
        const limits = info.configuration?.media_attachments;
        const max = limits?.audio_size_limit ?? limits?.video_size_limit;
        if (!max || !limits?.supported_mime_types) {
          this.error.set('radio.limitsUnavailable');
          return null;
        }
        if (file.size > max || !limits.supported_mime_types.includes(file.type)) {
          this.error.set('radio.unsupportedAudio');
          return null;
        }
        this.locked.set(true);
        const uploaded = await this.request(this.api.uploadMedia(file), 180_000);
        if (!this.isCurrent(identity)) return null;
        this.media = uploaded;
      }
      // Audio processing is asynchronous; never hand over unfinished media.
      let attachment: MediaAttachment = this.media;
      for (let poll = 0; !attachment.url && poll < 120; poll++) {
        await this.request(timer(1000));
        const media: MediaAttachment = await this.request(
          this.http.get<MediaAttachment>(`/api/v1/media/${encodeURIComponent(attachment.id)}`),
        );
        if (!this.isCurrent(identity)) return null;
        if (media?.id) this.media = attachment = media;
      }
      if (!attachment.url) throw new Error('Processing pending');
      this.attached.set(attachment);
      return attachment;
    } catch {
      if (this.isCurrent(identity)) this.error.set('radio.attachFailed');
      return null;
    } finally {
      if (this.isCurrent(identity)) this.busy.set(false);
    }
  }

  /** The composer dropped the attachment; the staged file may be replaced again. */
  detach(): void {
    if (!this.attached()) return;
    this.attached.set(null);
    this.media = undefined;
    this.locked.set(false);
  }

  /** The composer published the post; record it and release the staged bytes. */
  posted(post: Status): void {
    this.catalogue().remember(post);
    this.discard();
    this.published.set(post);
  }

  private request<T>(source: Observable<T>, milliseconds = 30_000): Promise<T> {
    return firstValueFrom(source.pipe(timeout(milliseconds), takeUntil(this.aborted)));
  }

  private isCurrent(identity: string): boolean {
    return identity === this.identity && identity === this.currentIdentity();
  }

  private releasePreview(): void {
    if (this.preview()) URL.revokeObjectURL(this.preview());
    this.preview.set('');
  }

  private newCatalogue(): AudioCatalogue {
    return new AudioCatalogue((data) => {
      if (!this.key) return;
      try {
        localStorage.setItem(this.key, JSON.stringify(data));
        this.storageFailed.set(false);
      } catch {
        this.storageFailed.set(true);
      }
    });
  }
}
