import { firstValueFrom } from 'rxjs';
import { BlueskyApi, tidFromSeed } from './bluesky-api';
import { BskyPostView } from './bluesky-types';
import { detectFacets, graphemeLength } from './bluesky-facets';

/** Preserve the original record's embeds, labels, languages and reply references. */
export async function replaceBlueskyPost(
  api: BlueskyApi,
  original: BskyPostView,
  text: string,
  operationId: string,
): Promise<void> {
  if (!text.trim() || graphemeLength(text) > 300 || new TextEncoder().encode(text).length > 3000) {
    throw new Error('Invalid post length');
  }
  const [, repo, collection, rkey] = original.uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/) ?? [];
  if (!repo || collection !== 'app.bsky.feed.post' || !rkey) throw new Error('Invalid post URI');
  const facets = await firstValueFrom(detectFacets(text, (handle) => api.resolveHandle(handle)));
  // One repository transaction: a failed replacement must not delete the original.
  // A stable new key also prevents a retry after an ambiguous response creating duplicates.
  await firstValueFrom(
    api.request('com.atproto.repo.applyWrites', {
      repo,
      writes: [
        {
          $type: 'com.atproto.repo.applyWrites#create',
          collection,
          rkey: tidFromSeed(operationId),
          value: { ...original.record, text, facets, createdAt: new Date().toISOString() },
        },
        { $type: 'com.atproto.repo.applyWrites#delete', collection, rkey },
      ],
    }),
  );
}
