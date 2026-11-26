// One episode's working state (spec/show-prep.md), shared by the CLI and the MCP
// server: a topic, what was gathered, and the producer's edits (pins, drops,
// notes, added posts). Nothing here writes to Mastodon.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPost, fetchThread, gatherTopic } from './gather.mjs';
import { linkMatches, plainText, rankCandidates, segmentFor } from './rank.mjs';
import { runSheetHtml } from './run-sheet-html.mjs';
import { buildRunSheet, runSheetMarkdown } from './run-sheet.mjs';
import { loadTopic } from './topic.mjs';
import { vetStatus } from './vet.mjs';

/** The repository's log/ folder: generated output never goes elsewhere (AGENTS.md). */
export const LOG_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'log',
  'show-prep',
);

/** A post's stable key on the sheet: its address. */
export function keyOf(post) {
  return post.url ?? post.uri ?? post.id;
}

export class ShowPrepSession {
  /**
   * @param {import('./topic.mjs').TopicPack} pack
   * @param {{ fetch?: typeof fetch, now?: () => number, delayMs?: number }} [options]
   */
  constructor(pack, options = {}) {
    this.pack = pack;
    this.fetch = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.delayMs = options.delayMs;
    /** @type {import('./gather.mjs').Candidate[]} */
    this.candidates = [];
    /** @type {import('./gather.mjs').TrendingLink[]} */
    this.links = [];
    this.requests = 0;
    /** @type {string[]} */
    this.failures = [];
    this.drops = new Map(); // key → reason
    this.pins = new Map(); // key → order
    this.notes = new Map(); // key → text
    this.segmentOverrides = new Map(); // key → segment id
    this.added = []; // statuses added by hand
    this.source = 'empty';
  }

  static forTopic(id, options) {
    return new ShowPrepSession(loadTopic(id), options);
  }

  /** Read the pack's hashtags on its servers (public requests). */
  async gather() {
    const result = await gatherTopic(this.pack, { fetch: this.fetch, delayMs: this.delayMs });
    this.candidates = result.candidates;
    this.links = result.links ?? [];
    this.requests = result.requests;
    this.failures = result.failures;
    this.source = 'live';
    return this.summary();
  }

  /** Use a saved candidates.json instead of the network. */
  loadCandidates(path) {
    this.candidates = JSON.parse(readFileSync(path, 'utf8'));
    // A live run saves its trending links beside its candidates.
    const links = join(dirname(path), 'links.json');
    this.links = existsSync(links) ? JSON.parse(readFileSync(links, 'utf8')) : [];
    this.requests = 0;
    this.failures = [];
    this.source = 'saved';
    return this.summary();
  }

  /** Vetted, ranked, with the producer's edits applied. Best first. */
  ranked() {
    const extra = this.added.map((status) => ({ status, server: 'added', tag: 'added' }));
    const ranked = rankCandidates(
      [...extra, ...this.candidates],
      { ...this.pack, perAuthor: this.pack.perAuthor },
      this.now(),
    );
    return ranked
      .filter((r) => !this.drops.has(keyOf(r.post)))
      .map((r) => {
        const key = keyOf(r.post);
        return {
          ...r,
          segment: this.segmentOverrides.get(key) ?? r.segment,
          pinned: this.pins.get(key) ?? 0,
          note: this.notes.get(key) ?? '',
        };
      });
  }

  summary() {
    const ranked = this.ranked();
    return {
      topic: this.pack.id,
      source: this.source,
      candidates: this.candidates.length,
      shortlisted: ranked.length,
      review: ranked.filter((r) => r.verdict === 'review').length,
      trendingLinks: this.currentLinks().filter((l) => !this.drops.has(l.link.url)).length,
      seedPosts: this.candidates.filter((c) => c.seed).length,
      requests: this.requests,
      failures: this.failures,
      bySegment: Object.fromEntries(
        this.pack.segments.map((s) => [s.id, ranked.filter((r) => r.segment === s.id).length]),
      ),
      edits: {
        pinned: this.pins.size,
        dropped: this.drops.size,
        notes: this.notes.size,
        added: this.added.length,
      },
    };
  }

