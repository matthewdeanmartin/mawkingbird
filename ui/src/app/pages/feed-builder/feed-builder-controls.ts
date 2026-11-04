import { PageLanguage } from '../../focused-tools';

/**
 * The builder's and preview's own words, one block per language: the
 * controls a topic page gains for following and previewing. Kept apart from
 * the page copy (`feed-builder-chrome.ts`) because these change with the
 * wizard, not with the topic. Same style rules as the page copy.
 */
export interface FeedControls {
  builder: string;
  preview: string;
  signIn: string;
  signedOutHint: string;
  include: string;
  selectAll: string;
  selectNone: string;
  followSelectedTags: (count: number) => string;
  followSelectedPeople: (count: number) => string;
  follow: string;
  following: string;
  followFailed: string;
  followProgress: (done: number, total: number) => string;
  previewIntro: string;
  previewEmpty: string;
  loadMore: string;
  loading: string;
  backToBuilder: string;
}

const en: FeedControls = {
  builder: 'Builder',
  preview: 'Preview',
  signIn: 'Sign in with Mastodon',
  signedOutHint:
    'Sign in with Mastodon to follow these hashtags and people in one go, or open the preview to read the feed first. No account yet? Any server works, and you can move later.',
  include: 'Include',
  selectAll: 'Select all',
  selectNone: 'Clear',
  followSelectedTags: (n) => `Follow ${n} selected hashtags`,
  followSelectedPeople: (n) => `Follow ${n} selected people`,
  follow: 'Follow',
  following: 'Following',
  followFailed: 'Could not follow',
  followProgress: (done, total) => `Followed ${done} of ${total}`,
  previewIntro:
    'This is the feed this page builds, read from public posts: the hashtags and people you ticked, newest first. Nothing is followed and your Home is untouched.',
  previewEmpty: 'Nothing to show yet. Tick some hashtags or people in the builder.',
  loadMore: 'Load more',
  loading: 'Loading…',
  backToBuilder: 'Back to the builder',
};

const de: FeedControls = {
  builder: 'Auswahl',
  preview: 'Vorschau',
  signIn: 'Mit Mastodon anmelden',
  signedOutHint:
    'Melde dich mit Mastodon an, um diesen Hashtags und Leuten auf einmal zu folgen, oder öffne die Vorschau und lies den Feed zuerst. Noch kein Konto? Jeder Server geht, und du kannst später umziehen.',
  include: 'Dabei',
  selectAll: 'Alle auswählen',
  selectNone: 'Keine',
  followSelectedTags: (n) => `${n} ausgewählten Hashtags folgen`,
  followSelectedPeople: (n) => `${n} ausgewählten Leuten folgen`,
  follow: 'Folgen',
  following: 'Gefolgt',
  followFailed: 'Folgen fehlgeschlagen',
  followProgress: (done, total) => `${done} von ${total} gefolgt`,
  previewIntro:
    'So sieht der Feed aus, den diese Seite zusammenstellt, aus öffentlichen Beiträgen: die ausgewählten Hashtags und Leute, das Neueste zuerst. Niemandem wird gefolgt, deine Startseite bleibt unverändert.',
  previewEmpty: 'Noch nichts zu zeigen. Wähle in der Auswahl Hashtags oder Leute aus.',
  loadMore: 'Mehr laden',
  loading: 'Lädt …',
  backToBuilder: 'Zurück zur Auswahl',
};

const fr: FeedControls = {
  builder: 'Sélection',
  preview: 'Aperçu',
  signIn: 'Se connecter avec Mastodon',
  signedOutHint:
    'Connecte-toi avec Mastodon pour suivre ces hashtags et ces personnes d’un coup, ou ouvre l’aperçu pour lire le fil d’abord. Pas encore de compte ? N’importe quel serveur convient, et tu pourras déménager plus tard.',
  include: 'Inclure',
  selectAll: 'Tout sélectionner',
  selectNone: 'Aucun',
  followSelectedTags: (n) => `Suivre les ${n} hashtags sélectionnés`,
  followSelectedPeople: (n) => `Suivre les ${n} personnes sélectionnées`,
  follow: 'Suivre',
  following: 'Suivi',
  followFailed: 'Échec du suivi',
  followProgress: (done, total) => `${done} sur ${total} suivis`,
  previewIntro:
    'Voici le fil que compose cette page, à partir de messages publics : les hashtags et les personnes cochés, du plus récent au plus ancien. Personne n’est suivi et ton fil d’accueil ne change pas.',
  previewEmpty:
    'Rien à afficher pour l’instant. Coche des hashtags ou des personnes dans la sélection.',
  loadMore: 'Charger plus',
  loading: 'Chargement…',
  backToBuilder: 'Retour à la sélection',
};

