import { ArticleDiagnosis } from './article-models';
import { declaredPaywalled } from './article-metadata';

/**
 * Deciding a page will not extract, before spending work on it.
 *
 * Two tiers live here. Tier 0 looks at the URL alone and costs nothing —
 * no fetch, no quota. Tier 1 looks at the raw HTML with cheap string and DOM
 * checks, before the extractor runs.
 *
 * Neither is authoritative. The real quality gate is Tier 2 in
 * `article-quality.ts`, which judges what was actually extracted. These two
 * exist to catch the cases where that judgement is a foregone conclusion, and
 * to name *why* — "this publisher requires a subscription" is a different
 * message from "this page needs JavaScript", and the reader should say which.
 */

/**
 * Hosts where expansion reliably does not work.
 *
 * Recorded the way `cors-proxy-catalog.ts` records its measurements: with the
 * reason, so a future reader can re-test rather than inherit folklore. These
 * are a *hint*, never a block — the button becomes "Try anyway" rather than
 * disappearing, because a wrong entry here should cost a click rather than the
 * feature.
 *
 * Suffix-matched, so `www.` and other subdomains are covered.
 */
export const UNLIKELY_HOSTS: readonly { host: string; why: ArticleDiagnosis }[] = [
  // Login walls: the article is simply not served to a logged-out fetch.
  { host: 'x.com', why: 'bot-check' },
  { host: 'twitter.com', why: 'bot-check' },
  { host: 'linkedin.com', why: 'bot-check' },
  { host: 'facebook.com', why: 'bot-check' },
  { host: 'instagram.com', why: 'bot-check' },
  { host: 'quora.com', why: 'bot-check' },
  // Metered or hard paywalls on most article URLs.
  { host: 'nytimes.com', why: 'paywall' },
  { host: 'wsj.com', why: 'paywall' },
  { host: 'ft.com', why: 'paywall' },
  { host: 'economist.com', why: 'paywall' },
  { host: 'bloomberg.com', why: 'paywall' },
  { host: 'newyorker.com', why: 'paywall' },
  { host: 'theatlantic.com', why: 'paywall' },
];

/** File extensions that are not articles regardless of what the server says. */
const UNREADABLE_EXTENSIONS =
  /\.(pdf|zip|tar|gz|rar|7z|mp3|mp4|m4a|wav|avi|mov|mkv|jpg|jpeg|png|gif|webp|svg|ico|css|js|json|xml|exe|dmg)$/i;

/** Why a URL is not worth fetching, or `null` if it is. */
export interface UrlVerdict {
  diagnosis: ArticleDiagnosis;
  /** True when it is worth offering a "try anyway" button. */
  worthTrying: boolean;
}

/**
 * Tier 0: judge a URL without fetching it.
 *
 * `null` means "nothing against it" — the common case, and the one that leads
 * to a normal fetch.
 */
export function inspectUrl(rawUrl: string): UrlVerdict | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { diagnosis: 'network', worthTrying: false };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { diagnosis: 'network', worthTrying: false };
  }

  if (UNREADABLE_EXTENSIONS.test(url.pathname)) {
    // No amount of trying turns a PDF into markdown, so this one is final.
    return { diagnosis: 'not-html', worthTrying: false };
  }

  const host = url.hostname.toLowerCase();
  const known = UNLIKELY_HOSTS.find(
    (entry) => host === entry.host || host.endsWith(`.${entry.host}`),
  );
  if (known) {
    return { diagnosis: known.why, worthTrying: true };
  }

  return null;
}

/**
 * Whether a URL looks like a homepage rather than an article.
 *
 * Separate from {@link inspectUrl} because it is a much weaker signal — plenty
 * of sites serve a real article from a short path — so it informs the button's
 * wording rather than gating the fetch. The quality gate catches the real cases
 * anyway, since a homepage extracts as high-link-density junk.
 */
export function looksLikeHomepage(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.pathname === '/' || url.pathname === '';
  } catch {
    return false;
  }
}