  /** A compact, agent-readable view of the shortlist. */
  shortlist({ segment, includeReview = true, limit = 20 } = {}) {
    return this.ranked()
      .filter(
        (r) => (!segment || r.segment === segment) && (includeReview || r.verdict !== 'review'),
      )
      .slice(0, limit)
      .map((r) => brief(r));
  }

  /** Find a shortlisted (or dropped) post by its address. */
  find(url) {
    const extra = this.added.map((status) => ({ status, server: 'added', tag: 'added' }));
    const hit = [...extra, ...this.candidates]
      .map((c) => c.status.reblog ?? c.status)
      .find((post) => keyOf(post) === url || post.uri === url || post.url === url);
    return hit ?? null;
  }

  requireKey(url) {
    // A trending link is addressed by the article's own URL.
    if (this.links.some((l) => l.link.url === url)) return url;
    const post = this.find(url);
    if (!post)
      throw new Error(
        `Not among the gathered posts: ${url}. Use add_post for a post found elsewhere.`,
      );
    return keyOf(post);
  }

  drop(url, reason = 'dropped by the producer') {
    const key = this.requireKey(url);
    this.drops.set(key, reason);
    this.pins.delete(key);
    return { dropped: key, reason };
  }

  restore(url) {
    const key = this.requireKey(url);
    this.drops.delete(key);
    return { restored: key };
  }

  pin(url, segment) {
    const key = this.requireKey(url);
    if (segment && !this.pack.segments.some((s) => s.id === segment)) {
      throw new Error(
        `No segment "${segment}". Segments: ${this.pack.segments.map((s) => s.id).join(', ')}`,
      );
    }
    this.drops.delete(key);
    this.pins.set(key, this.pins.get(key) ?? this.pins.size + 1);
    if (segment) this.segmentOverrides.set(key, segment);
    return { pinned: key, segment: segment ?? null };
  }

  note(url, text) {
    const key = this.requireKey(url);
    if (text) this.notes.set(key, String(text).slice(0, 500));
    else this.notes.delete(key);
    return { key, note: this.notes.get(key) ?? null };
  }

  /**
   * Add a post found elsewhere (a thread root, a reply, a link the owner sent).
   * It is vetted like everything else: a post that would be skipped is refused.
   */
  async addPost(url, { segment, pin = true } = {}) {
    const status = await fetchPost(url, { fetch: this.fetch });
    const post = status.reblog ?? status;
    const vetting = vetStatus(status, { ...this.pack, now: this.now() });
    if (vetting.verdict === 'skip') {
      return { added: false, url: keyOf(post), verdict: 'skip', reasons: vetting.reasons };
    }
    if (!this.find(keyOf(post))) this.added.push(status);
    if (pin) this.pin(keyOf(post), segment ?? segmentFor(post, this.pack.segments).segment);
    return { added: true, url: keyOf(post), verdict: vetting.verdict, reasons: vetting.reasons };
  }

  /** A post's thread: root, the post, and its best direct replies, each vetted. */
  async thread(url) {
    const thread = await fetchThread(url, { fetch: this.fetch });
    const view = (status) => {
      const vetting = vetStatus(status, { ...this.pack, now: this.now() });
      return {
        ...briefPost(status.reblog ?? status),
        verdict: vetting.verdict,
        reasons: vetting.reasons,
      };
    };
    return {
      root: view(thread.root),
      post: view(thread.post),
      replies: thread.replies.map(view),
      counts: { ancestors: thread.ancestors, descendants: thread.descendants },
    };
  }

  /** Trending links that match the topic, with a few posts about each. */
  /** Gathered links that still match the topic under the current rules (saved runs too). */
  currentLinks() {
    return this.links.filter((l) => linkMatches(l.link, this.pack).length);
  }

  trending() {
    return this.currentLinks()
      .filter((l) => !this.drops.has(l.link.url))
      .map((l) => ({
        url: l.link.url,
        title: plainText(l.link.title),
        description: plainText(l.link.description),
        provider: l.link.provider_name,
        shares: l.shares,
        servers: l.servers,
        matched: l.matched,
        posts: l.posts.length,
        note: this.notes.get(l.link.url) || undefined,
      }));
  }