const es: FeedControls = {
  builder: 'Selección',
  preview: 'Vista previa',
  signIn: 'Iniciar sesión con Mastodon',
  signedOutHint:
    'Inicia sesión con Mastodon para seguir estas etiquetas y personas de una vez, o abre la vista previa para leer el feed primero. ¿Aún sin cuenta? Cualquier servidor sirve, y puedes mudarte después.',
  include: 'Incluir',
  selectAll: 'Seleccionar todo',
  selectNone: 'Ninguno',
  followSelectedTags: (n) => `Seguir las ${n} etiquetas seleccionadas`,
  followSelectedPeople: (n) => `Seguir a las ${n} personas seleccionadas`,
  follow: 'Seguir',
  following: 'Siguiendo',
  followFailed: 'No se pudo seguir',
  followProgress: (done, total) => `${done} de ${total} seguidos`,
  previewIntro:
    'Este es el feed que arma esta página con publicaciones públicas: las etiquetas y personas marcadas, lo más nuevo primero. No sigues a nadie y tu inicio no cambia.',
  previewEmpty: 'Todavía no hay nada. Marca etiquetas o personas en la selección.',
  loadMore: 'Cargar más',
  loading: 'Cargando…',
  backToBuilder: 'Volver a la selección',
};

const it: FeedControls = {
  builder: 'Selezione',
  preview: 'Anteprima',
  signIn: 'Accedi con Mastodon',
  signedOutHint:
    'Accedi con Mastodon per seguire questi hashtag e queste persone in un colpo solo, oppure apri l’anteprima e leggi prima il feed. Non hai ancora un account? Va bene qualsiasi server, e puoi traslocare dopo.',
  include: 'Includi',
  selectAll: 'Seleziona tutto',
  selectNone: 'Nessuno',
  followSelectedTags: (n) => `Segui i ${n} hashtag selezionati`,
  followSelectedPeople: (n) => `Segui le ${n} persone selezionate`,
  follow: 'Segui',
  following: 'Seguito',
  followFailed: 'Impossibile seguire',
  followProgress: (done, total) => `${done} di ${total} seguiti`,
  previewIntro:
    'Questo è il feed che questa pagina compone dai post pubblici: gli hashtag e le persone selezionati, i più recenti in alto. Non segui nessuno e la tua home non cambia.',
  previewEmpty: 'Ancora niente da mostrare. Seleziona hashtag o persone nella pagina Selezione.',
  loadMore: 'Carica altri',
  loading: 'Caricamento…',
  backToBuilder: 'Torna alla selezione',
};

const ja: FeedControls = {
  builder: '選ぶ',
  preview: 'プレビュー',
  signIn: 'Mastodon でログイン',
  signedOutHint:
    'Mastodon でログインすると、これらのハッシュタグと人をまとめてフォローできます。先にプレビューでフィードを読むこともできます。アカウントがまだなくても、どのサーバーで作っても大丈夫です。あとから引っ越せます。',
  include: '含める',
  selectAll: 'すべて選択',
  selectNone: '選択解除',
  followSelectedTags: (n) => `選んだ ${n} 個のハッシュタグをフォロー`,
  followSelectedPeople: (n) => `選んだ ${n} 人をフォロー`,
  follow: 'フォロー',
  following: 'フォロー中',
  followFailed: 'フォローできませんでした',
  followProgress: (done, total) => `${total} 件中 ${done} 件をフォローしました`,
  previewIntro:
    'このページで作られるフィードを、公開投稿から表示しています。選んだハッシュタグと人の投稿が新しい順に並びます。誰もフォローせず、ホームも変わりません。',
  previewEmpty: 'まだ表示するものがありません。「選ぶ」でハッシュタグや人を選んでください。',
  loadMore: 'さらに読み込む',
  loading: '読み込み中…',
  backToBuilder: '選択に戻る',
};

export const FEED_CONTROLS: Partial<Record<PageLanguage, FeedControls>> = {
  en,
  de,
  fr,
  es,
  it,
  ja,
};

export function controlsFor(lang: PageLanguage): FeedControls {
  return FEED_CONTROLS[lang] ?? en;
}
