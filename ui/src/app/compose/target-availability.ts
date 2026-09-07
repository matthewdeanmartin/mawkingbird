import { inject, Injectable } from '@angular/core';
import { Auth } from '../auth';
import { FeatureFlags } from '../feature-flags';
import { BlueskySession } from '../providers/bluesky/bluesky-session';
import { BloggerSession } from '../providers/blogger/blogger-session';
import { HugoSettings } from '../providers/hugo/hugo-settings';
import { MataroaSettings } from '../providers/mataroa/mataroa-settings';
import { TargetAvailability } from './post-targets';

/**
 * What is linked, flagged on, and signed in right now — as a service.
 *
 * The rules that read this live in {@link post-targets}, deliberately pure. This
 * is the other half: the one place that *gathers* the state those rules need.
 *
 * It exists because a second caller appeared. The share dialog has to offer the
 * destinations the composer would accept, and building its own snapshot would
 * mean two lists that drift — a dialog offering Blogger after the composer
 * stopped accepting it, and the user finding out one screen later. Acquiring six
 * providers to answer one question is also more than a dialog should need to
 * know about.
 */
@Injectable({ providedIn: 'root' })
export class TargetAvailabilitySource {
  private auth = inject(Auth);
  private bskySession = inject(BlueskySession);
  private featureFlags = inject(FeatureFlags);
  private mataroa = inject(MataroaSettings);
  private blogger = inject(BloggerSession);
  private hugo = inject(HugoSettings);

  current(): TargetAvailability {
    return {
      anonymous: this.auth.isAnonymous,
      bskyLinked: this.bskySession.linked(),
      mataroaConnected: this.mataroa.connected(),
      bloggerReady: this.blogger.ready(),
      hugoConnected: this.hugo.connected(),
      pastebinEnabled: this.featureFlags.enabled('pastebin'),
      mataroaEnabled: this.featureFlags.enabled('connector-mataroa'),
      bloggerEnabled: this.featureFlags.enabled('connector-blogger'),
      hugoEnabled: this.featureFlags.enabled('connector-hugo'),
    };
  }
}
