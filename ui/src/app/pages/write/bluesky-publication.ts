import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DraftMedia } from '../../drafts';
import { BlueskyApi, tidFromSeed } from '../../providers/bluesky/bluesky-api';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { detectFacets, graphemeLength } from '../../providers/bluesky/bluesky-facets';
import { prepareImageForBluesky } from '../../providers/bluesky/bluesky-image';
import { BskyFacet, BskyImagesEmbed } from '../../providers/bluesky/bluesky-types';

/** Validate the whole thread before the first network write. */
export function blueskyThreadError(parts: string[]): string | null {
  const index = parts.findIndex(
    (part) =>
      graphemeLength(part.trim()) > 300 || new TextEncoder().encode(part.trim()).length > 3000,
  );
  return index < 0
    ? null
    : `Bluesky post ${index + 1} of ${parts.length} is too long. Shorten that post before publishing; the limit is 300 characters.`;
}

/** A writing-page publication survives edits to unfinished segments and wizard cancellation. */
@Injectable()
export class BlueskyPublication {
  private api = inject(BlueskyApi);
  private session = inject(BlueskySession);
  private operation: {
    did: string;
    parts: string[];
    media: string;
    embed?: BskyImagesEmbed;
    records: { uri: string; cid: string }[];
    prepared: { text: string; facets: BskyFacet[]; rkey: string; createdAt: string }[];
  } | null = null;

  async publish(parts: string[], media: DraftMedia[]): Promise<void> {
    if (!parts.length) throw new Error('Add text before publishing.');
    const error = blueskyThreadError(parts);
    if (error) throw new Error(error);
    const did = this.session.session()?.did;
    if (!did) throw new Error('Reconnect Bluesky before publishing.');
    const mediaKey = JSON.stringify(
      media.map((item) => [
        item.media.id,
        item.description,
        item.file?.name,
        item.file?.size,
        item.file?.lastModified,
      ]),
    );
    const previous = this.operation;
    if (
      previous &&
      (previous.records.length > 0 || previous.prepared.length > 0) &&
      (previous.did !== did ||
        previous.media !== mediaKey ||
        previous.records.some((_, index) => previous.parts[index] !== parts[index]))
    ) {
      throw new Error(
        'This thread has already started. Keep the account, attachments and published posts unchanged; edit only the unfinished posts to resume.',
      );
    }
    const operation =
      previous && previous.did === did && previous.media === mediaKey
        ? previous
        : { did, parts, media: mediaKey, records: [], prepared: [] };
    this.operation = operation;
    operation.parts = parts;
    try {
      if (media.length && !operation.embed && !operation.records.length) {
        const images: BskyImagesEmbed['images'] = [];
        for (const item of media) {
          if (!item.file) throw new Error('Attach the original image again.');
          const image = await prepareImageForBluesky(item.file);
          if (!image) throw new Error('This image could not be prepared.');
          const uploaded = await firstValueFrom(this.api.uploadBlob(image.blob, image.mimeType));
          images.push({
            image: uploaded.blob,
            alt: item.description.trim(),
            aspectRatio: { width: image.width, height: image.height },
          });
        }
        operation.embed = { $type: 'app.bsky.embed.images', images };
      }
      while (operation.records.length < parts.length) {
        const index = operation.records.length;
        let prepared = operation.prepared[index];
        if (!prepared || prepared.text !== parts[index]) {
          // Reuse the record key even after an edit: an ambiguous response must
          // never result in a second record for the same thread position.
          prepared = {
            text: parts[index],
            facets: await firstValueFrom(
              detectFacets(parts[index], (handle) => this.api.resolveHandle(handle)),
            ),
            rkey: prepared?.rkey ?? tidFromSeed(crypto.randomUUID()),
            createdAt: prepared?.createdAt ?? new Date().toISOString(),
          };
          operation.prepared[index] = prepared;
        }
        const root = operation.records[0];
        const parent = operation.records[index - 1];
        const created = await firstValueFrom(
          this.api.post(
            {
              text: prepared.text,
              facets: prepared.facets,
              reply: root && parent ? { root, parent } : undefined,
              embed: index === 0 ? operation.embed : undefined,
            },
            { rkey: prepared.rkey, createdAt: prepared.createdAt },
          ),
        );
        operation.records.push({ uri: created.uri, cid: created.cid });
      }
      this.operation = null;
    } catch (cause: unknown) {
      const completed = operation.records.length;
      throw new Error(
        `Bluesky publishing stopped at post ${completed + 1} of ${parts.length}. ${completed} posts confirmed published. Fix the unfinished post and retry here; confirmed posts will be skipped. ${cause instanceof Error ? cause.message : ''}`,
        { cause },
      );
    }
  }
}
