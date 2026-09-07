import { Injectable, Signal, computed, inject } from '@angular/core';
import { ClientPrefs, CustomTerminology } from './client-prefs';

/** Every user-visible word that swaps when the post noun changes. */
export interface Words {
  post: string;
  posts: string;
  Post: string;
  Posts: string;
  /** Submit button when the composer holds a thread ("Post all" / "Tweet all"). */
  PostAll: string;
  poster: string;
  posted: string;
  boost: string;
  boosts: string;
  Boost: string;
  Boosts: string;
  boosted: string;
  Boosted: string;
  UndoBoost: string;
  BoostedBy: string;
}

const POST_WORDS: Words = {
  post: 'post',
  posts: 'posts',
  Post: 'Post',
  Posts: 'Posts',
  PostAll: 'Post all',
  poster: 'poster',
  posted: 'posted',
  boost: 'boost',
  boosts: 'boosts',
  Boost: 'Boost',
  Boosts: 'Boosts',
  boosted: 'boosted',
  Boosted: 'Boosted',
  UndoBoost: 'Undo boost',
  BoostedBy: 'Boosted by',
};

const TWEET_WORDS: Words = {
  post: 'tweet',
  posts: 'tweets',
  Post: 'Tweet',
  Posts: 'Tweets',
  PostAll: 'Tweet all',
  poster: 'tweeter',
  posted: 'tweeted',
  boost: 'retweet',
  boosts: 'retweets',
  Boost: 'Retweet',
  Boosts: 'Retweets',
  boosted: 'retweeted',
  Boosted: 'Retweeted',
  UndoBoost: 'Undo retweet',
  BoostedBy: 'Retweeted by',
};

/**
 * The third option, and the only one that is nobody else's word.
 *
 * Post is the fediverse's term and tweet is the one this app is nostalgic for;
 * florp belongs to neither, which is the joke and also the point — a network
 * where you can name the verb yourself is making a claim the other two aren't.
 */
const FLORP_WORDS: Words = {
  post: 'florp',
  posts: 'florps',
  Post: 'Florp',
  Posts: 'Florps',
  PostAll: 'Florp all',
  poster: 'florper',
  posted: 'florped',
  boost: 'reflorp',
  boosts: 'reflorps',
  Boost: 'Reflorp',
  Boosts: 'Reflorps',
  boosted: 'reflorped',
  Boosted: 'Reflorped',
  UndoBoost: 'Undo reflorp',
  BoostedBy: 'Reflorped by',
};

const SKEET_WORDS: Words = {
  post: 'skeet',
  posts: 'skeets',
  Post: 'Skeet',
  Posts: 'Skeets',
  PostAll: 'Skeet all',
  poster: 'skeeter',
  posted: 'skeeted',
  boost: 'reskeet',
  boosts: 'reskeets',
  Boost: 'Reskeet',
  Boosts: 'Reskeets',
  boosted: 'reskeeted',
  Boosted: 'Reskeeted',
  UndoBoost: 'Undo reskeet',
  BoostedBy: 'Reskeeted by',
};

const TOOT_WORDS: Words = {
  post: 'toot',
  posts: 'toots',
  Post: 'Toot',
  Posts: 'Toots',
  PostAll: 'Toot all',
  poster: 'tooter',
  posted: 'tooted',
  boost: 'boost',
  boosts: 'boosts',
  Boost: 'Boost',
  Boosts: 'Boosts',
  boosted: 'boosted',
  Boosted: 'Boosted',
  UndoBoost: 'Undo boost',
  BoostedBy: 'Boosted by',
};

function capitalize(value: string): string {
  const [first, ...rest] = Array.from(value);
  return first ? first.toLocaleUpperCase() + rest.join('') : value;
}

/** Expand the editable forms into every phrase consumed by the rest of the UI. */
export function customWords(custom: CustomTerminology): Words {
  const Post = capitalize(custom.post);
  const Boost = capitalize(custom.boost);
  const Boosted = capitalize(custom.boosted);
  return {
    ...custom,
    Post,
    Posts: capitalize(custom.posts),
    PostAll: `${Post} all`,
    Boost,
    Boosts: capitalize(custom.boosts),
    Boosted,
    UndoBoost: `Undo ${custom.boost}`,
    BoostedBy: `${Boosted} by`,
  };
}

/**
 * Post/re-share vocabulary from Settings → Appearance. Purely a client-side
 * label swap — server content is untouched.
 */
@Injectable({ providedIn: 'root' })
export class Terminology {
  private prefs = inject(ClientPrefs);

  readonly words: Signal<Words> = computed(() => {
    switch (this.prefs.postNoun()) {
      case 'tweet':
        return TWEET_WORDS;
      case 'florp':
        return FLORP_WORDS;
      case 'skeet':
        return SKEET_WORDS;
      case 'toot':
        return TOOT_WORDS;
      case 'custom':
        return customWords(this.prefs.customTerminology());
      default:
        return POST_WORDS;
    }
  });
}
