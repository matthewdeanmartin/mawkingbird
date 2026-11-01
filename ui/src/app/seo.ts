import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterStateSnapshot } from '@angular/router';
import { PageLanguageState } from './page-language';
import { languageFolder } from './focused-tools';
import type { PageAlternate, TranslatedLanguage } from './focused-tools';

export const SITE_ORIGIN = 'https://mawkingbird.com';
export const SITE_DESCRIPTION =
  'Mawkingbird brings Mastodon, Bluesky and RSS together with bookmarks, readable articles, writing tools and advanced account controls.';
export const FEATURES_DESCRIPTION =
  'Explore Mawkingbird: Mastodon feeds, RSS and readable articles, bookmarks, writing and drafts, bulk actions and third-party integrations.';
export const ABOUT_DESCRIPTION =
  'Why Mawkingbird exists: a 2018-Twitter-style client for Mastodon, Bluesky and RSS with a finite feed, an honest algorithm, bookmarks and analytics.';
export const FUNDING_DESCRIPTION =
  'How Mawkingbird is funded and built: free and open source, who pays for hosting and connections, and what a paid option might add.';
export const FOLLOW_DESCRIPTION =
  'New to Mastodon? Start with hand-picked starter kits of people to follow, grouped by interest, and follow a whole kit in one step with Mawkingbird.';
export const TOOLS_DESCRIPTION =
  'Free single-purpose tools for Mastodon and Bluesky: pick a handle, find your Twitter, Bluesky and phone contacts, schedule posts, and tidy up your account.';
/**
 * Each translated language's tool index, which is also its folder's own page
 * (/de/, /fr/, …): title and meta description. Its component is
 * `ToolsIndex<Lang>` (tools-index.ts); routes and prerender come from here.
 */
export const TOOLS_INDEXES: Record<TranslatedLanguage, { title: string; description: string }> = {
  de: {
    title: 'Kostenlose Werkzeuge für Mastodon und Bluesky',
    description:
      'Kostenlose Werkzeuge für Mastodon und Bluesky auf Deutsch: Twitter-Follows mitnehmen, Beiträge planen, Bilder herunterladen, ähnliche Hashtags finden und mehr. Alles im Browser.',
  },
  es: {
    title: 'Herramientas gratis para Mastodon y Bluesky',
    description:
      'Herramientas gratis para Mastodon y Bluesky en español: lleva a tus seguidos de Twitter, programa publicaciones, descarga imágenes, encuentra hashtags similares y más. Todo en el navegador.',
  },
  fr: {
    title: 'Outils gratuits pour Mastodon et Bluesky',
    description:
      'Outils gratuits pour Mastodon et Bluesky en français : retrouver ses abonnements Twitter, programmer des posts, télécharger des images, trouver des hashtags similaires et plus. Tout dans le navigateur.',
  },
  ko: {
    title: 'Mastodon·Bluesky 무료 도구',
    description:
      'Mastodon과 Bluesky를 위한 무료 한국어 도구: Twitter 팔로우 옮기기, 게시물 예약, 이미지 일괄 다운로드, 비슷한 해시태그 찾기 등. 모두 브라우저에서 작동합니다.',
  },
  pl: {
    title: 'Darmowe narzędzia do Mastodona i Bluesky',
    description:
      'Darmowe narzędzia do Mastodona i Bluesky po polsku: przenieś obserwowanych z Twittera, planuj wpisy, pobieraj obrazy, znajdź podobne hashtagi i więcej. Wszystko w przeglądarce.',
  },
  pt: {
    title: 'Ferramentas grátis para Mastodon e Bluesky',
    description:
      'Ferramentas grátis para Mastodon e Bluesky em português: leve quem você segue no Twitter, agende publicações, baixe imagens, encontre hashtags semelhantes e mais. Tudo no navegador.',
  },
  'zh-Hant': {
    title: 'Mastodon 與 Bluesky 免費工具',
    description:
      'Mastodon 與 Bluesky 的免費中文工具：把 Twitter 的跟隨帶過來、排程發嘟、下載圖片、找相似的主題標籤等等。全部在瀏覽器裡完成。',
  },
  it: {
    title: 'Strumenti gratuiti per Mastodon e Bluesky',
    description:
      'Strumenti gratuiti per Mastodon e Bluesky in italiano: porta con te chi seguivi su Twitter, programma i post, scarica le immagini, trova hashtag simili e altro. Tutto nel browser.',
  },
  ja: {
    title: 'Mastodon と Bluesky の無料ツール',
    description:
      'Mastodon と Bluesky の無料ツール集：Twitter のフォローの引き継ぎ、投稿の予約、画像の一括ダウンロード、似ているハッシュタグ探しなど。すべてブラウザーで動きます。',
  },
};
/** /tools and every language's index are one page in several languages. */
export const TOOLS_INDEX_ALTERNATES: PageAlternate[] = [
  { lang: 'en', path: 'tools' },
  ...(Object.keys(TOOLS_INDEXES) as TranslatedLanguage[]).map((lang) => ({
    lang,
    path: languageFolder(lang),
  })),
];
export const BLOG_DESCRIPTION =
  'Notes from the Mawkingbird project: why the client exists, how it is funded, the software it ships and how it handles your data.';