/** Phrases that only appear on bot-challenge interstitials. */
const CHALLENGE_MARKERS = [
  'verify you are human',
  'checking your browser',
  'cf-browser-verification',
  'cf_chl_',
  'enable javascript and cookies to continue',
  'please enable cookies',
  'ddos protection by',
  'ray id',
  'access denied',
  'are you a robot',
  'unusual traffic',
];

/** Script hosts that mean a challenge widget is on the page. */
const CHALLENGE_SCRIPTS = ['challenges.cloudflare.com', 'hcaptcha.com', 'recaptcha.net'];

/** Consent-dialog vocabulary. Individually weak, jointly decisive. */
const CONSENT_MARKERS = [
  'we and our partners',
  'legitimate interest',
  'store and/or access information on a device',
  'manage your cookie preferences',
  'accept all cookies',
  'privacy preference cent',
  'consent management',
];

/** Class/id fragments used by common paywall systems. */
const PAYWALL_MARKERS = [
  'paywall',
  'piano-',
  'tp-modal',
  'subscriber-only',
  'subscription-required',
  'meteredcontent',
  'regwall',
];

/** Framework mount points that mean the page renders client-side. */
const APP_ROOT_IDS = ['root', '__next', 'app', '__nuxt', 'svelte'];

/** Words in a document, counted the same way everywhere in this feature. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Tier 1: judge the fetched HTML before extracting from it.
 *
 * Order matters. A bot challenge and a consent wall both have little text, so
 * they must be tested before the generic "too little text" rule, or every
 * hostile page reports as `needs-js` and the message is wrong.
 */
export function inspectHtml(doc: Document, rawHtml: string): ArticleDiagnosis | null {
  const bodyText = doc.body?.textContent ?? '';
  const words = countWords(bodyText);
  const haystack = `${bodyText}\n${doc.title}`.toLowerCase();

  // Challenge pages are short and specific. Checked first because a challenge
  // is a more actionable message than anything else that would also match.
  const scriptHit = Array.from(doc.querySelectorAll('script[src]')).some((el) => {
    const src = el.getAttribute('src') ?? '';
    return CHALLENGE_SCRIPTS.some((host) => src.includes(host));
  });
  if (scriptHit || CHALLENGE_MARKERS.some((marker) => haystack.includes(marker))) {
    return 'bot-check';
  }

  // A consent wall is only a wall when it is *most* of the page. A cookie
  // banner on top of a real article is not a failure, and treating it as one
  // would refuse a large share of the working web.
  const consentHits = CONSENT_MARKERS.filter((marker) => haystack.includes(marker)).length;
  if (consentHits >= 2 && words < 500) {
    return 'consent-wall';
  }

  // The publisher's own machine-readable declaration beats any heuristic.
  if (declaredPaywalled(doc)) {
    return 'paywall';
  }

  const markup = rawHtml.toLowerCase();
  const paywallHits = PAYWALL_MARKERS.filter((marker) => markup.includes(marker)).length;
  if (paywallHits >= 2 && words < 500) {
    return 'paywall';
  }

  // A framework shell: a mount point, and nothing rendered into it.
  if (words < 100) {
    const hasAppRoot = APP_ROOT_IDS.some((id) => doc.getElementById(id) !== null);
    if (hasAppRoot) {
      return 'needs-js';
    }
  }

  // Nothing to extract regardless of how good the extractor is.
  //
  // This counts the *whole document*, so it must sit well below the quality
  // gate's `MIN_WORDS`, which counts only the extracted body. Calibrated down
  // from 200 on 2026-08-21, where it was shadowing the gate entirely: a genuine
  // 180-word blog post was rejected here, before the extractor ever ran, and
  // reported as `junk` with no metrics to explain why. The gate is the place
  // that judges prose; this is only meant to catch a page with nothing on it.
  if (words < 60) {
    return 'junk';
  }

  return null;
}
