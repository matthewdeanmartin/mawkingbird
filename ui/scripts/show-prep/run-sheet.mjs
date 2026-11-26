// Run sheet (spec/show-prep.md): segments of links to click through while talking.
import { plainText } from './rank.mjs';

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
      items: ranked
        .filter((r) => r.segment === segment.id)
        .slice(0, pack.perSegment)
        .map((r) => ({
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
    segments,
  };
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
        `   [Open in Mawkingbird](${item.app ?? item.url}) · [Original](${item.url})`,
        '',
      );
    }
  }
  if (!sheet.segments.length)
    lines.push('_Nothing passed vetting. Widen the window or add hashtags to the pack._', '');
  return lines.join('\n');
}
