import { Component, computed, input, output, ChangeDetectionStrategy } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbDialog } from '../../../design-system/dialog/dialog';
import { MbButton } from '../../../design-system/button/button';
import { MbContentLink } from '../../../design-system/metadata/metadata';
import { MbNotice } from '../../../design-system/notice/notice';
import { CorsProxyEntry } from '../../cors-proxy/cors-proxy-catalog';
import { TwitterSourceEntry } from '../twitter-source';

/**
 * Asks permission to send a Twitter data-service API key through a CORS proxy.
 *
 * ## Why this is not the shortener's consent dialog
 *
 * It very nearly is, and the structure is deliberately the same — who you are
 * trusting, what could go wrong, what this does not cover. But two things about
 * this case differ enough that reusing the shortener copy would understate the
 * ask:
 *
 * 1. **The key spends money.** A shortener key creates and deletes links. This
 *    one draws down a prepaid credit balance, so a leaked key has a direct
 *    financial cost that stops only when the user notices and rotates it.
 *
 * 2. **Every read goes through the proxy, so the proxy sees the user's reading
 *    history.** The shortener case disclosed the destination URLs someone chose
 *    to publish. This one discloses which Twitter accounts a person follows, reads,
 *    and searches for — private behaviour they never intended to publish, and
 *    exactly the sort of thing §19 of the spec requires be disclosed.
 *
 * The second point is the one users will not anticipate on their own, so it is
 * stated first and in its own section rather than folded into a risk list.
 *
 * ## The self-hosted case is deliberately calm
 *
 * Same reasoning as the shortener dialog: when the proxy is the user's own,
 * their server seeing their own key is not a disclosure. Wrapping that in red
 * warning text would be false, and it teaches users that the red text in this
 * app is decorative — which is the fastest way to make the *real* warning stop
 * working.
 *
 * ## Why there is no "remember this" checkbox
 *
 * Consent *is* remembered — that is what {@link ProxyConsent} stores. The
 * absence is of the opposite affordance: there is no way to proceed without
 * recording it, because an unrecorded grant would mean asking on every request,
 * and a dialog shown on every request is one nobody reads.
 */
// i18n twitter.consent.titleSelfHosted: Send your {{source}} key through your own proxy?
// i18n twitter.consent.titleWarn: {{proxy}} will be able to read your {{source}} key
// i18n twitter.consent.intro: {{source}} doesn't answer browsers directly. To read tweets here, requests go through your CORS proxy and carry your API key.
// i18n twitter.consent.selfHostedBody: Your proxy is <strong>your own server</strong>, so your key and reading only go to a machine you run.
// i18n twitter.consent.whoHeading: Who you would be trusting
// i18n twitter.consent.theirWebsite: Their website
// i18n twitter.consent.aboutSource: About {{source}}
// i18n twitter.consent.readTermsHint: Read their terms before you decide. The proxy sees every request it relays, including your key.
// i18n twitter.consent.riskHeading: What could go wrong
// i18n twitter.consent.riskIntro: If {{proxy}} logged or misused what passes through it, whoever holds your key could:
// i18n twitter.consent.riskSpendCredits: <strong>Spend your credits.</strong> {{source}} bills per request, so anyone with your key can spend your balance.
// i18n twitter.consent.riskLookup: Look up any public Twitter account, post or search using your account's quota
// i18n twitter.consent.riskReadingHistory: Because <em>every</em> Twitter request goes through the proxy, its operator can see <strong>which accounts you read and what you search for</strong>.
// i18n twitter.consent.scopeHeading: What this does not cover
// i18n twitter.consent.scopeBody: Only your {{source}} key and the Twitter content you look up. Your Mastodon, Bluesky and other accounts never go through a proxy, and no Twitter password is needed.
// i18n twitter.consent.scopeRunOwnIntro: If you would rather not take this risk, you can run
// i18n twitter.consent.runYourOwnProxy: your own proxy
// i18n twitter.consent.scopeRunOwnOutro: and select it under CORS proxy instead.
// i18n twitter.consent.decline: No, don't send it
// i18n twitter.consent.useMyProxy: Use my proxy
// i18n twitter.consent.acceptRisk: I accept the risk
@Component({
  selector: 'app-twitter-consent-dialog',
  imports: [TranslocoPipe, MbDialog, MbButton, MbContentLink, MbNotice],
  templateUrl: './twitter-consent-dialog.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['../../shortener/proxy-consent-dialog/proxy-consent-dialog.css'],
})
export class TwitterConsentDialog {
  /** The service whose key would travel through the proxy. */
  readonly source = input.required<TwitterSourceEntry>();
  /** The configured proxy, whose operator would see it. */
  readonly proxy = input.required<CorsProxyEntry>();

  readonly accepted = output<void>();
  readonly cancelled = output<void>();

  /** True when the proxy is one the user runs, so no disclosure is happening. */
  protected readonly selfHosted = computed(() => this.proxy().id === 'custom');
}
