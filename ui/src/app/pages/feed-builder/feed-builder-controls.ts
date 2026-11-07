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
  shuffle: string;
  sampleNote: (tags: number, people: number) => string;
  sampling: (done: number, planned: number) => string;
  sampleEmpty: string;
  backToBuilder: string;
  flooding: string;
  floodingIntro: string;
  checkAgain: string;
  floodingClear: string;
  floodersHeading: string;
  floodEvidence: (pct: number, tag: string, count: number, total: number) => string;
  muteTemporary: string;
  mutePermanent: string;
  mutedTemporary: string;
  mutedPermanent: string;
  undoMute: string;
  loudestHeading: string;
  loudest: (acct: string, pct: number, total: number) => string;
  noPosts: string;
  muteNote: string;
  subscribe: string;
  subscribed: string;
  subscribeAll: (count: number) => string;
  watch: string;
  followGroup: (count: number) => string;
  followOnMastodon: (count: number) => string;
  alreadyFollowing: (count: number) => string;
  noAccount: string;
  pickHandle: string;
  makeList: (title: string) => string;
  listExclusive: string;
  listDone: (added: number, title: string) => string;
  openList: string;
  listFailed: string;
  /** People (not hashtags) already followed, beside Follow all. */
  peopleAlreadyFollowing: (count: number) => string;
  /** The "Follow all" progress dialog. */
  bulkRunningTitle: string;
  bulkDoneTitle: string;
  bulkKeepOpen: string;
  bulkLeaveBlocked: string;
  bulkFailed: (count: number) => string;
  stop: string;
  close: string;
}

const en: FeedControls = {
  builder: 'Builder',
  preview: 'Preview',
  signIn: 'Sign in with Mastodon',
  signedOutHint:
    'Sign in with Mastodon to follow these hashtags and people in one go, or open the preview to read the feed first.',
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
  shuffle: 'Shuffle',
  sampleNote: (t, p) => `A random sample: ${t} hashtags and ${p} people at a time.`,
  sampling: (done, planned) => `Reading ${done} of ${planned} sources…`,
  sampleEmpty: 'No recent posts in this sample. Shuffle to try others.',
  backToBuilder: 'Back to the builder',
  flooding: 'Flooding',
  floodingIntro:
    'Some accounts post so often that they bury everyone else under a hashtag. This reads the newest posts of the hashtags you ticked and shows anyone taking up a quarter or more of one. Mute them here, for a while or for good.',
  checkAgain: 'Check again',
  floodingClear: 'No one is flooding these hashtags right now.',
  floodersHeading: 'Accounts flooding these hashtags',
  floodEvidence: (pct, tag, count, total) => `${pct}% of #${tag} (${count} of ${total} posts)`,
  muteTemporary: 'Mute for 8 hours',
  mutePermanent: 'Mute permanently',
  mutedTemporary: 'Muted for 8 hours',
  mutedPermanent: 'Muted',
  undoMute: 'Undo',
  loudestHeading: 'Loudest account in each hashtag',
  loudest: (acct, pct, total) => `@${acct}, ${pct}% of ${total} posts`,
  noPosts: 'No recent posts.',
  muteNote: 'Mutes hide an account from your feeds in Mawkingbird on this device.',
  subscribe: 'Subscribe in Mawkingbird',
  subscribed: 'Subscribed',
  subscribeAll: (n) => `Subscribe to all ${n} YouTube channels`,
  watch: 'Watch them in Mawkingbird',
  followGroup: (n) => `Follow ${n}`,
  followOnMastodon: (n) => `Follow ${n} on Mastodon`,
  alreadyFollowing: (n) => `${n} already followed`,
  noAccount:
    'No account yet? Any server works, and you can move later. mastodon.social is a good first choice, or join one where this community gathers:',
  pickHandle: 'Find a free username first',
  makeList: (title) => `Put them in a list: ${title}`,
  listExclusive: 'Hide their posts from Home',
  listDone: (added, title) => `Added ${added} people to the list ${title}.`,
  openList: 'Open the list',
  listFailed: 'Could not make the list.',
  peopleAlreadyFollowing: (n) => `${n} already followed`,
  bulkRunningTitle: 'Following…',
  bulkDoneTitle: 'Done',
  bulkKeepOpen: 'Keep this page open until it finishes.',
  bulkLeaveBlocked: 'Still following. Wait for it to finish, or press Stop.',
  bulkFailed: (n) => `${n} could not be followed`,
  stop: 'Stop',
  close: 'Close',
};