/**
 * schema.org description of the app itself, for the front page and /features/.
 * It names what kind of thing Mawkingbird is, so search engines need not guess.
 */
export const APP_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Mawkingbird',
  url: `${SITE_ORIGIN}/`,
  description: SITE_DESCRIPTION,
  applicationCategory: 'SocialNetworkingApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript',
  image: `${SITE_ORIGIN}/mockingbird_hand.png`,
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
} as const;

/** One owner for metadata: navigation must never leave a previous page's tags behind. */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly pageLanguage = inject(PageLanguageState);

  update(snapshot: RouterStateSnapshot, title: string): void {
    let route = snapshot.root;
    let description = SITE_DESCRIPTION;
    let indexable = false;
    let canonicalPath: string | undefined;
    let structuredData: object | undefined;
    let lang: string | undefined;
    let alternates: PageAlternate[] = [];
    while (route) {
      if (route.data['seoAlternates']) alternates = route.data['seoAlternates'];
      if (route.data['lang']) lang = route.data['lang'];
      if (route.data['seoStructuredData']) structuredData = route.data['seoStructuredData'];
      if (route.data['seoDescription']) description = route.data['seoDescription'];
      if (route.data['seoIndexable'] !== undefined) indexable = route.data['seoIndexable'];
      if (route.data['seoCanonicalPath']) canonicalPath = route.data['seoCanonicalPath'];
      if (!route.firstChild) break;
      route = route.firstChild;
    }
    // Canonicals never contain callback codes, shared-message content or account identifiers.
    const path = canonicalPath ?? snapshot.url.split(/[?#]/)[0];
    const canonical = indexable
      ? `${SITE_ORIGIN}${path === '/' ? '/' : path.replace(/\/$/, '') + '/'}`
      : `${SITE_ORIGIN}/`;
    const basePath = new URL(
      this.document.querySelector('base')?.getAttribute('href') ?? '/',
      SITE_ORIGIN,
    ).pathname;
    const preview = basePath.startsWith('/canary/') || basePath.startsWith('/test/');
    // A public page written in one language is that language for everyone; the
    // signed-in shell (not indexable) keeps the interface language.
    const pageLang = indexable ? (lang ?? null) : null;
    this.pageLanguage.lang.set(pageLang);
    if (pageLang) this.document.documentElement.lang = pageLang;
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({
      name: 'robots',
      content: indexable && !preview ? 'index, follow' : 'noindex, follow',
    });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    let link = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (indexable && !preview) {
      if (!link) {
        link = this.document.createElement('link');
        link.rel = 'canonical';
        this.document.head.appendChild(link);
      }
      link.href = canonical;
    } else {
      link?.remove();
    }
    // Language versions of this page, each pointing at all the others and
    // itself, with English as the default for every other language.
    for (const old of this.document.head.querySelectorAll('link[rel="alternate"][hreflang]'))
      old.remove();
    if (indexable && !preview && alternates.length > 1) {
      const english = alternates.find((alternate) => alternate.lang === 'en');
      const links = [
        ...alternates.map(({ lang: hreflang, path: page }) => ({ hreflang, page })),
        ...(english ? [{ hreflang: 'x-default', page: english.path }] : []),
      ];
      for (const { hreflang, page } of links) {
        const alternate = this.document.createElement('link');
        alternate.rel = 'alternate';
        alternate.hreflang = hreflang;
        alternate.href = `${SITE_ORIGIN}/${page}/`;
        this.document.head.appendChild(alternate);
      }
    }
    // A JSON-LD data block is never executed, so script-src 'self' allows it.
    let data = this.document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    if (structuredData && indexable && !preview) {
      if (!data) {
        data = this.document.createElement('script');
        data.type = 'application/ld+json';
        this.document.head.appendChild(data);
      }
      // `<` escaped so text from kit data can never close the element.
      data.textContent = JSON.stringify(structuredData).replace(/</g, '\\u003c');
    } else {
      data?.remove();
    }
  }
}