  /**
   * Candidate seed accounts, from what was gathered: authors who posted on
   * topic most often, with their own bot setting and whether they can be listed.
   * For the owner to approve; never added to the pack automatically.
   */
  suggestSeeds(limit = 15) {
    const authors = new Map();
    for (const r of rankCandidates(
      this.candidates,
      { ...this.pack, perAuthor: 1000 },
      this.now(),
    )) {
      if (!r.matched.length) continue;
      const a = r.post.account ?? {};
      const handle = a.acct?.includes('@')
        ? a.acct
        : `${a.acct}@${new URL(r.post.url ?? r.post.uri).host}`;
      const entry = authors.get(handle) ?? {
        handle,
        name: a.display_name || a.username,
        bot: !!a.bot,
        followers: a.followers_count ?? 0,
        onTopicPosts: 0,
        keywords: new Set(),
      };
      entry.onTopicPosts++;
      r.matched.forEach((k) => entry.keywords.add(k));
      authors.set(handle, entry);
    }
    const seeded = new Set(
      (this.pack.seedAccounts ?? []).map((h) => h.replace(/^@/, '').toLowerCase()),
    );
    return [...authors.values()]
      .filter((a) => !seeded.has(a.handle.toLowerCase()))
      .sort((a, b) => b.onTopicPosts - a.onTopicPosts || b.followers - a.followers)
      .slice(0, limit)
      .map((a) => ({ ...a, keywords: [...a.keywords] }));
  }

  /** Read these seed accounts now, for this session only (the pack file is not changed). */
  async addSeeds(handles) {
    const { Budget, gatherSeeds } = await import('./extras.mjs');
    const budget = new Budget(handles.length * 2);
    const found = await gatherSeeds(handles, budget, this.fetch);
    this.candidates.push(...found);
    this.requests += budget.used;
    this.failures.push(...budget.failures);
    return { handles, posts: found.length, failures: budget.failures };
  }

  /** The run sheet object, as the page and the JSON file show it. */
  sheet(app) {
    return buildRunSheet(
      this.ranked(),
      this.pack,
      {
        requests: this.requests,
        failures: this.failures,
        links: this.currentLinks(),
        drops: new Set(this.drops.keys()),
        notes: this.notes,
      },
      new Date(this.now()).toISOString(),
      app,
    );
  }

  /** Write run-sheet.html/.md/.json (and the raw candidates of a live gather). */
  write({ app, outDir } = {}) {
    const sheet = this.sheet(app);
    const out = outDir ?? join(LOG_ROOT, `${this.pack.id}-${sheet.generatedAt.slice(0, 10)}`);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'run-sheet.json'), JSON.stringify(sheet, null, 2) + '\n');
    writeFileSync(join(out, 'run-sheet.md'), runSheetMarkdown(sheet));
    const page = join(out, 'run-sheet.html');
    writeFileSync(page, runSheetHtml(sheet));
    if (this.source === 'live') {
      writeFileSync(join(out, 'candidates.json'), JSON.stringify(this.candidates) + '\n');
      writeFileSync(join(out, 'links.json'), JSON.stringify(this.links) + '\n');
    }
    const items = sheet.segments.reduce((n, s) => n + s.items.length, 0);
    return {
      out,
      page,
      items,
      trendingLinks: sheet.trending.length,
      segments: sheet.segments.map((s) => ({ id: s.id, items: s.items.length })),
    };
  }
}

function briefPost(post) {
  const text = plainText(post.content);
  return {
    url: keyOf(post),
    author: post.account?.display_name || post.account?.acct,
    acct: post.account?.acct,
    created_at: post.created_at,
    text: text.length > 400 ? `${text.slice(0, 399)}…` : text,
    likes: post.favourites_count ?? 0,
    boosts: post.reblogs_count ?? 0,
    replies: post.replies_count ?? 0,
    media: (post.media_attachments ?? []).map((m) => ({ type: m.type, alt: m.description ?? '' })),
  };
}

function brief(r) {
  return {
    ...briefPost(r.post),
    segment: r.segment,
    score: r.score,
    matched: r.matched,
    verdict: r.verdict,
    reasons: r.reasons,
    pinned: !!r.pinned,
    note: r.note || undefined,
  };
}
