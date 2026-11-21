import type { BskyGalleryEmbed, BskyImagesEmbed } from './bluesky-types';

/** The most the classic images embed carries; more become a gallery. */
export const BSKY_IMAGES_EMBED_MAX = 4;
/** Images bsky.app lets one post carry (the gallery lexicon allows 20). */
export const BSKY_GALLERY_MAX = 10;

/**
 * Uploaded images as a post embed: four or fewer as `app.bsky.embed.images`,
 * which every Bluesky client renders; five to ten as `app.bsky.embed.gallery`,
 * as bsky.app posts them. A gallery needs every image's aspect ratio, so an
 * image without one falls back to square rather than failing the post.
 */
export function blueskyImageEmbed(
  images: BskyImagesEmbed['images'],
): BskyImagesEmbed | BskyGalleryEmbed {
  if (images.length <= BSKY_IMAGES_EMBED_MAX) return { $type: 'app.bsky.embed.images', images };
  return {
    $type: 'app.bsky.embed.gallery',
    items: images.slice(0, BSKY_GALLERY_MAX).map((image) => ({
      image: image.image,
      alt: image.alt,
      aspectRatio: image.aspectRatio ?? { width: 1, height: 1 },
    })),
  };
}
