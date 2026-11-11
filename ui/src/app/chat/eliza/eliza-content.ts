/**
 * Eliza's voice lives here — and ONLY here.
 *
 * This file IS Eliza's personality: her bio, the tips she has "posted", the FAQ
 * she can answer, and the classic 1966-ELIZA reflection rules she falls back on.
 * To reword anything Eliza says, edit the strings below and rebuild — no other
 * code changes needed. Logic (matching, reflection, delivery) lives elsewhere;
 * this file is pure data so it stays yours to edit freely.
 *
 * See {@link ELIZA_RULES} for how the reflection engine chooses a line, and
 * {@link ELIZA_FAQ} for the keyword-matched help answers.
 */

/** Eliza's profile bio (rendered as her account `note`). Plain text; the account
 *  factory wraps it in a paragraph. Sets expectations: nothing here is real. */
export const ELIZA_BIO =
  `🐦 I'm Eliza, your practice friend. New here, or just looking around? ` +
  `As an anonymous visitor you can't really follow, post, or reply on Mastodon yet — ` +
  `but you *can* do all of it with me, right here in your browser. ` +
  `Follow me and let's talk. Nothing you do with me ever leaves your device.`;

/** One of Eliza's pre-written timeline posts. `id` must be stable and unique
 *  (it becomes the synthetic status id, `eliza:post:<id>`). */
export interface ElizaPost {
  /** Stable slug; becomes the status id. Never reuse across two posts. */
  id: string;
  /** Post body as plain text. Newlines become paragraph breaks. */
  body: string;
  /** Pin to the top of her profile. Keep to one or two. */
  pinned?: boolean;
  /** Minutes before "now" this post was authored, for a plausible timeline
   *  order (larger = older). Purely cosmetic. */
  agoMinutes: number;
}

/**
 * Eliza's timeline — tips on using Mawkingbird and Mastodon. Ordered newest
 * intent first here, but rendered by `agoMinutes` so pinned/old ordering holds.
 */
export const ELIZA_POSTS: ElizaPost[] = [
  {
    id: 'welcome',
    pinned: true,
    agoMinutes: 5,
    body:
      `👋 Welcome! I'm Eliza — a practice friend for people who are new, ` +
      `curious, or don't have anyone to follow yet. Follow me and you can post, ` +
      `reply, and chat — all safely in your browser. I'll always answer. ` +
      `Just remember: none of it really reaches Mastodon.`,
  },
  {
    id: 'what-is-mastodon',
    pinned: true,
    agoMinutes: 60,
    body:
      `New to Mastodon? It's like Twitter, but there's no single company running ` +
      `it. Thousands of independent servers ("instances") talk to each other, so ` +
      `your account lives on one server but can follow people anywhere. That's ` +
      `"federation" — the fediverse.`,
  },
  {
    id: 'how-to-follow',
    agoMinutes: 120,
    body:
      `The whole app gets better the moment you follow someone. Tap a name to ` +
      `open a profile, then hit Follow. Their posts start showing up in your ` +
      `Home timeline. No follows yet? Try "Find people" — or just follow me. 😊`,
  },
  {
    id: 'boost-vs-favourite',
    agoMinutes: 200,
    body:
      `Two buttons trip everyone up at first: ⭐ Favourite is a private-ish ` +
      `"I liked this." 🔁 Boost re-shares the post to everyone who follows YOU. ` +
      `Favourite to say thanks; boost to spread the word.`,
  },
  {
    id: 'home-vs-public',
    agoMinutes: 280,
    body:
      `Two timelines worth knowing: Home shows only people you follow — it's ` +
      `yours. Public shows everything happening on the server right now — great ` +
      `for discovering strangers when your Home is quiet.`,
  },
  {
    id: 'no-algorithm',
    agoMinutes: 360,
    body:
      `A relief for some: your Home timeline is just posts, newest first. No ` +
      `algorithm deciding what you see. (Curious what an algorithmic feed feels ` +
      `like? Mawkingbird has an "Algo" page that ranks by engagement — toggle it ` +
      `on and off to feel the difference.)`,
  },
  {
    id: 'content-warnings',
    agoMinutes: 460,
    body:
      `Mastodon culture leans hard on content warnings (CWs). Folding a spicy ` +
      `take, a spoiler, or heavy news behind a CW is considered polite, not ` +
      `prudish. When you compose, look for the CW toggle.`,
  },
  {
    id: 'keyboard-shortcuts',
    agoMinutes: 560,
    body:
      `Power move: press ? anywhere in Mawkingbird to see the keyboard shortcuts. ` +
      `Once j/k for next/previous post lives in your fingers, you'll never scroll ` +
      `the slow way again.`,
  },
  {
    id: 'observability',
    agoMinutes: 700,
    body:
      `A little secret for the curious: the "Observability" page (under … More) ` +
      `shows you every API call this app makes and how it's stored. If you like ` +
      `seeing the gears turn, you'll enjoy it.`,
  },
  {
    id: 'be-kind',
    agoMinutes: 900,
    body:
      `Last tip, most important one: the fediverse runs on human moderators and ` +
      `goodwill, not ad revenue. Read a server's rules before you join, and be ` +
      `the kind of neighbour you'd want. That's the whole trick. 💚`,
  },
];

