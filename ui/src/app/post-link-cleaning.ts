import { BskyFacet } from './providers/bluesky/bluesky-types';

const TRACKING =
  /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|igsh|yclid|twclid|ttclid|gbraid|wbraid)$/i;

/** Preserve unknown parameters, fragments and signed URL bytes. Never follow redirects. */
export function cleanPostUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return value;
    if ([...url.searchParams.keys()].some((key) => /signature|^sig$|^x-amz-|^x-goog-/i.test(key)))
      return value;
    const hashAt = value.indexOf('#');
    const body = hashAt < 0 ? value : value.slice(0, hashAt);
    const queryAt = body.indexOf('?');
    if (queryAt < 0) return value;
    const parts = body.slice(queryAt + 1).split('&');
    const kept = parts.filter((part) => {
      const key = decodeURIComponent(part.split('=')[0].replace(/\+/g, ' '));
      return !TRACKING.test(key);
    });
    if (kept.length === parts.length) return value;
    return (
      body.slice(0, queryAt) +
      (kept.length ? '?' + kept.join('&') : '') +
      (hashAt < 0 ? '' : value.slice(hashAt))
    );
  } catch {
    return value;
  }
}

/** Keep Bluesky's UTF-8 facet offsets aligned with the text being sent. */
export function cleanPostLinks(
  text: string,
  facets?: BskyFacet[],
): { text: string; facets?: BskyFacet[] } {
  const encoder = new TextEncoder();
  const edits: { start: number; end: number; delta: number }[] = [];
  const cleaned = text.replace(/https?:\/\/[^\s<>"']+/gi, (match: string, offset: number) => {
    const trailing = match.match(/[.,!?;:)\]]+$/)?.[0] ?? '';
    const original = match.slice(0, match.length - trailing.length);
    const replacement = cleanPostUrl(original);
    if (replacement !== original)
      edits.push({
        start: encoder.encode(text.slice(0, offset)).length,
        end: encoder.encode(text.slice(0, offset + original.length)).length,
        delta: encoder.encode(replacement).length - encoder.encode(original).length,
      });
    return replacement + trailing;
  });
  const shift = (position: number) =>
    position +
    edits.filter((edit) => edit.end <= position).reduce((sum, edit) => sum + edit.delta, 0);
  return {
    text: cleaned,
    facets: facets
      ?.filter(
        (facet) =>
          !edits.some(
            (edit) =>
              (facet.index.byteStart > edit.start && facet.index.byteStart < edit.end) ||
              (facet.index.byteEnd > edit.start && facet.index.byteEnd < edit.end),
          ),
      )
      .map((facet) => ({
        ...facet,
        index: { byteStart: shift(facet.index.byteStart), byteEnd: shift(facet.index.byteEnd) },
        features: facet.features.map((feature) =>
          feature.$type === 'app.bsky.richtext.facet#link' && feature.uri
            ? { ...feature, uri: cleanPostUrl(feature.uri) }
            : feature,
        ),
      })),
  };
}
