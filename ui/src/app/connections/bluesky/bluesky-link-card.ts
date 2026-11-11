import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { externalFetch } from '../../platform/http/external-fetch';
import { BlueskyApi } from './bluesky-api';
import { prepareImageForBluesky } from './bluesky-image';
import { BskyBlobRef, BskyExternalEmbed } from './bluesky-types';

/**
 * Bluesky's link-card metadata service, the one bsky.app itself uses. It is
 * not an AT Protocol API, but it is Bluesky's own, allows any origin, and the
 * link it reads is about to be posted to Bluesky anyway.
 */
export const BSKY_CARD_SERVICE = 'https://cardyb.bsky.app';

/** Long enough for a slow page, short enough not to hold a post hostage. */
const CARD_TIMEOUT_MS = 8000;

interface CardMetadata {
  error?: string;
  url?: string;
  title?: string;
  description?: string;
  image?: string;
}

/** The first web link in a post's text, without trailing sentence punctuation. */
export function firstLink(text: string): string | null {
  const match = /https?:\/\/[^\s<>"]+/i.exec(text);
  return match ? match[0].replace(/[.,;:!?)\]'"]+$/, '') : null;
}

/**
 * Builds a link card for a Bluesky post.
 *
 * Mastodon makes link cards on its own server; Bluesky leaves it to the client,
 * so without this a link-only post arrived on Bluesky as bare text. Any
 * failure returns null and the post goes out without a card.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyLinkCard {
  private http = inject(HttpClient);
  private api = inject(BlueskyApi);

  async build(url: string, cleanMedia: boolean): Promise<BskyExternalEmbed | null> {
    let meta: CardMetadata;
    try {
      meta = await firstValueFrom(
        this.http
          .get<CardMetadata>(`${BSKY_CARD_SERVICE}/v1/extract`, {
            params: new HttpParams().set('url', url),
            context: externalFetch(),
          })
          .pipe(timeout(CARD_TIMEOUT_MS)),
      );
    } catch {
      return null;
    }
    if (meta.error || !(meta.title || meta.description)) return null;
    const thumb = meta.image ? await this.thumb(meta.image, cleanMedia) : undefined;
    return {
      $type: 'app.bsky.embed.external',
      external: {
        uri: url,
        title: meta.title ?? '',
        description: meta.description ?? '',
        ...(thumb ? { thumb } : {}),
      },
    };
  }

  /** Fetch, shrink and upload the card image. A missing thumb still makes a card. */
  private async thumb(image: string, cleanMedia: boolean): Promise<BskyBlobRef | undefined> {
    try {
      const blob = await firstValueFrom(
        this.http
          .get(image, { responseType: 'blob', context: externalFetch() })
          .pipe(timeout(CARD_TIMEOUT_MS)),
      );
      const prepared = await prepareImageForBluesky(
        new File([blob], 'card', { type: blob.type || 'image/jpeg' }),
        cleanMedia,
      );
      if (!prepared) return undefined;
      const uploaded = await firstValueFrom(this.api.uploadBlob(prepared.blob, prepared.mimeType));
      return uploaded.blob;
    } catch {
      return undefined;
    }
  }
}