const de: FeedControls = {
  builder: 'Auswahl',
  preview: 'Vorschau',
  signIn: 'Mit Mastodon anmelden',
  signedOutHint:
    'Melde dich mit Mastodon an, um diesen Hashtags und Leuten auf einmal zu folgen, oder öffne die Vorschau und lies den Feed zuerst.',
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
  shuffle: 'Neu mischen',
  sampleNote: (t, p) => `Eine Zufallsauswahl: jeweils ${t} Hashtags und ${p} Leute.`,
  sampling: (done, planned) => `${done} von ${planned} Quellen gelesen …`,
  sampleEmpty: 'In dieser Auswahl gibt es keine neuen Beiträge. Misch neu, um andere zu probieren.',
  backToBuilder: 'Zurück zur Auswahl',
  flooding: 'Dauerposter',
  floodingIntro:
    'Manche Konten posten so oft, dass sie unter einem Hashtag alle anderen verdrängen. Hier werden die neuesten Beiträge deiner ausgewählten Hashtags gelesen, und jedes Konto, das ein Viertel oder mehr davon ausmacht, wird angezeigt. Stummschalten kannst du es gleich hier, vorübergehend oder dauerhaft.',
  checkAgain: 'Erneut prüfen',
  floodingClear: 'Gerade überflutet niemand diese Hashtags.',
  floodersHeading: 'Konten, die diese Hashtags überfluten',
  floodEvidence: (pct, tag, count, total) =>
    `${pct} % von #${tag} (${count} von ${total} Beiträgen)`,
  muteTemporary: 'Für 8 Stunden stummschalten',
  mutePermanent: 'Dauerhaft stummschalten',
  mutedTemporary: 'Für 8 Stunden stumm',
  mutedPermanent: 'Stummgeschaltet',
  undoMute: 'Rückgängig',
  loudestHeading: 'Das lauteste Konto je Hashtag',
  loudest: (acct, pct, total) => `@${acct}, ${pct} % von ${total} Beiträgen`,
  noPosts: 'Keine neuen Beiträge.',
  muteNote:
    'Stummgeschaltete Konten werden in Mawkingbird auf diesem Gerät aus deinen Feeds ausgeblendet.',
  subscribe: 'In Mawkingbird abonnieren',
  subscribed: 'Abonniert',
  subscribeAll: (n) => `Alle ${n} YouTube-Kanäle abonnieren`,
  watch: 'In Mawkingbird ansehen',
  followGroup: (n) => `${n} folgen`,
  followOnMastodon: (n) => `${n} auf Mastodon folgen`,
  alreadyFollowing: (n) => `${n} folgst du schon`,
  noAccount:
    'Noch kein Konto? Jeder Server geht, und du kannst später umziehen. mastodon.social ist ein guter Anfang, oder du gehst dorthin, wo sich diese Community trifft:',
  pickHandle: 'Erst einen freien Benutzernamen finden',
  makeList: (title) => `In eine Liste packen: ${title}`,
  listExclusive: 'Ihre Beiträge nicht auf der Startseite zeigen',
  listDone: (added, title) => `${added} Leute zur Liste ${title} hinzugefügt.`,
  openList: 'Liste öffnen',
  listFailed: 'Die Liste konnte nicht angelegt werden.',
  peopleAlreadyFollowing: (n) => `${n} folgst du schon`,
  bulkRunningTitle: 'Folgen läuft…',
  bulkDoneTitle: 'Fertig',
  bulkKeepOpen: 'Lass diese Seite offen, bis es fertig ist.',
  bulkLeaveBlocked: 'Es läuft noch. Warte, bis es fertig ist, oder drücke Stopp.',
  bulkFailed: (n) => `Bei ${n} hat das Folgen nicht geklappt`,
  stop: 'Stopp',
  close: 'Schließen',
};

