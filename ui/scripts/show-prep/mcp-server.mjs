#!/usr/bin/env node
// Show prep as MCP tools (spec/show-prep.md; runbook: ops/podcast_topic_finder.md).
//
// A local stdio server: Claude Code or Claude Desktop starts it and calls its
// tools, so an agent can produce an episode in conversation ("dig into that
// thread", "drop the German ones") instead of one-shot CLI runs. Register once:
//
//   claude mcp add show-prep -- node ui/scripts/show-prep/mcp-server.mjs
//
// Read-only on the fediverse: public, unauthenticated requests; it writes only
// the run sheet files under log/show-prep/.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ShowPrepSession } from './session.mjs';
import { loadTopic } from './topic.mjs';

const TOPICS = join(dirname(fileURLToPath(import.meta.url)), 'topics');

/** The content rules, as the agent should read them (mirrors vet.mjs). */
export const POLICY = `Show prep content rules (the same for every topic):

SKIPPED, never on the sheet:
- posts that are not public (unlisted, followers-only, direct);
- authors who opted out: discoverable false, indexable false, noindex, or #nobot / #noindex / #nosearch / #noarchive in their profile;
- replies to someone else (show the thread root instead: use fetch_thread);
- posts older than the topic's window (maxAgeDays).

FLAGGED for the owner to look at first ("review"):
- content warnings or sensitive media;
- images without alt text (describe them aloud);
- bot accounts;
- accounts younger than 7 days;
- languages outside the topic's languages.

Public images are fine to show. The owner records in Mawkingbird's screen share mode.
Never post, boost, follow or message anyone. Never invent posts, quotes or numbers:
everything on the sheet comes from a tool result.`;

const PRODUCER = (
  topic,
) => `You are the producer for a "What's cool on Mastodon" episode about "${topic.title}".
The owner will talk over the run sheet on video, clicking each item open in Mawkingbird.

What to care about: ${topic.blurb || topic.title}. Segments: ${topic.segments
  .map((s) => `${s.title} (${s.keywords.join(', ')})`)
  .join('; ')}.

Work like this:
1. Call get_topic("${topic.id}") and explain_policy once. Then gather_topic("${topic.id}").
2. Call trending_links: an on-topic article many people are sharing is often the
   week's biggest story; consider opening the episode with it.
   Call suggest_seeds and show the owner the best few accounts (projects and their
   developers first). If the owner says yes, add_seeds them for this episode and
   suggest adding them to the topic pack's seedAccounts for next time.
3. Call shortlist for each segment. Prefer: news (releases, new features), people
   explaining why they switched or what they love, good threads, and posts with
   screenshots. Avoid: support questions with no answer, near-duplicates, and
   anything that only makes sense to insiders.
4. For a promising post that is part of a conversation, call fetch_thread and,
   if the root or a reply is better, add_post it.
5. pin the 3-5 best items per segment, drop the weak ones, and add_note a
   one-sentence "why this is interesting" to each pinned item, in plain words,
   never quoting more than the post itself.
6. List every item still flagged "review" with its reasons, and ask the owner
   about them before building. Do not decide content-warning items yourself.
7. build_run_sheet, then give the owner the page path and a 5-line episode outline.

Ask the owner when a segment comes out empty or thin rather than padding it.`;

