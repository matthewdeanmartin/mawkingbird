/**
 * Page copy for the public podcast pages, one language each.
 *
 * Written here, not in the app dictionaries (ops/engineering/seo.md, "Pages in
 * other languages"): it is what search engines read, and the prerender loads no
 * dictionaries. Imported lazily by the routes and pages, never with the app.
 * Topic names come from the catalogue's localised taxonomy.
 */
export interface PodcastCopy {
  /** The hub's <h1> and title. */
  hubHeading: string;
  hubDescription: string;
  hubIntro: (shows: number) => string[];
  kitHeading: (topic: string, count: number) => string;
  kitDescription: (topic: string, count: number) => string;
  kitIntro: (topic: string) => string;
  /** A topic's link on the hub. */
  kitLink: (topic: string) => string;
  shows: (count: number) => string;
  openApp: string;
  openKit: string;
  noAccount: string;
  sharesOn: (places: string) => string;
  website: string;
  feedAccount: string;
  moreTopics: string;
  allTopics: string;
  youtubers: string;
  faqTitle: string;
  faq: { q: string; a: string }[];
  /** The link under the questions: ask Mawkingbird (help, removal). */
  contact: string;
  /** "Also in": other languages' editions of this page. */
  alsoIn: string;
}

/** An English topic inside a sentence: lowercase, except words written in capitals. */
export function topicInSentence(title: string): string {
  return title
    .split(' ')
    .map((word) => (word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(' ');
}

const EN: PodcastCopy = {
  hubHeading: 'Podcasts on Mastodon: shows to follow, by topic',
  hubDescription:
    'Find podcasts and podcasters on Mastodon, by topic: what each show is about, where it shares episodes, and how to follow it from any server.',
  hubIntro: (shows) => [
    `Many podcasts and podcasters post on Mastodon: new episodes, notes, and conversations with listeners. These kits list ${shows} of them by topic, with what each show is about and where it shares episodes.`,
    'Pick a topic, see who is there, then follow a show from any Mastodon server. In Mawkingbird, episodes that play in the browser can join a playlist.',
  ],
  kitHeading: (topic, count) =>
    `${topic} podcasts on Mastodon: ${count} ${count === 1 ? 'show' : 'shows'} to follow`,
  kitDescription: (topic, count) =>
    `${count} ${topicInSentence(topic)} podcasts you can follow on Mastodon: what each show is about, where it shares episodes, and its Mastodon account.`,
  kitIntro: (topic) =>
    `Podcasts about ${topicInSentence(topic)} that post on Mastodon. Follow the shows you like from any server, or open the kit in Mawkingbird to see their latest episodes and play the ones that play in the browser.`,
  kitLink: (topic) => `${topic} podcasts`,
  shows: (count) => `${count} ${count === 1 ? 'show' : 'shows'}`,
  openApp: 'Open the app',
  openKit: 'See and play episodes in Mawkingbird',
  noAccount: 'No Mastodon account yet? You can still look around and listen.',
  sharesOn: (places) => `Shares on ${places}`,
  website: 'Show website',
  feedAccount: 'Show feed account',
  moreTopics: 'More podcast topics',
  allTopics: 'All podcast topics',
  youtubers: 'YouTubers on Mastodon',
  faqTitle: 'Questions',
  faq: [
    {
      q: 'Do I need a Mastodon account?',
      a: 'Not to look, or to play what plays in the browser. Following a show needs an account on any Mastodon server.',
    },
    {
      q: 'Where do the episodes play?',
      a: 'Some shows post audio or video straight to Mastodon. Others link to YouTube, Spotify, Apple Podcasts and similar. Each entry says where its show shares them.',
    },
    {
      q: 'Who is listed?',
      a: 'Accounts that describe themselves as a podcast or podcaster, recently shared an episode, and passed a review by hand. Their posts are not republished here.',
    },
    {
      q: 'How do I get listed or removed?',
      a: 'The lists come from public profiles and are refreshed from time to time. If you would rather not be listed, ask and you will be left out of every later refresh.',
    },
  ],
  contact: 'Ask Mawkingbird on Mastodon',
  alsoIn: 'Also in',
};

const DE: PodcastCopy = {
  hubHeading: 'Podcasts auf Mastodon: Sendungen zum Folgen, nach Thema',
  hubDescription:
    'Podcasts auf Mastodon, nach Themen: worum es in jeder Sendung geht, wo sie Episoden teilt und wie du ihr von jedem Server aus folgst.',
  hubIntro: (shows) => [
    `Viele Podcasts sind auf Mastodon – mit neuen Episoden, Notizen und im Gespräch mit ihrem Publikum. Diese Listen ordnen ${shows} davon nach Themen: worum es in der Sendung geht und wo sie Episoden teilt.`,
    'Such dir ein Thema aus, sieh nach, wer dabei ist, und folge einer Sendung von jedem Mastodon-Server aus. In Mawkingbird kannst du Episoden, die im Browser laufen, in eine Playlist legen.',
  ],
  kitHeading: (topic, count) =>
    `${topic}: ${count} ${count === 1 ? 'Podcast' : 'Podcasts'} auf Mastodon zum Folgen`,
  kitDescription: (topic, count) =>
    `${count} Podcasts zum Thema ${topic}, denen du auf Mastodon folgen kannst: worum es geht, wo sie Episoden teilen und ihr Mastodon-Konto.`,
  kitIntro: (topic) =>
    `Podcasts zum Thema ${topic}, die auf Mastodon posten. Folge ihnen von jedem Server aus oder öffne die Liste in Mawkingbird: Dort siehst du ihre neuesten Episoden und kannst abspielen, was im Browser läuft.`,
  kitLink: (topic) => `Podcasts: ${topic}`,
  shows: (count) => `${count} ${count === 1 ? 'Sendung' : 'Sendungen'}`,
  openApp: 'App öffnen',
  openKit: 'Episoden in Mawkingbird ansehen und abspielen',
  noAccount: 'Noch kein Mastodon-Konto? Umsehen und zuhören kannst du trotzdem.',
  sharesOn: (places) => `Teilt auf ${places}`,
  website: 'Website der Sendung',
  feedAccount: 'Automatisches Konto der Sendung',
  moreTopics: 'Weitere Podcast-Themen',
  allTopics: 'Alle Podcast-Themen',
  youtubers: 'YouTuber auf Mastodon',
  faqTitle: 'Fragen',
  faq: [
    {
      q: 'Brauche ich ein Mastodon-Konto?',
      a: 'Nicht zum Umsehen und nicht für Episoden, die im Browser laufen. Um einer Sendung zu folgen, brauchst du ein Konto auf irgendeinem Mastodon-Server.',
    },
    {
      q: 'Wo laufen die Episoden?',
      a: 'Manche Sendungen posten Audio oder Video direkt auf Mastodon. Andere verlinken auf YouTube, Spotify, Apple Podcasts und Ähnliches. Bei jedem Eintrag steht, wo die Sendung sie teilt.',
    },
    {
      q: 'Wer steht hier?',
      a: 'Konten, die sich selbst als Podcast beschreiben oder einen machen, kürzlich eine Episode geteilt haben und von Hand geprüft wurden. Ihre Beiträge werden hier nicht noch einmal veröffentlicht.',
    },
    {
      q: 'Wie komme ich auf die Liste oder wieder herunter?',
      a: 'Die Listen stammen aus öffentlichen Profilen und werden von Zeit zu Zeit erneuert. Wer nicht aufgeführt werden möchte, sagt Bescheid und bleibt bei allen künftigen Aktualisierungen außen vor.',
    },
  ],
  contact: 'Mawkingbird auf Mastodon fragen',
  alsoIn: 'Auch auf',
};

export const PODCAST_COPY: Record<string, PodcastCopy> = { en: EN, de: DE };
