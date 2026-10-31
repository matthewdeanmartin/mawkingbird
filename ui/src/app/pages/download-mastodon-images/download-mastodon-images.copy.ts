import { PageLanguage } from '../../focused-tools';

/**
 * The prerendered words of the media download page, one set per language.
 *
 * Kept here rather than in the app's translation dictionaries: this is what
 * search engines read, the prerender loads no dictionaries, and each set is for
 * the readers of one language only. The tool itself (the workbench and its
 * dialog) uses the app's translations, pinned to the page's language.
 */
export interface DownloadImagesCopy {
  /** This page's own path, for the sign-in return and the Invite tab. */
  path: string;
  openApp: string;
  eyebrow: string;
  heading: string;
  intro: string;
  loading: string;
  steps: { title: string; body: string }[];
  signIn: string;
  questionsTitle: string;
  questions: { q: string; a: string }[];
}

export const DOWNLOAD_IMAGES_COPY: Record<PageLanguage, DownloadImagesCopy> = {
  en: {
    path: '/download-mastodon-images',
    openApp: 'Open the app',
    eyebrow: 'Mastodon media',
    heading: 'Download images from Mastodon',
    intro:
      'Paste a Mastodon account and see every picture it posted on one wall. Then download them all at once, as a zip or as separate files, with GIFs, videos and audio if you want them. No account needed.',
    loading: 'Loading…',
    steps: [
      {
        title: 'Paste an account',
        body: 'A handle like @someone@mastodon.social, a profile link, or just a name.',
      },
      {
        title: 'See their pictures',
        body: 'Every post with media, newest first, read straight from their own server.',
      },
      {
        title: 'Download them all',
        body: 'Pick pictures, GIFs, videos or audio, how far back, and a zip or separate files.',
      },
    ],
    signIn: 'Sign in with Mastodon',
    questionsTitle: 'Questions',
    questions: [
      {
        q: 'How do I download all the images from a Mastodon account?',
        a: 'Paste the account above, press Download media, and choose a zip. Mastodon itself only lets you save pictures one at a time, or download an archive of your own account.',
      },
      {
        q: 'Can I download my own Mastodon media?',
        a: "Yes: paste your own handle. For a full backup of your account, posts included, use your server's own data export too (Preferences → Import and export).",
      },
      {
        q: "Why couldn't some files be downloaded?",
        a: "A web page can only save a file when the server holding it allows other websites to read it. Most Mastodon servers do; some don't. Those files are listed as links, so you can open and save each one yourself.",
      },
      {
        q: 'Are the files sent through Mawkingbird?',
        a: 'No. Your browser fetches them from the Mastodon servers and makes the zip itself. Nothing is uploaded.',
      },
      {
        q: "Is it OK to download someone's pictures?",
        a: 'Their pictures still belong to them. Keeping a copy for yourself is one thing; posting them elsewhere needs their permission.',
      },
    ],
  },
  de: {
    path: '/mastodon-bilder-herunterladen',
    openApp: 'App öffnen',
    eyebrow: 'Mastodon-Medien',
    heading: 'Bilder von Mastodon herunterladen',
    intro:
      'Füge ein Mastodon-Konto ein und sieh alle Bilder, die es gepostet hat, auf einer Seite. Dann lade sie alle auf einmal herunter, als ZIP-Datei oder einzeln, auf Wunsch mit GIFs, Videos und Audio. Kein Konto nötig.',
    loading: 'Wird geladen…',
    steps: [
      {
        title: 'Konto einfügen',
        body: 'Einen Namen wie @jemand@mastodon.social, einen Profil-Link oder einfach einen Namen.',
      },
      {
        title: 'Bilder ansehen',
        body: 'Jeder Beitrag mit Medien, die neuesten zuerst, direkt von ihrem eigenen Server gelesen.',
      },
      {
        title: 'Alle herunterladen',
        body: 'Wähle Bilder, GIFs, Videos oder Audio, wie weit zurück, und ZIP oder einzelne Dateien.',
      },
    ],
    signIn: 'Mit Mastodon anmelden',
    questionsTitle: 'Fragen',
    questions: [
      {
        q: 'Wie lade ich alle Bilder eines Mastodon-Kontos herunter?',
        a: 'Füge oben das Konto ein, tippe auf „Medien herunterladen“ und wähle ZIP. Mastodon selbst speichert Bilder nur einzeln oder lädt ein Archiv deines eigenen Kontos herunter.',
      },
      {
        q: 'Kann ich meine eigenen Mastodon-Medien herunterladen?',
        a: 'Ja: Füge deinen eigenen Namen ein. Für eine vollständige Sicherung deines Kontos mit allen Beiträgen nutze zusätzlich den Datenexport deines Servers (Einstellungen → Importieren und Exportieren).',
      },
      {
        q: 'Warum ließen sich manche Dateien nicht herunterladen?',
        a: 'Eine Webseite kann eine Datei nur speichern, wenn der Server, auf dem sie liegt, anderen Websites das Lesen erlaubt. Die meisten Mastodon-Server tun das, manche nicht. Diese Dateien werden als Links aufgeführt, damit du sie einzeln öffnen und speichern kannst.',
      },
      {
        q: 'Werden die Dateien über Mawkingbird geschickt?',
        a: 'Nein. Dein Browser holt sie direkt von den Mastodon-Servern und erstellt die ZIP-Datei selbst. Nichts wird hochgeladen.',
      },
      {
        q: 'Darf ich die Bilder anderer herunterladen?',
        a: 'Die Bilder gehören weiterhin ihnen. Eine Kopie für dich selbst ist eine Sache; sie anderswo zu veröffentlichen, braucht ihre Erlaubnis.',
      },
    ],
  },
};