const text = (value) => ({
  content: [
    { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
  ],
});
const failure = (error) => ({
  isError: true,
  ...text(error instanceof Error ? error.message : String(error)),
});

/**
 * @param {{ fetch?: typeof fetch, now?: () => number, delayMs?: number, outDir?: string }} [options]
 */
export function createShowPrepServer(options = {}) {
  const server = new McpServer({ name: 'show-prep', version: '0.2.0' });
  /** @type {Map<string, ShowPrepSession>} */
  const sessions = new Map();
  const session = (topic) => {
    if (!sessions.has(topic)) sessions.set(topic, ShowPrepSession.forTopic(topic, options));
    return sessions.get(topic);
  };
  const tool = (name, description, inputSchema, run) =>
    server.registerTool(name, { description, inputSchema }, async (args) => {
      try {
        return text(await run(args));
      } catch (error) {
        return failure(error);
      }
    });
  const topic = z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .describe('Topic id, e.g. "mastodon-clients"');
  const url = z.string().url().describe("A post's address, as shortlist returns it");

  tool('list_topics', 'The topic packs available: one per kind of episode.', {}, () =>
    readdirSync(TOPICS)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const pack = loadTopic(f.slice(0, -5));
        return { id: pack.id, title: pack.title, blurb: pack.blurb };
      }),
  );

  tool(
    'get_topic',
    'A topic pack: what this episode cares about (hashtags, segments and their keywords, servers, window). Read it before gathering.',
    { topic },
    ({ topic }) => loadTopic(topic),
  );

  tool(
    'explain_policy',
    'The content rules every item is vetted against. Read once per episode.',
    {},
    () => POLICY,
  );

  tool(
    'gather_topic',
    "Read the topic's hashtags on its servers (public requests, within the pack's budget; about a minute). Or pass a saved candidates.json to work offline. Replaces any earlier gather for this topic; keeps your edits.",
    {
      topic,
      candidatesPath: z.string().optional().describe('A candidates.json from an earlier run'),
    },
    async ({ topic, candidatesPath }) =>
      candidatesPath ? session(topic).loadCandidates(candidatesPath) : session(topic).gather(),
  );

  tool(
    'shortlist',
    'The vetted, ranked posts, best first, with your pins, drops and notes applied. Use per segment.',
    {
      topic,
      segment: z.string().optional().describe('A segment id from the topic'),
      includeReview: z
        .boolean()
        .optional()
        .describe('Include items flagged for review (default true)'),
      limit: z.number().int().min(1).max(50).optional(),
    },
    ({ topic, ...rest }) => session(topic).shortlist(rest),
  );

  tool(
    'fetch_thread',
    "A post's conversation from its home server: the root, the post and its best direct replies, each vetted. Two public requests.",
    { topic, url },
    ({ topic, url }) => session(topic).thread(url),
  );

  tool(
    'add_post',
    'Put a post found elsewhere (a thread root, a reply, a link from the owner) on the sheet, pinned. It is vetted first; a skipped post is refused with the reasons.',
    { topic, url, segment: z.string().optional() },
    ({ topic, url, segment }) => session(topic).addPost(url, { segment }),
  );

  tool(
    'pin',
    'Keep a post on the sheet, first in its segment, never cut. Optionally move it to another segment.',
    { topic, url, segment: z.string().optional() },
    ({ topic, url, segment }) => session(topic).pin(url, segment),
  );

  tool(
    'drop',
    'Take a post off the sheet, with a short reason.',
    { topic, url, reason: z.string().optional() },
    ({ topic, url, reason }) => session(topic).drop(url, reason),
  );

  tool('restore', 'Undo a drop.', { topic, url }, ({ topic, url }) => session(topic).restore(url));

  tool(
    'add_note',
    "A speaker note for the owner on a post's card: one sentence on why it is interesting. Empty text removes it.",
    { topic, url, note: z.string().max(500) },
    ({ topic, url, note }) => session(topic).note(url, note),
  );

  tool(
    'trending_links',
    "Links trending on the topic's servers that match the topic (articles, videos), with how many people shared each and how many posts are about it. They go on the sheet as their own section; drop or add_note them by the article's URL.",
    { topic },
    ({ topic }) => session(topic).trending(),
  );

  tool(
    'suggest_seeds',
    "Candidate seed accounts from what was gathered: people and projects who posted on topic most. Seeds are read whether or not they used a hashtag. Show these to the owner; never add them without the owner's yes.",
    { topic, limit: z.number().int().min(1).max(30).optional() },
    ({ topic, limit }) => session(topic).suggestSeeds(limit),
  );

  tool(
    'add_seeds',
    "Read seed accounts the owner approved (user@host handles) for this episode: their recent posts, without replies or boosts, vetted and ranked like the rest. Two public requests each. To keep them for later episodes, the owner adds them to the topic pack's seedAccounts.",
    { topic, handles: z.array(z.string()).min(1).max(20) },
    ({ topic, handles }) => session(topic).addSeeds(handles),
  );

  tool(
    'status',
    "Where this topic's episode stands: counts per segment and your edits.",
    { topic },
    ({ topic }) => session(topic).summary(),
  );

  tool(
    'build_run_sheet',
    'Write the run sheet: run-sheet.html (the page the owner opens), .md and .json, under log/show-prep/. Returns the page path.',
    {
      topic,
      app: z
        .string()
        .regex(/^https:\/\/\S+$/)
        .optional()
        .describe(
          'Where links open; default https://mawkingbird.com, or https://mawkingbird.com/canary',
        ),
    },
    ({ topic, app }) => session(topic).write({ app, outDir: options.outDir }),
  );

  server.registerPrompt(
    'produce_episode',
    {
      description: 'Produce a "What\'s cool on Mastodon" episode for a topic, step by step.',
      argsSchema: { topic },
    },
    ({ topic }) => ({
      messages: [{ role: 'user', content: { type: 'text', text: PRODUCER(loadTopic(topic)) } }],
    }),
  );

  return server;
}

// Run as a stdio server when started directly (not when imported by tests).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const server = createShowPrepServer();
  await server.connect(new StdioServerTransport());
}
