import { BskyFacet } from '../connections/bluesky/bluesky-types';
import { shortDomains } from '../connections/shortener/short-domains';
import { cleanLinks, cleanUrl, LinkCleaningOptions } from '../../lib/link-cleaning';

/**
 * Links Mawkingbird made on purpose, which the privacy option must not touch:
 * short links (the providers' shared domains and this browser's custom ones),
 * and invite links whose campaign tags the user chose to add.
 */
function options(): LinkCleaningOptions {
  return {
    keepHosts: shortDomains(),
    keep: (url) => url.searchParams.get('utm_medium') === 'invite',
  };
}

/** Preserve unknown parameters, fragments and signed URL bytes. Never follow redirects. */
export function cleanPostUrl(value: string): string {
  return cleanUrl(value, options());
}

/** Keep Bluesky's UTF-8 facet offsets aligned with the text being sent. */
export function cleanPostLinks(
  text: string,
  facets?: BskyFacet[],
): { text: string; facets?: BskyFacet[] } {
  const rules = options();
  const result = cleanLinks(text, rules);
  const encoder = new TextEncoder();
  const bytes = (index: number) => encoder.encode(text.slice(0, index)).length;
  const edits = result.edits.map((edit) => ({
    start: bytes(edit.start),
    end: bytes(edit.end),
    delta: encoder.encode(edit.replacement).length - encoder.encode(edit.original).length,
  }));
  const shift = (position: number) =>
    position +
    edits.filter((edit) => edit.end <= position).reduce((sum, edit) => sum + edit.delta, 0);
  return {
    text: result.text,
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
            ? { ...feature, uri: cleanUrl(feature.uri, rules) }
            : feature,
        ),
      })),
  };
}
