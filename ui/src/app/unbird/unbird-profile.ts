import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { MbButton } from '../design-system/button/button';
import { MbCheckbox } from '../design-system/checkbox/checkbox';
import { MbControl, MbField } from '../design-system/field/field';
import { MbNotice } from '../design-system/notice/notice';
import { MbSection } from '../design-system/page-header/page-header';
import { MbSaveFeedback, SaveState } from '../design-system/save-feedback/save-feedback';
import { Api } from '../platform/api/api';
import { Account } from '../platform/api/models';
import { Server } from '../platform/http/server';
import { Auth } from '../platform/session/auth';
import { profileImage } from './archive-media';
import {
  DEFAULT_MAX_FIELDS,
  mergedFields,
  movedPost,
  proposedBio,
  savedHashtags,
  xBioLine,
} from './profile-plan';
import { UnbirdMatcher } from './unbird-matcher';

// i18n unbird.profile.lead: Make your new account feel like you. Nothing changes until you press Save, and existing links on your profile are kept.
// i18n unbird.profile.bio: Bio
// i18n unbird.profile.useBio: Use my Twitter bio
// i18n unbird.profile.name: Display name
// i18n unbird.profile.useName: Use my Twitter name
// i18n unbird.profile.links: Links
// i18n unbird.profile.addLinks: Add a link to my old Twitter profile and my website
// i18n unbird.profile.pictures: Pictures
// i18n unbird.profile.useAvatar: Use my Twitter profile picture
// i18n unbird.profile.useHeader: Use my Twitter header image
// i18n unbird.profile.picturesNeedArchive: To bring your pictures, choose your archive again on the Start tab this visit.
// i18n unbird.profile.save: Save to my Mastodon profile
// i18n unbird.profile.saved: Saved.
// i18n unbird.profile.saving: Saving…
// i18n unbird.profile.details: Your details
// i18n unbird.profile.moved.posting: Posting…
// i18n unbird.profile.saveFailed: Your server did not accept the change. Try again, or edit your profile on the server.
// i18n unbird.profile.moved.title: Tell people you moved
// i18n unbird.profile.moved.lead: A public post, pinned to your profile, so anyone who finds you knows where you came from.
// i18n unbird.profile.moved.text: Your post
// i18n unbird.profile.moved.post: Post and pin
// i18n unbird.profile.moved.done: Posted and pinned.
// i18n unbird.profile.moved.failed: Could not post. Try again.
// i18n unbird.profile.x.title: Point your Twitter profile here
// i18n unbird.profile.x.lead: Paste this into your Twitter bio so old followers can find you.
// i18n unbird.profile.x.copy: Copy
// i18n unbird.profile.x.copied: Copied
// i18n unbird.profile.tags.title: Your saved searches, as hashtags to follow
// i18n unbird.profile.tags.follow: Follow #{{tag}}
// i18n unbird.profile.tags.following: Following #{{tag}}
// i18n unbird.profile.needAccount: Setting up your profile needs a Mastodon account. Sign in, or find a server on the People tab.
// i18n unbird.profile.signIn: Sign in with Mastodon

/**
 * Unbird's Profile tab: carry the Twitter identity over. Every change is a
 * proposal until Save; fields the reader already has are never removed.
 */