const fr: FeedControls = {
  builder: 'Sélection',
  preview: 'Aperçu',
  signIn: 'Se connecter avec Mastodon',
  signedOutHint:
    'Connecte-toi avec Mastodon pour suivre ces hashtags et ces personnes d’un coup, ou ouvre l’aperçu pour lire le fil d’abord.',
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
    'Voici le fil que compose cette page, à partir de messages publics\u00a0: les hashtags et les personnes cochés, du plus récent au plus ancien. Personne n’est suivi et ton fil d’accueil ne change pas.',
  previewEmpty:
    'Rien à afficher pour l’instant. Coche des hashtags ou des personnes dans la sélection.',
  shuffle: 'Mélanger',
  sampleNote: (t, p) =>
    `Un échantillon au hasard\u00a0: ${t} hashtags et ${p} personnes à la fois.`,
  sampling: (done, planned) => `${done} sources lues sur ${planned}…`,
  sampleEmpty: 'Aucun message récent dans cet échantillon. Mélange pour en essayer d’autres.',
  backToBuilder: 'Retour à la sélection',
  flooding: 'Saturation',
  floodingIntro:
    'Certains comptes publient tant qu’ils noient tout le monde sous un hashtag. On lit ici les messages les plus récents des hashtags que tu as cochés et on montre tout compte qui en occupe un quart ou plus. Tu peux le masquer ici, pour un temps ou pour de bon.',
  checkAgain: 'Vérifier à nouveau',
  floodingClear: 'Personne ne sature ces hashtags en ce moment.',
  floodersHeading: 'Comptes qui saturent ces hashtags',
  floodEvidence: (pct, tag, count, total) =>
    `${pct}\u202f% de #${tag} (${count} messages sur ${total})`,
  muteTemporary: 'Masquer pendant 8 heures',
  mutePermanent: 'Masquer définitivement',
  mutedTemporary: 'Masqué pendant 8 heures',
  mutedPermanent: 'Masqué',
  undoMute: 'Annuler',
  loudestHeading: 'Le compte le plus présent par hashtag',
  loudest: (acct, pct, total) => `@${acct}, ${pct}\u202f% de ${total} messages`,
  noPosts: 'Aucun message récent.',
  muteNote: 'Un compte masqué disparaît de tes fils dans Mawkingbird, sur cet appareil.',
  subscribe: 'S’abonner dans Mawkingbird',
  subscribed: 'Abonné',
  subscribeAll: (n) => `S’abonner aux ${n} chaînes YouTube`,
  watch: 'Les regarder dans Mawkingbird',
  followGroup: (n) => `Suivre les ${n}`,
  followOnMastodon: (n) => `Suivre les ${n} sur Mastodon`,
  alreadyFollowing: (n) => `${n} déjà suivis`,
  noAccount:
    'Pas encore de compte\u202f? N’importe quel serveur convient, et tu pourras déménager plus tard. mastodon.social est un bon premier choix, ou rejoins un serveur où se retrouve cette communauté\u00a0:',
  pickHandle: 'Trouver d’abord un nom d’utilisateur libre',
  makeList: (title) => `Les mettre dans une liste\u00a0: ${title}`,
  listExclusive: 'Masquer leurs messages de l’accueil',
  listDone: (added, title) => `${added} personnes ajoutées à la liste ${title}.`,
  openList: 'Ouvrir la liste',
  listFailed: 'Impossible de créer la liste.',
  peopleAlreadyFollowing: (n) => `${n} déjà suivis`,
  bulkRunningTitle: 'Abonnement en cours…',
  bulkDoneTitle: 'Terminé',
  bulkKeepOpen: 'Gardez cette page ouverte jusqu’à la fin.',
  bulkLeaveBlocked: 'C’est encore en cours. Attendez la fin, ou appuyez sur Arrêter.',
  bulkFailed: (n) => `${n} n’ont pas pu être suivis`,
  stop: 'Arrêter',
  close: 'Fermer',
};

