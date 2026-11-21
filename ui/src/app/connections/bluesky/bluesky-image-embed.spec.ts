import { describe, expect, it } from 'vitest';
import { blueskyImageEmbed } from './bluesky-image-embed';
import { BskyBlobRef } from './bluesky-types';

const blob = (n: number): BskyBlobRef => ({
  $type: 'blob',
  ref: { $link: `cid${n}` },
  mimeType: 'image/jpeg',
  size: 1,
});
const images = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    image: blob(i),
    alt: `alt ${i}`,
    ...(i === 4 ? {} : { aspectRatio: { width: 4, height: 3 } }),
  }));

describe('blueskyImageEmbed', () => {
  it('keeps four or fewer as the images embed every client renders', () => {
    expect(blueskyImageEmbed(images(4))).toEqual({
      $type: 'app.bsky.embed.images',
      images: images(4),
    });
  });

  it('posts five to ten as a gallery, each with an aspect ratio', () => {
    const embed = blueskyImageEmbed(images(6));
    expect(embed.$type).toBe('app.bsky.embed.gallery');
    const items = (embed as { items: { alt: string; aspectRatio: unknown }[] }).items;
    expect(items).toHaveLength(6);
    expect(items[0]).toMatchObject({ alt: 'alt 0', aspectRatio: { width: 4, height: 3 } });
    expect(items[4].aspectRatio).toEqual({ width: 1, height: 1 });
  });

  it('never sends more than ten', () => {
    expect((blueskyImageEmbed(images(12)) as { items: unknown[] }).items).toHaveLength(10);
  });
});
