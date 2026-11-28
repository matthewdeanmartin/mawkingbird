import { Component, computed, input, output, ChangeDetectionStrategy } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbDialog } from '../../../design-system/dialog/dialog';
import { MbButton } from '../../../design-system/button/button';
import { MbContentLink } from '../../../design-system/metadata/metadata';
import { MbNotice } from '../../../design-system/notice/notice';
import { CorsProxyEntry } from '../../cors-proxy/cors-proxy-catalog';
import { ShortenerCatalogEntry } from '../shortener-catalog';

// i18n shortener.proxyConsent.titleNoCredential: Send this link through {{proxy}}?
// i18n shortener.proxyConsent.titleSelfHosted: Send your {{shortener}} key through your own proxy?
// i18n shortener.proxyConsent.titleWarn: {{proxy}} will be able to read your {{shortener}} key
// i18n shortener.proxyConsent.bodyCarriesCredential: {{shortener}} doesn't answer browsers directly. To use it here, the request goes through your CORS proxy and carries your {{keyLabel}}.
// i18n shortener.proxyConsent.bodyNoCredential: The browser couldn't reach {{shortener}} directly. Retrying through {{proxy}} lets its operator see the link you're shortening.
// i18n shortener.proxyConsent.aboutProxy: About {{proxy}}
// i18n shortener.proxyConsent.shortenerPrivacyPolicy: {{shortener}}'s privacy policy
// i18n shortener.proxyConsent.selfHostedBody: Your proxy is <strong>your own server</strong>, so your key only goes to a machine you run.
// i18n shortener.proxyConsent.whoHeading: Who you would be trusting
// i18n shortener.proxyConsent.theirWebsite: Their website
// i18n shortener.proxyConsent.readTermsHint: Read their terms before you decide. The proxy sees every request it relays, including your key.
// i18n shortener.proxyConsent.riskHeading: What could go wrong
// i18n shortener.proxyConsent.riskIntro: If {{proxy}} logged or misused what passes through it, whoever holds your key could:
// i18n shortener.proxyConsent.riskCreateLinks: Create short links on your {{shortener}} account, pointing anywhere
// i18n shortener.proxyConsent.riskDeleteLinks: Delete or re-point the links you have already made
// i18n shortener.proxyConsent.riskReadLinks: Read the list of links in your account, and their destinations
// i18n shortener.proxyConsent.riskReputation: Links made with your key carry your domain. A misbehaving proxy could point them anywhere.
// i18n shortener.proxyConsent.scopeHeading: What this does not cover
// i18n shortener.proxyConsent.scopeIntro: Only your {{shortener}} key. Your Mastodon session and other accounts never go through a proxy. To keep the key to yourself, you can run
// i18n shortener.proxyConsent.runYourOwnProxy: your own proxy
// i18n shortener.proxyConsent.scopeOutro: and select it under CORS proxy instead.
// i18n shortener.proxyConsent.decline: No, don't send it
// i18n shortener.proxyConsent.useProxy: Use {{proxy}}
// i18n shortener.proxyConsent.useMyProxy: Use my proxy
// i18n shortener.proxyConsent.acceptRisk: I accept the risk

/**
 * Asks permission to send a shortener API key through a CORS proxy.
 *
 * ## Why this is not the generic confirm dialog
 *
 * Because the generic one cannot ask this question honestly. A modal that says
 * "Send your API key through the proxy? [Cancel] [Confirm]" is not consent — the
 * user has no way to evaluate it. Nobody can weigh a risk without knowing who
 * they are taking it with and what specifically could go wrong.
 *
 * So this dialog is built around the three things a person actually needs:
 *
 * 1. **Who.** The proxy operator by name, with links to their front page and
 *    privacy policy, so the user can go and look. A name alone ("AllOrigins")
 *    means nothing to most people; a name plus a policy they can read is a
 *    decision they can make.
 * 2. **What could go wrong.** Concretely, in the terms of this app: whoever runs
 *    the proxy can read the key, and a key for this service can create links,
 *    delete links, and read the links already in the account. Not "may
 *    compromise your credentials" — what the credential actually does.
 * 3. **What it does not cover.** The key is scoped to the shortener. It is not
 *    the user's Mastodon account, and the app still refuses to proxy that.
 *    Saying so keeps the warning proportionate, which is what makes it worth
 *    reading.
 *
 * ## The self-hosted case is deliberately calm
 *
 * When the configured proxy is the user's own (`custom`), the same information
 * is presented without alarm: their server seeing their own key is not a
 * disclosure. Wrapping that in red warning text would be false, and it would
 * teach the user that the red text in this app is decorative — which is the
 * fastest way to make the *real* warning stop working.
 */
@Component({
  selector: 'app-proxy-consent-dialog',
  imports: [TranslocoPipe, MbDialog, MbButton, MbContentLink, MbNotice],
  templateUrl: './proxy-consent-dialog.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./proxy-consent-dialog.css'],
})
export class ProxyConsentDialog {
  /** The shortener whose key would travel through the proxy. */
  readonly shortener = input.required<ShortenerCatalogEntry>();
  /** The configured proxy, whose operator would see it. */
  readonly proxy = input.required<CorsProxyEntry>();
  /** Whether this request includes a shortener API credential. */
  readonly carriesCredential = input(true);

  readonly accepted = output<void>();
  readonly cancelled = output<void>();

  /** True when the proxy is one the user runs, so no disclosure is happening. */
  protected readonly selfHosted = computed(() => this.proxy().id === 'custom');
}