const es: FeedControls = {
  builder: 'Selección',
  preview: 'Vista previa',
  signIn: 'Iniciar sesión con Mastodon',
  signedOutHint:
    'Inicia sesión con Mastodon para seguir estas etiquetas y personas de una vez, o abre la vista previa para leer el feed primero.',
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
  shuffle: 'Mezclar',
  sampleNote: (t, p) => `Una muestra al azar: ${t} etiquetas y ${p} personas cada vez.`,
  sampling: (done, planned) => `Leyendo ${done} de ${planned} fuentes…`,
  sampleEmpty: 'No hay publicaciones recientes en esta muestra. Mezcla para probar otras.',
  backToBuilder: 'Volver a la selección',
  flooding: 'Saturación',
  floodingIntro:
    'Algunas cuentas publican tanto que tapan a todos los demás en una etiqueta. Aquí se leen las publicaciones más recientes de las etiquetas que marcaste y se muestra cualquier cuenta que ocupe un cuarto o más de una. Puedes silenciarla aquí, por un rato o para siempre.',
  checkAgain: 'Volver a comprobar',
  floodingClear: 'Ahora mismo nadie está saturando estas etiquetas.',
  floodersHeading: 'Cuentas que saturan estas etiquetas',
  floodEvidence: (pct, tag, count, total) =>
    `${pct} % de #${tag} (${count} de ${total} publicaciones)`,
  muteTemporary: 'Silenciar 8 horas',
  mutePermanent: 'Silenciar para siempre',
  mutedTemporary: 'Silenciada 8 horas',
  mutedPermanent: 'Silenciada',
  undoMute: 'Deshacer',
  loudestHeading: 'La cuenta más presente en cada etiqueta',
  loudest: (acct, pct, total) => `@${acct}, ${pct} % de ${total} publicaciones`,
  noPosts: 'Sin publicaciones recientes.',
  muteNote: 'Silenciar oculta la cuenta de tus feeds en Mawkingbird, en este dispositivo.',
  subscribe: 'Suscribirse en Mawkingbird',
  subscribed: 'Suscrito',
  subscribeAll: (n) => `Suscribirse a los ${n} canales de YouTube`,
  watch: 'Verlos en Mawkingbird',
  followGroup: (n) => `Seguir a ${n}`,
  followOnMastodon: (n) => `Seguir a ${n} en Mastodon`,
  alreadyFollowing: (n) => `${n} ya seguidas`,
  noAccount:
    '¿Aún sin cuenta? Cualquier servidor sirve, y puedes mudarte después. mastodon.social es una buena primera opción, o únete a uno donde se reúne esta comunidad:',
  pickHandle: 'Busca primero un nombre de usuario libre',
  makeList: (title) => `Ponerlos en una lista: ${title}`,
  listExclusive: 'Ocultar sus publicaciones del inicio',
  listDone: (added, title) => `${added} personas añadidas a la lista ${title}.`,
  openList: 'Abrir la lista',
  listFailed: 'No se pudo crear la lista.',
  peopleAlreadyFollowing: (n) => `${n} ya seguidos`,
  bulkRunningTitle: 'Siguiendo…',
  bulkDoneTitle: 'Listo',
  bulkKeepOpen: 'Deja esta página abierta hasta que termine.',
  bulkLeaveBlocked: 'Todavía está en marcha. Espera a que termine o pulsa Detener.',
  bulkFailed: (n) => `No se pudo seguir a ${n}`,
  stop: 'Detener',
  close: 'Cerrar',
};

const it: FeedControls = {
  builder: 'Selezione',
  preview: 'Anteprima',
  signIn: 'Accedi con Mastodon',
  signedOutHint:
    'Accedi con Mastodon per seguire questi hashtag e queste persone in un colpo solo, oppure apri l’anteprima e leggi prima il feed.',
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
  shuffle: 'Mescola',
  sampleNote: (t, p) => `Un campione a caso: ${t} hashtag e ${p} persone alla volta.`,
  sampling: (done, planned) => `Lette ${done} fonti su ${planned}…`,
  sampleEmpty: 'Nessun post recente in questo campione. Mescola per provarne altri.',
  backToBuilder: 'Torna alla selezione',
  flooding: 'Saturazione',
  floodingIntro:
    'Alcuni account pubblicano così tanto da sommergere tutti gli altri sotto un hashtag. Qui leggiamo i post più recenti degli hashtag che hai selezionato e mostriamo chi ne occupa un quarto o più. Puoi silenziarlo qui, per un po’ o per sempre.',
  checkAgain: 'Controlla di nuovo',
  floodingClear: 'Al momento nessuno sta saturando questi hashtag.',
  floodersHeading: 'Account che saturano questi hashtag',
  floodEvidence: (pct, tag, count, total) => `${pct}% di #${tag} (${count} post su ${total})`,
  muteTemporary: 'Silenzia per 8 ore',
  mutePermanent: 'Silenzia per sempre',
  mutedTemporary: 'Silenziato per 8 ore',
  mutedPermanent: 'Silenziato',
  undoMute: 'Annulla',
  loudestHeading: 'L’account più presente in ogni hashtag',
  loudest: (acct, pct, total) => `@${acct}, ${pct}% di ${total} post`,
  noPosts: 'Nessun post recente.',
  muteNote: 'Un account silenziato sparisce dai tuoi feed in Mawkingbird, su questo dispositivo.',
  subscribe: 'Iscriviti in Mawkingbird',
  subscribed: 'Iscritto',
  subscribeAll: (n) => `Iscriviti a tutti i ${n} canali YouTube`,
  watch: 'Guardali in Mawkingbird',
  followGroup: (n) => `Segui ${n}`,
  followOnMastodon: (n) => `Segui ${n} su Mastodon`,
  alreadyFollowing: (n) => `${n} già seguiti`,
  noAccount:
    'Non hai ancora un account? Va bene qualsiasi server, e puoi traslocare dopo. mastodon.social è una buona prima scelta, oppure iscriviti a uno dove si ritrova questa comunità:',
  pickHandle: 'Trova prima un nome utente libero',
  makeList: (title) => `Mettili in una lista: ${title}`,
  listExclusive: 'Nascondi i loro post dalla home',
  listDone: (added, title) => `${added} persone aggiunte alla lista ${title}.`,
  openList: 'Apri la lista',
  listFailed: 'Impossibile creare la lista.',
  peopleAlreadyFollowing: (n) => `${n} già seguiti`,
  bulkRunningTitle: 'Follow in corso…',
  bulkDoneTitle: 'Fatto',
  bulkKeepOpen: 'Tieni aperta questa pagina finché non ha finito.',
  bulkLeaveBlocked: 'È ancora in corso. Aspetta che finisca o premi Ferma.',
  bulkFailed: (n) => `${n} non seguiti per un errore`,
  stop: 'Ferma',
  close: 'Chiudi',
};

