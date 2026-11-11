/**
 * The URL value that means "the Bluesky panel", and the dropdown option id.
 *
 * Deliberately **not** a member of {@link SearchType}. It is a wire value
 * translated once at the URL boundary into `blueskyMode`, so the Mastodon-shaped
 * consumers — the query serializers, saved searches, the explain panel — never
 * grow a fourth case. See the note on `blueskyMode`.
 */
export const BLUESKY_WIRE_TYPE = 'bluesky-posts';
