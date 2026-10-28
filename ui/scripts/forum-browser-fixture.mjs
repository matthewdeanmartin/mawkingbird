// Fixture Mastodon API for check-forum-browser.mjs: a home timeline of
// conversations (and a tweet storm and a lone question, which are not
// discussions), their contexts, relationships and lists.
const colors = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#7f8c8d'];

function avatar(name, index) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${colors[index % colors.length]}"/><text x="48" y="60" font-size="40" text-anchor="middle" fill="white" font-family="sans-serif">${name[0]}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const people = [
  ['1', 'mistersql', 'Matthew Martin', null],
  ['2', 'claudio', 'Claudio Maradonna', 'social.unitoo.it'],
  ['3', 'skyfire747', 'Anthony :pentacle:', 'aus.social'],
  ['4', 'acdha', 'Chris Adams', 'code4lib.social'],
  ['5', 'sortova', 'Tarus', 'redwombat.social'],
  ['6', 'ada', 'Ada Okafor', 'mastodon.social'],
  ['7', 'lin', 'Lin Wei', 'recsys.social'],
];

export const accounts = Object.fromEntries(
  people.map(([id, username, name, host], index) => [
    id,
    {
      id,
      username,
      acct: host ? `${username}@${host}` : username,
      display_name: name,
      url: `https://${host ?? 'home.example'}/@${username}`,
      avatar: avatar(name, index),
      avatar_static: avatar(name, index),
      header: '',
      header_static: '',
      note: '',
      locked: false,
      bot: false,
      created_at: '2020-01-01T00:00:00Z',
      followers_count: 10,
      following_count: 5,
      statuses_count: 20,
      emojis: [],
      fields: [],
    },
  ]),
);
export const me = accounts['1'];

let clock = Date.parse('2026-10-27T08:00:00Z');
function status(id, author, content, extra = {}) {
  clock -= 7 * 60 * 1000;
  const account = accounts[author];
  const host = account.acct.includes('@') ? account.acct.split('@')[1] : 'home.example';
  return {
    id,
    uri: `https://${host}/users/${account.username}/statuses/${id}`,
    url: `https://${host}/@${account.username}/${id}`,
    created_at: new Date(clock).toISOString(),
    edited_at: null,
    content: `<p>${content}</p>`,
    spoiler_text: '',
    visibility: 'public',
    sensitive: false,
    account,
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    replies_count: 0,
    reblogs_count: 1,
    favourites_count: 2,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    poll: null,
    emojis: [],
    media_attachments: [],
    mentions: [],
    tags: [],
    language: 'en',
    ...extra,
  };
}
function reply(id, author, parent, content, extra = {}) {
  return status(id, author, content, {
    in_reply_to_id: parent.id,
    in_reply_to_account_id: parent.account.id,
    ...extra,
  });
}

const tag = (name) => ({ name, url: `https://home.example/tags/${name}` });

// Discussion 1: a question with friends replying.
const q = status('100', '6', 'Which static site generator do people use for docs these days?', {
  replies_count: 3,
  tags: [tag('docs')],
});
const q1 = reply('101', '4', q, 'MkDocs, with the material theme. Boring in the best way.');
const q2 = reply('102', '1', q1, 'Same here, plus a sitemap plugin.');
const q3 = reply('103', '7', q, 'Hugo, mostly for speed.', { tags: [tag('hugo')] });

// Discussion 2: started by me.
const m = status('200', '1', 'Forum mode is live on canary. Tell me what breaks.', {
  replies_count: 2,
  tags: [tag('mawkingbird')],
});
const m1 = reply('201', '3', m, 'The rails look great on a wide screen.');
const m2 = reply('202', '5', m1, 'Agreed, though the badges could be smaller.');

// Discussion 3: a remote thread I joined.
const r = status('300', '2', 'test', { replies_count: 4, tags: [tag('aws')] });
const r1 = reply('301', '1', r, 'Test received.');
const r2 = reply('302', '2', r1, 'Thanks!');

// Discussion 4: a horse-gear story with a long chain.
const h = status(
  '400',
  '5',
  'Over the weekend my wife went to our local Ag center for a horse gear consignment sale.',
  { replies_count: 2, language: 'en' },
);
const h1 = reply('401', '4', h, 'Did she find a saddle?');
const h2 = reply('402', '5', h1, 'Two of them, somehow.');

// A tweet storm: one author replying to themselves. Not a discussion.
const s = status('500', '7', 'Thread on recommender systems, 1/3', { replies_count: 1 });
const s1 = reply('501', '7', s, '2/3: start with popularity baselines.');

// A lone question with no replies. Not a discussion.
const lone = status('600', '6', 'Anyone around?');

export const home = [q3, m2, r2, h, s1, lone, q, m, r, s].map((each) => each);

const threads = [[q, q1, q2, q3], [m, m1, m2], [r, r1, r2], [h, h1, h2], [s, s1], [lone]];

export function context(id) {
  for (const thread of threads) {
    const post = thread.find((each) => each.id === id);
    if (!post) continue;
    const ancestors = [];
    let parent = thread.find((each) => each.id === post.in_reply_to_id);
    while (parent) {
      ancestors.unshift(parent);
      parent = thread.find((each) => each.id === parent.in_reply_to_id);
    }
    const below = new Set([id]);
    const descendants = [];
    for (const each of thread) {
      if (each.in_reply_to_id && below.has(each.in_reply_to_id)) {
        below.add(each.id);
        descendants.push(each);
      }
    }
    return { ancestors, descendants };
  }
  return { ancestors: [], descendants: [] };
}

export function statusById(id) {
  return threads.flat().find((each) => each.id === id);
}

/** Answer the app's API calls; unknown ones get an empty answer. `seen` hears every call. */
export async function routeApi(page, log = () => {}, seen = () => {}) {
  await page.route(/\/api\/v[12]\//, async (route) => {
    seen(route.request());
    const url = new URL(route.request().url());
    const p = url.pathname;
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    let match;
    if (p.endsWith('/accounts/verify_credentials')) return json(me);
    if (p.endsWith('/timelines/home')) return json(url.searchParams.get('max_id') ? [] : home);
    if ((match = /\/statuses\/([^/]+)\/context$/.exec(p))) return json(context(match[1]));
    if ((match = /\/statuses\/([^/]+)$/.exec(p))) {
      const found = statusById(match[1]);
      return found ? json(found) : route.fulfill({ status: 404, body: '{}' });
    }
    if (p.endsWith('/accounts/relationships')) {
      const ids = url.searchParams.getAll('id[]');
      return json(
        ids.map((id) => ({
          id,
          following: ['4', '5'].includes(id),
          followed_by: false,
          requested: false,
          blocking: false,
          muting: false,
          showing_reblogs: true,
          notifying: false,
          endorsed: false,
          note: '',
        })),
      );
    }
    if (p.endsWith('/lists')) return json([{ id: 'L1', title: 'Docs people' }]);
    if (p.endsWith('/instance')) {
      return json({ domain: 'home.example', title: 'Home', version: '4.4.0', configuration: {} });
    }
    log(`unhandled ${route.request().method()} ${p}`);
    return json(/s$|\/(lists|notifications|filters|markers|announcements)/.test(p) ? [] : {});
  });
}
