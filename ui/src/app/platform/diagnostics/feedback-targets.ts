import { InjectionToken } from '@angular/core';

export interface FeedbackTargets {
  repository?: string;
  securityUrl?: string;
  account?: string;
  maintainer?: string;
  email?: string;
}

declare const FEEDBACK_TARGETS: FeedbackTargets | undefined;
declare const OFFICIAL_NATIVE_FEEDBACK: boolean | undefined;

const official: FeedbackTargets = {
  repository: 'matthewdeanmartin/mawkingbird',
  securityUrl: 'https://github.com/matthewdeanmartin/mawkingbird/security/advisories/new',
  account: '@mockingbird@mastodon.social',
  maintainer: '@misterql@mastodon.social',
  email: 'matthewdeanmartin@gmail.com',
};

export const feedbackTargets = new InjectionToken<FeedbackTargets>('Feedback destinations', {
  providedIn: 'root',
  factory: () => {
    if (typeof FEEDBACK_TARGETS !== 'undefined') return FEEDBACK_TARGETS;
    const native = typeof OFFICIAL_NATIVE_FEEDBACK !== 'undefined' && OFFICIAL_NATIVE_FEEDBACK;
    return native || globalThis.location?.hostname === 'mawkingbird.com' ? official : {};
  },
});