const ja: FeedControls = {
  builder: '選ぶ',
  preview: 'プレビュー',
  signIn: 'Mastodon でログイン',
  signedOutHint:
    'Mastodon でログインすると、これらのハッシュタグと人をまとめてフォローできます。先にプレビューでフィードを読むこともできます。',
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
  shuffle: 'シャッフル',
  sampleNote: (t, p) => `ランダムに選んだハッシュタグ ${t} 個と ${p} 人を表示しています。`,
  sampling: (done, planned) => `${planned} 件中 ${done} 件を読み込み中…`,
  sampleEmpty: 'このサンプルには最近の投稿がありません。シャッフルして別のものを試してください。',
  backToBuilder: '選択に戻る',
  flooding: '連投チェック',
  floodingIntro:
    '投稿が多すぎて、ハッシュタグのほかの投稿を埋もれさせてしまうアカウントがあります。ここでは選んだハッシュタグの最新投稿を読み、その 4 分の 1 以上を占めるアカウントを表示します。その場で、一時的または無期限にミュートできます。',
  checkAgain: 'もう一度チェック',
  floodingClear: '今のところ、これらのハッシュタグを連投で埋めているアカウントはありません。',
  floodersHeading: 'ハッシュタグを連投で埋めているアカウント',
  floodEvidence: (pct, tag, count, total) => `#${tag} の ${pct}%（${total} 件中 ${count} 件）`,
  muteTemporary: '8 時間ミュート',
  mutePermanent: '無期限にミュート',
  mutedTemporary: '8 時間ミュート中',
  mutedPermanent: 'ミュート中',
  undoMute: '元に戻す',
  loudestHeading: 'ハッシュタグごとに最も投稿の多いアカウント',
  loudest: (acct, pct, total) => `@${acct}（${total} 件中 ${pct}%）`,
  noPosts: '最近の投稿はありません。',
  muteNote:
    'ミュートすると、この端末の Mawkingbird のフィードにそのアカウントが表示されなくなります。',
  subscribe: 'Mawkingbird で登録',
  subscribed: '登録済み',
  subscribeAll: (n) => `YouTube チャンネル ${n} 件をすべて登録`,
  watch: 'Mawkingbird で見る',
  followGroup: (n) => `${n} 人をフォロー`,
  followOnMastodon: (n) => `マストドンで ${n} 人をフォロー`,
  alreadyFollowing: (n) => `${n} 個はフォロー済み`,
  noAccount:
    'アカウントがまだなくても、どのサーバーで作っても大丈夫です。あとから引っ越せます。最初は mastodon.social がおすすめです。このコミュニティが集まるサーバーもあります：',
  pickHandle: '先に空いているユーザー名を探す',
  makeList: (title) => `リストにまとめる：${title}`,
  listExclusive: 'ホームには表示しない',
  listDone: (added, title) => `${added} 人をリスト「${title}」に追加しました。`,
  openList: 'リストを開く',
  listFailed: 'リストを作成できませんでした。',
  peopleAlreadyFollowing: (n) => `${n} 人はフォロー済み`,
  bulkRunningTitle: 'フォロー中…',
  bulkDoneTitle: '完了',
  bulkKeepOpen: '終わるまでこのページを開いたままにしてください。',
  bulkLeaveBlocked: 'まだ処理中です。終わるまで待つか、「停止」を押してください。',
  bulkFailed: (n) => `${n} 件はフォローできませんでした`,
  stop: '停止',
  close: '閉じる',
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