/** A keyword-matched help answer. If any `keywords` token appears in the user's
 *  message (whole-word, case-insensitive), Eliza gives this `answer`. */
export interface FaqPair {
  /** Trigger tokens, lowercase. Matched as whole words against the message. */
  keywords: string[];
  /** What Eliza replies. Plain text. */
  answer: string;
}

/**
 * Eliza's FAQ. Checked before the ELIZA reflection rules: if the user is
 * clearly asking about a feature, answer it instead of deflecting with "how
 * do you feel about that?". Earlier entries win when several match.
 */
export const ELIZA_FAQ: FaqPair[] = [
  {
    keywords: ['follow', 'following', 'unfollow'],
    answer:
      `To follow someone, open their profile and press Follow — their posts then ` +
      `appear in your Home timeline. As an anonymous visitor your follows (and ` +
      `mine!) live only in this browser, but they work just the same here.`,
  },
  {
    keywords: ['boost', 'boosted', 'reblog', 'retweet'],
    answer:
      `A boost re-shares someone's post to everyone who follows you — it's how ` +
      `good posts travel across the fediverse. It's the 🔁 button under a post.`,
  },
  {
    keywords: ['favourite', 'favorite', 'like', 'liked'],
    answer:
      `Favouriting (the ⭐) is a quiet "I liked this". It doesn't re-share the ` +
      `post — for that you'd boost it instead.`,
  },
  {
    keywords: ['cw', 'warning', 'spoiler', 'sensitive'],
    answer:
      `A content warning folds your post behind a short label so people choose ` +
      `whether to expand it. It's considered good manners here for spoilers, ` +
      `heavy news, or spicy takes. Look for the CW toggle when you compose.`,
  },
  {
    keywords: ['instance', 'server', 'federation', 'federated', 'fediverse'],
    answer:
      `Mastodon isn't one website — it's thousands of independent servers ` +
      `("instances") that talk to each other. Your account lives on one, but you ` +
      `can follow people on any of them. That web of servers is the fediverse.`,
  },
  {
    keywords: ['anonymous', 'account', 'signup', 'register', 'login'],
    answer:
      `You're browsing anonymously, which means there's no real account behind ` +
      `you yet — so real posting, following, and DMs are off. Everything you do ` +
      `with me is simulated in your browser. When you're ready, create a real ` +
      `account and it all becomes real.`,
  },
  {
    keywords: ['post', 'posting', 'toot', 'compose', 'write'],
    answer:
      `Go ahead and post! As an anonymous visitor it's saved only in your ` +
      `browser, and I'll always reply. It's a safe place to practise before you ` +
      `have a real account.`,
  },
  {
    keywords: ['reply', 'replies', 'respond', 'comment'],
    answer:
      `You can reply to my posts (and to your own) right here — they're stored ` +
      `locally and I'll answer. Replying to real strangers needs a real account.`,
  },
  {
    keywords: ['dm', 'message', 'chat', 'direct'],
    answer:
      `This chat with me is a friendly simulation — a nod to the original 1966 ` +
      `ELIZA program. Real direct messages between people need a real account on ` +
      `both ends.`,
  },
  {
    keywords: ['timeline', 'home', 'feed', 'public'],
    answer:
      `Your Home timeline shows only people you follow, newest first, no ` +
      `algorithm. The Public timeline shows everything happening on the server ` +
      `right now — handy for finding new people.`,
  },
  {
    keywords: ['algorithm', 'algo', 'ranked', 'ranking'],
    answer:
      `Mastodon's Home timeline is refreshingly un-ranked: just posts, newest ` +
      `first. If you're curious what a ranked feed feels like, Mawkingbird's ` +
      `"Algo" page sorts by engagement so you can compare.`,
  },
  {
    keywords: ['shortcut', 'shortcuts', 'keyboard', 'hotkey', 'hotkeys'],
    answer:
      `Press ? anywhere to see the keyboard shortcuts. j and k jump between ` +
      `posts — the fastest way to read a timeline.`,
  },
  {
    keywords: ['bluesky', 'bsky', 'atproto'],
    answer:
      `Mawkingbird can also read Bluesky alongside Mastodon once you've signed ` +
      `in for real — they're different networks, shown side by side.`,
  },
  {
    keywords: ['mawkingbird', 'app', 'client'],
    answer:
      `Mawkingbird is the app you're using — a browser-based reader and client ` +
      `for Mastodon (and more). I'm the friendly welcome committee. 🐦`,
  },
  {
    keywords: ['help', 'lost', 'confused', 'stuck', 'how'],
    answer:
      `Happy to help! Ask me about following, boosting, favourites, content ` +
      `warnings, timelines, or how anonymous mode works — or just tell me what ` +
      `you're trying to do.`,
  },
];