@Component({
  selector: 'app-unbird-profile',
  imports: [
    FormsModule,
    MbButton,
    MbCheckbox,
    MbControl,
    MbField,
    MbNotice,
    MbSaveFeedback,
    MbSection,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './unbird-profile.html',
  styleUrl: './unbird-profile.css',
})
export class UnbirdProfile implements OnInit, OnDestroy {
  protected readonly matcher = inject(UnbirdMatcher);
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly server = inject(Server);

  protected readonly signedIn = computed(
    () => !this.auth.lacksMastodonToken && !this.auth.isAnonymous && !!this.auth.account(),
  );
  protected readonly me = signal<Account | null>(null);
  protected readonly maxFields = signal(DEFAULT_MAX_FIELDS);

  protected readonly useBio = signal(true);
  protected readonly bio = signal('');
  protected readonly useName = signal(true);
  protected readonly useLinks = signal(true);
  protected readonly useAvatar = signal(true);
  protected readonly useHeader = signal(true);
  protected readonly avatar = signal<File | null>(null);
  protected readonly header = signal<File | null>(null);
  protected readonly avatarUrl = computed(() => preview(this.avatar()));
  protected readonly headerUrl = computed(() => preview(this.header()));
  protected readonly saving = signal<'idle' | 'busy' | 'done' | 'failed'>('idle');

  protected readonly moved = signal('');
  protected readonly movedState = signal<'idle' | 'busy' | 'done' | 'failed'>('idle');
  protected readonly copied = signal(false);
  protected readonly tags = computed(() => {
    const archive = this.matcher.archive();
    return archive ? savedHashtags(archive) : [];
  });
  protected readonly followedTags = signal<ReadonlySet<string>>(new Set());

  protected readonly fields = computed(() => {
    const archive = this.matcher.archive();
    const existing = this.me()?.source?.fields ?? this.me()?.fields ?? [];
    return archive && this.useLinks()
      ? mergedFields(existing, archive, this.maxFields())
      : existing;
  });
  protected readonly xLine = computed(() => {
    const me = this.me();
    if (!me) return '';
    const host = hostOf(this.server.baseUrl());
    return xBioLine(me.acct.includes('@') ? me.acct : `${me.acct}@${host}`, me.url);
  });

  protected readonly saveMessage = computed(
    () =>
      ({
        idle: '',
        busy: 'unbird.profile.saving',
        done: 'unbird.profile.saved',
        failed: 'unbird.profile.saveFailed',
      })[this.saving()],
  );
  protected readonly movedMessage = computed(
    () =>
      ({
        idle: '',
        busy: 'unbird.profile.moved.posting',
        done: 'unbird.profile.moved.done',
        failed: 'unbird.profile.moved.failed',
      })[this.movedState()],
  );

  private urls: string[] = [];

  /** This page's states as the design system's save feedback. */
  protected feedback(state: 'idle' | 'busy' | 'done' | 'failed'): SaveState {
    return ({ idle: 'idle', busy: 'saving', done: 'saved', failed: 'error' } as const)[state];
  }

  constructor() {
    // Fill the proposals once the archive is known.
    effect(() => {
      const archive = this.matcher.archive();
      if (!archive) return;
      this.bio.set(proposedBio(archive));
      this.moved.set(movedPost(archive));
    });
  }

  ngOnInit(): void {
    void this.matcher.restore().then(() => this.loadImages());
    if (!this.signedIn()) return;
    void firstValueFrom(this.api.verifyCredentials())
      .then((me) => this.me.set(me))
      .catch(() => undefined);
    void firstValueFrom(this.api.instanceInfo())
      .then((info) => {
        const max = (info.configuration as { accounts?: { max_profile_fields?: number } })?.accounts
          ?.max_profile_fields;
        if (typeof max === 'number' && max > 0) this.maxFields.set(max);
      })
      .catch(() => undefined);
  }

  ngOnDestroy(): void {
    for (const url of this.urls) URL.revokeObjectURL(url);
  }

  private async loadImages(): Promise<void> {
    const picked = this.matcher.picked;
    const profile = this.matcher.archive()?.profile;
    if (!picked || !profile) return;
    this.avatar.set(await profileImage(picked, profile.avatarUrl));
    this.header.set(await profileImage(picked, profile.headerUrl));
    for (const url of [this.avatarUrl(), this.headerUrl()]) if (url) this.urls.push(url);
  }

  protected async save(): Promise<void> {
    const archive = this.matcher.archive();
    if (!archive) return;
    this.saving.set('busy');
    const form = new FormData();
    if (this.useBio()) form.append('note', this.bio());
    if (this.useName() && archive.owner.displayName) {
      form.append('display_name', archive.owner.displayName);
    }
    if (this.useLinks()) {
      this.fields().forEach((field, index) => {
        form.append(`fields_attributes[${index}][name]`, field.name);
        form.append(`fields_attributes[${index}][value]`, field.value);
      });
    }
    const avatar = this.avatar();
    const header = this.header();
    if (this.useAvatar() && avatar) form.append('avatar', avatar);
    if (this.useHeader() && header) form.append('header', header);
    try {
      this.me.set(await firstValueFrom(this.api.updateCredentials(form)));
      this.saving.set('done');
    } catch {
      this.saving.set('failed');
    }
  }

  protected async postMoved(): Promise<void> {
    if (!this.moved().trim()) return;
    this.movedState.set('busy');
    try {
      const status = await firstValueFrom(
        this.api.postStatus(this.moved().trim(), { visibility: 'public' }),
      );
      await firstValueFrom(this.api.pin(status.id));
      this.movedState.set('done');
    } catch {
      this.movedState.set('failed');
    }
  }

  protected async copyXLine(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.xLine());
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  protected async followTag(tag: string): Promise<void> {
    try {
      await firstValueFrom(this.api.followTag(tag));
      this.followedTags.update((tags) => new Set(tags).add(tag));
    } catch {
      // The button stays; the reader can try again.
    }
  }
}

function preview(file: File | null): string | null {
  return file ? URL.createObjectURL(file) : null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
