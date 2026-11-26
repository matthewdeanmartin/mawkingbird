import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MbButton } from '../../../design-system/button/button';
import { MbControl, MbField } from '../../../design-system/field/field';
import { MbNotice } from '../../../design-system/notice/notice';
import { Api } from '../../../platform/api/api';
import { ClientPrefs } from '../../../platform/storage/client-prefs';
import { Drafts } from '../../../publishing/drafts';
import { onSetupNext } from '../setup-state';

const MAX = 500;

/**
 * The first post, in the person's own words. Owner rule: no template and no
 * prefilled text. Questions sit above the box as prompts, never inserted.
 * Posting is an explicit button, never Next, because it is public. Then
 * comes one offer to pin it, so profile visitors see it first.
 *
 * An account still waiting for approval can't post: the text is saved to
 * Write → Drafts instead.
 */
@Component({
  selector: 'app-setup-intro',
  imports: [MbButton, MbField, MbControl, MbNotice],
  templateUrl: './setup-intro.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './setup-steps.css',
})
export class SetupIntro {
  private readonly api = inject(Api);
  private readonly prefs = inject(ClientPrefs);
  private readonly drafts = inject(Drafts);
  protected readonly state = onSetupNext(() => undefined);

  protected readonly text = signal('');
  protected readonly max = MAX;
  protected readonly phase = signal<'write' | 'posting' | 'posted' | 'pinned' | 'saved'>('write');
  protected readonly error = signal('');
  private postedId = '';
  /** Followers-only or quieter: an intro nobody sees. Offer a public post instead. */
  protected readonly quiet = computed(() => {
    const visibility = this.prefs.defaultVisibility();
    return visibility === 'private' || visibility === 'direct';
  });
  protected readonly forcePublic = signal(false);
  protected readonly canPost = computed(
    () => this.text().trim().length > 0 && this.text().length <= MAX,
  );

  protected async post(): Promise<void> {
    if (!this.canPost() || this.phase() !== 'write') return;
    this.phase.set('posting');
    this.error.set('');
    try {
      const status = await firstValueFrom(
        this.api.postStatus(this.text(), this.forcePublic() ? { visibility: 'public' } : {}),
      );
      this.postedId = status.id;
      this.phase.set('posted');
    } catch {
      this.phase.set('write');
      this.error.set('That didn’t post. Your text is still here; try again.');
    }
  }

  protected async pin(): Promise<void> {
    try {
      await firstValueFrom(this.api.pin(this.postedId));
      this.phase.set('pinned');
    } catch {
      this.error.set('Pinning didn’t work. You can pin it later from the post’s menu.');
    }
  }

  protected saveForLater(): void {
    this.drafts.forCurrentAccount().save({
      segments: [this.text()],
      spoilerText: '',
      sensitive: false,
      visibility: this.forcePublic() ? 'public' : this.prefs.defaultVisibility(),
      poll: null,
    });
    this.phase.set('saved');
  }
}