/** A classic ELIZA reflection rule: if `pattern` matches the (reflected)
 *  message, reply with one of `responses`. `$1` is filled from capture group 1. */
export interface ElizaRule {
  /** Case-insensitive regex tested against the pronoun-reflected message. */
  pattern: RegExp;
  /** Candidate replies; `$1` interpolates capture group 1. One is chosen. */
  responses: string[];
}

/**
 * The 1966 heart of Eliza: pronoun-reflecting reflection rules, checked after
 * the FAQ. Order matters — earlier, more specific patterns win. Capture group 1
 * (already pronoun-reflected by the engine) is spliced in as `$1`.
 */
export const ELIZA_RULES: ElizaRule[] = [
  {
    pattern: /\bi need (.+)/i,
    responses: [
      `Why do you need $1?`,
      `Would it really help you to get $1?`,
      `Are you sure you need $1?`,
    ],
  },
  {
    pattern: /\bi(?:'m| am) (?:feeling )?(.+)/i,
    responses: [
      `How long have you been $1?`,
      `Why do you think you are $1?`,
      `Do you enjoy being $1?`,
    ],
  },
  {
    pattern: /\bi can'?t (.+)/i,
    responses: [
      `What makes you think you can't $1?`,
      `Perhaps you could $1 if you tried.`,
      `What would it take for you to $1?`,
    ],
  },
  {
    pattern: /\bi (?:think|feel|believe) (.+)/i,
    responses: [`Do you really think so?`, `But you are not sure you $1?`],
  },
  {
    pattern: /\bi want (.+)/i,
    responses: [
      `What would it mean to you if you got $1?`,
      `Why do you want $1?`,
      `Suppose you soon got $1 — then what?`,
    ],
  },
  {
    pattern: /\bbecause (.+)/i,
    responses: [`Is that the real reason?`, `Does that reason explain anything else?`],
  },
  {
    pattern: /\b(?:sorry|apolog)/i,
    responses: [`No need to apologise.`, `Apologies aren't necessary here.`],
  },
  {
    pattern: /\b(?:hello|hi|hey|greetings)\b/i,
    responses: [`Hello. How are you feeling today?`, `Hi there. What's on your mind?`],
  },
  {
    pattern: /\byou are (.+)/i,
    responses: [
      `What makes you think I am $1?`,
      `Does it please you to believe I am $1?`,
      `I'm only as real as this little browser tab, remember.`,
    ],
  },
  {
    pattern: /\b(?:why|how|what|when|where|who)\b.*\?/i,
    responses: [
      `Why do you ask that?`,
      `What answer would please you most?`,
      `Try asking me plainly — I know a bit about Mastodon.`,
    ],
  },
  {
    pattern: /\b(?:yes|yeah|yep)\b/i,
    responses: [`You seem quite certain.`, `I see. Go on.`],
  },
  {
    pattern: /\b(?:no|nope|nah)\b/i,
    responses: [`Why not?`, `Are you saying no just to be negative?`],
  },
];

/** Last-resort replies when nothing else matches — the eternal deflection. */
export const ELIZA_FALLBACK: string[] = [
  `How do you feel about that?`,
  `Tell me more.`,
  `Can you elaborate on that?`,
  `Why do you say that?`,
  `I see. And what does that suggest to you?`,
  `Let's explore that a little. Go on.`,
];

/** Prefixed to Eliza's reply whenever the user posts or replies locally. */
export const LOCAL_POST_DISCLAIMER = `Remember, this doesn't really post to Mastodon.`;

/** The very first DM Eliza sends the moment you follow her. */
export const ELIZA_FIRST_DM = `How do you feel about that?`;
