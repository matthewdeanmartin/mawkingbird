// Run sheet (spec/show-prep.md): segments of links to click through while talking.
import { plainText } from './rank.mjs';
import { vetStatus } from './vet.mjs';

const APP = 'https://mawkingbird.com';

/**
 * The Mawkingbird link for a post: `/<server>/@<acct>/<id>` opens it from its
 * home server, signed in or not. Built from the post's own canonical URL.
 */
export function appLink(post, app = APP) {
  try {
    const url = new URL(post.url ?? post.uri);
    const match = url.pathname.match(/^\/@([^/]+)\/(\w+)$/);
    // Other software (Misskey notes, Pleroma objects) has no such path: the
    // original link is used instead.
    if (!match) return null;
    // Copy link's shape: a qualified handle, `user@host`, after the server.
    const acct = match[1].includes('@') ? match[1] : `${match[1]}@${url.host}`;
    return `${app.replace(/\/+$/, '')}/${url.host}/@${acct}/${match[2]}`;
  } catch {
    return null;
  }
}

/**
 * A segment's items: pinned ones first, in the order they were pinned, and never
 * cut; then the best of the rest up to the segment's size.
 */
function inSegment(ranked, segment, size) {
  const here = ranked.filter((r) => r.segment === segment);
  const pinned = here.filter((r) => r.pinned).sort((a, b) => a.pinned - b.pinned);
  const rest = here.filter((r) => !r.pinned).slice(0, Math.max(0, size - pinned.length));
  return [...pinned, ...rest];
}

function excerpt(post, max = 220) {
  const text = plainText(post.content);
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text;
}

/**
 * @param {import('./rank.mjs').Ranked[]} ranked
 * @param {import('./topic.mjs').TopicPack} pack
 * @param {{ requests: number, failures: string[] }} gathered
 * @param {string} generatedAt
 * @param {string} [app] Where links open: production, or e.g. https://mawkingbird.com/canary.
 */
export function buildRunSheet(ranked, pack, gathered, generatedAt, app = APP) {
  const segments = pack.segments
    .map((segment) => ({
      id: segment.id,
      title: segment.title,
      items: inSegment(ranked, segment.id, pack.perSegment).map((r) => ({
        author: r.post.account?.display_name || r.post.account?.acct,
        acct: r.post.account?.acct,
        created_at: r.post.created_at,
        excerpt: excerpt(r.post),
        favourites: r.post.favourites_count ?? 0,
        boosts: r.post.reblogs_count ?? 0,
        replies: r.post.replies_count ?? 0,
        // Public posts' images go on stream too (owner, 2026-11-26), like a
        // reaction video. Alt text rides along, to read out.
        media: (r.post.media_attachments ?? []).map((m) => ({
          type: m.type,
          preview: m.preview_url ?? m.url,
          url: m.url ?? m.remote_url,
          alt: m.description ?? '',
        })),
        url: r.post.url ?? r.post.uri,
        app: appLink(r.post, app),
        verdict: r.verdict,
        reasons: r.reasons,
        matched: r.matched,
        tags: r.tags,
        score: r.score,
        pinned: !!r.pinned,
        note: r.note ?? '',
      })),
    }))
    .filter((segment) => segment.items.length);
  return {
    topic: pack.id,
    title: pack.title,
    blurb: pack.blurb,
    generatedAt,
    requests: gathered.requests,
    failures: gathered.failures,
    trending: trendingItems(gathered.links ?? [], pack, app, generatedAt, gathered),
    segments,
  };
}

/**
 * Trending links that match the topic, as cards: the article, how many people
 * shared it, and the best few posts about it that pass vetting. "Posts about it"
 * opens Mawkingbird's /link page, which reads the reader's own server.
 */
function trendingItems(links, pack, app, generatedAt, gathered) {
  const now = Date.parse(generatedAt);
  const dropped = gathered.drops ?? new Set();
  const notes = gathered.notes ?? new Map();
  return links
    .filter((entry) => !dropped.has(entry.link.url))
    .map((entry) => {
      const posts = entry.posts
        .filter((status) => vetStatus(status, { ...pack, now }).verdict !== 'skip')
        .map((status) => status.reblog ?? status)
        .sort(
          (a, b) =>
            (b.favourites_count ?? 0) +
            (b.reblogs_count ?? 0) -
            ((a.favourites_count ?? 0) + (a.reblogs_count ?? 0)),
        )
        .slice(0, 3)
        .map((post) => ({
          author: post.account?.display_name || post.account?.acct,
          acct: post.account?.acct,
          excerpt: excerpt(post, 160),
          url: post.url ?? post.uri,
          app: appLink(post, app),
        }));
      return {
        title: plainText(entry.link.title) || entry.link.url,
        description: plainText(entry.link.description),
        provider: entry.link.provider_name || new URL(entry.link.url).host,
        image: entry.link.image ?? null,
        url: entry.link.url,
        shares: entry.shares,
        servers: entry.servers,
        matched: entry.matched,
        posts,
        postCount: entry.posts.length,
        app: `${(app ?? APP).replace(/\/+$/, '')}/link?url=${encodeURIComponent(entry.link.url)}`,
        note: notes.get(entry.link.url) ?? '',
      };
    });
}

/** The sheet as Markdown, for the owner to read and click through. */
export function runSheetMarkdown(sheet) {
  const lines = [
    `# What's cool on Mastodon: ${sheet.title}`,
    '',
    `${sheet.blurb}`,
    '',
    `Generated ${sheet.generatedAt} ${sheet.requests ? `from ${sheet.requests} public requests` : 'from saved candidates'}. Every item is pre-vetted only: look at it before it goes on screen.`,
    '',
  ];
  if (sheet.trending?.length) {
    lines.push('## Trending on Mastodon', '');
    for (const [i, link] of sheet.trending.entries()) {
      lines.push(
        `${i + 1}. **${link.title}** (${link.provider}) · shared by ${link.shares} people`,
        ...(link.description ? [`   > ${link.description}`] : []),
        ...(link.note ? [`   _Note: ${link.note}_`] : []),
        `   [Open the article](${link.url}) · [Posts about it in Mawkingbird](${link.app})`,
        '',
      );
    }
  }
  if (sheet.failures.length) {
    lines.push(
      '<details><summary>Could not read</summary>',
      '',
      ...sheet.failures.map((f) => `- ${f}`),
      '',
      '</details>',
      '',
    );
  }
  for (const segment of sheet.segments) {
    lines.push(`## ${segment.title}`, '');
    for (const [i, item] of segment.items.entries()) {
      const flag = item.verdict === 'review' ? ` ⚠ review: ${item.reasons.join('; ')}` : '';
      lines.push(
        `${i + 1}. **${item.author}** (@${item.acct}), ${item.created_at.slice(0, 10)} · ${item.favourites} likes · ${item.boosts} boosts · ${item.replies} replies${flag}`,
        `   > ${item.excerpt}`,
        ...(item.note ? [`   _Note: ${item.note}_`] : []),
        `   [Open in Mawkingbird](${item.app ?? item.url}) · [Original](${item.url})`,
        '',
      );
    }
  }
  if (!sheet.segments.length)
    lines.push('_Nothing passed vetting. Widen the window or add hashtags to the pack._', '');
  return lines.join('\n');
}
