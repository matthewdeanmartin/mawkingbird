import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MbButton } from '../../../design-system/button/button';
import { MbControl, MbField } from '../../../design-system/field/field';
import { MbNotice } from '../../../design-system/notice/notice';
import { BlueskyApi } from '../../../connections/bluesky/bluesky-api';
import { detectFacets, graphemeLength } from '../../../connections/bluesky/bluesky-facets';
import { onSetupNext } from '../setup-state';

/** Bluesky's post limit, in graphemes. */
const MAX = 300;

/**
 * A new Bluesky account's first post, in the person's own words: the same
 * rules as the Mastodon intro (no template, prompts above the box, posting is
 * its own button because it is public), then one offer to pin it. Mentions,
 * links and hashtags become facets, as the composer makes them.
 */
@Component({
  selector: 'app-setup-bluesky-intro',
  imports: [MbButton, MbField, MbControl, MbNotice],
  templateUrl: './setup-bluesky-intro.html',
  styleUrl: './setup-steps.css',
})
export class SetupBlueskyIntro {
  private readonly api = inject(BlueskyApi);
  protected readonly state = onSetupNext(() => undefined);

  protected readonly text = signal('');
  protected readonly max = MAX;
  protected readonly length = computed(() => graphemeLength(this.text()));
  protected readonly phase = signal<'write' | 'posting' | 'posted' | 'pinned'>('write');
  protected readonly error = signal('');
  protected readonly canPost = computed(
    () => this.text().trim().length > 0 && this.length() <= MAX,
  );
  private posted: { uri: string; cid: string } | null = null;

  protected async post(): Promise<void> {
    if (!this.canPost() || this.phase() !== 'write') return;
    this.phase.set('posting');
    this.error.set('');
    try {
      const text = this.text().trim();
      const facets = await firstValueFrom(
        detectFacets(text, (handle) => this.api.resolveHandle(handle)),
      );
      const lang = navigator.language?.split(/[-_]/)[0];
      this.posted = await firstValueFrom(
        this.api.post({ text, ...(facets.length && { facets }), ...(lang && { langs: [lang] }) }),
      );
      this.phase.set('posted');
    } catch {
      this.phase.set('write');
      this.error.set('That didn’t post. Your text is still here; try again.');
    }
  }

  protected async pin(): Promise<void> {
    if (!this.posted) return;
    try {
      await firstValueFrom(this.api.setPinnedPost(this.posted));
      this.phase.set('pinned');
    } catch {
      this.error.set('Pinning didn’t work. You can pin it later from the post’s menu.');
    }
  }
}
