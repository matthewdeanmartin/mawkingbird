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
    path: '/de/mastodon-bilder-herunterladen',
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
  es: {
    path: '/es/descargar-imagenes-de-mastodon',
    openApp: 'Abrir la app',
    eyebrow: 'Multimedia de Mastodon',
    heading: 'Descargar las imágenes de una cuenta de Mastodon',
    intro:
      'Pega una cuenta de Mastodon y mira todas las imágenes que ha publicado en una sola página. Luego descárgalas todas de una vez, en un ZIP o por separado, con GIF, videos y audio si quieres. Sin cuenta.',
    loading: 'Cargando…',
    steps: [
      {
        title: 'Pega una cuenta',
        body: 'Un nombre como @alguien@mastodon.social, el enlace de un perfil o simplemente un nombre.',
      },
      {
        title: 'Mira las imágenes',
        body: 'Cada publicación con contenido multimedia, las más recientes primero, leídas directamente de su propio servidor.',
      },
      {
        title: 'Descárgalas todas',
        body: 'Elige imágenes, GIF, videos o audio, hasta dónde retroceder, y ZIP o archivos sueltos.',
      },
    ],
    signIn: 'Iniciar sesión con Mastodon',
    questionsTitle: 'Preguntas',
    questions: [
      {
        q: '¿Cómo descargo todas las imágenes de una cuenta de Mastodon?',
        a: 'Pega la cuenta arriba, pulsa “Descargar multimedia” y elige ZIP. Mastodon por sí solo guarda las imágenes de una en una, o descarga un archivo de tu propia cuenta.',
      },
      {
        q: '¿Puedo descargar mis propias imágenes de Mastodon?',
        a: 'Sí: pega tu propio nombre. Para una copia completa de tu cuenta con todas tus publicaciones, usa también la exportación de datos de tu servidor (Preferencias → Importar y exportar).',
      },
      {
        q: '¿Por qué algunos archivos no se pudieron descargar?',
        a: 'Una página web solo puede guardar un archivo si el servidor donde está permite que otras webs lo lean. La mayoría de los servidores de Mastodon lo permiten; algunos no. Esos archivos aparecen como enlaces para que los abras y guardes uno por uno.',
      },
      {
        q: '¿Los archivos pasan por Mawkingbird?',
        a: 'No. Tu navegador los recoge directamente de los servidores de Mastodon y crea el ZIP él mismo. No se sube nada.',
      },
      {
        q: '¿Puedo descargar las imágenes de otras personas?',
        a: 'Las imágenes siguen siendo de quien las publicó. Guardar una copia para ti es una cosa; volver a publicarlas en otro sitio necesita su permiso.',
      },
    ],
  },
  fr: {
    path: '/fr/telecharger-images-mastodon',
    openApp: 'Ouvrir l’appli',
    eyebrow: 'Médias Mastodon',
    heading: 'Télécharger les images d’un compte Mastodon',
    intro:
      'Colle un compte Mastodon et vois toutes les images qu’il a publiées sur une seule page. Puis télécharge-les toutes d’un coup, en ZIP ou une par une, avec les GIF, vidéos et sons si tu veux. Pas besoin de compte.',
    loading: 'Chargement…',
    steps: [
      {
        title: 'Coller un compte',
        body: 'Un nom comme @quelquun@mastodon.social, un lien de profil, ou simplement un nom.',
      },
      {
        title: 'Voir les images',
        body: 'Chaque message avec des médias, les plus récents d’abord, lus directement depuis leur propre serveur.',
      },
      {
        title: 'Tout télécharger',
        body: 'Choisis images, GIF, vidéos ou sons, jusqu’où remonter, et ZIP ou fichiers séparés.',
      },
    ],
    signIn: 'Se connecter avec Mastodon',
    questionsTitle: 'Questions',
    questions: [
      {
        q: 'Comment télécharger toutes les images d’un compte Mastodon ?',
        a: 'Colle le compte ci-dessus, appuie sur « Télécharger les médias » et choisis ZIP. Mastodon lui-même n’enregistre les images qu’une par une, ou télécharge l’archive de ton propre compte.',
      },
      {
        q: 'Puis-je télécharger mes propres médias Mastodon ?',
        a: 'Oui : colle ton propre nom. Pour une sauvegarde complète de ton compte avec tous tes messages, utilise aussi l’export de données de ton serveur (Préférences → Import et export).',
      },
      {
        q: 'Pourquoi certains fichiers n’ont-ils pas pu être téléchargés ?',
        a: 'Une page web ne peut enregistrer un fichier que si le serveur qui l’héberge autorise les autres sites à le lire. La plupart des serveurs Mastodon le font, certains non. Ces fichiers sont listés sous forme de liens, pour que tu les ouvres et les enregistres un par un.',
      },
      {
        q: 'Les fichiers passent-ils par Mawkingbird ?',
        a: 'Non. Ton navigateur les récupère directement depuis les serveurs Mastodon et crée lui-même le fichier ZIP. Rien n’est envoyé.',
      },
      {
        q: 'Ai-je le droit de télécharger les images des autres ?',
        a: 'Les images restent à leurs auteurs. En garder une copie pour toi est une chose ; les republier ailleurs demande leur accord.',
      },
    ],
  },
  ja: {
    path: '/ja/download-mastodon-images',
    openApp: 'アプリを開く',
    eyebrow: 'Mastodon の画像保存',
    heading: 'Mastodon の画像をまとめてダウンロード',
    intro:
      'Mastodon のアカウントを入力すると、そのアカウントが投稿した画像を一覧で表示します。あとはまとめてダウンロードするだけ。ZIP でも個別のファイルでも保存でき、GIF・動画・音声も選べます。アカウント登録は不要です。',
    loading: '読み込み中…',
    steps: [
      {
        title: 'アカウントを入力',
        body: '@someone@mastodon.social のようなユーザー名、プロフィールの URL、または名前で検索できます。',
      },
      {
        title: '画像を一覧表示',
        body: 'メディア付きの投稿を新しい順に、相手のサーバーから直接読み込みます。',
      },
      {
        title: 'まとめて保存',
        body: '画像・GIF・動画・音声の種類、さかのぼる件数、ZIP か個別ファイルかを選べます。',
      },
    ],
    signIn: 'Mastodon でログイン',
    questionsTitle: 'よくある質問',
    questions: [
      {
        q: 'Mastodon のアカウントの画像を全部ダウンロードするには？',
        a: '上の欄にアカウントを入力し、「メディアをダウンロード」を押して ZIP を選んでください。Mastodon 本体では、画像は 1 枚ずつ保存するか、自分のアカウントのアーカイブをダウンロードするしかありません。',
      },
      {
        q: '自分の投稿の画像も保存できますか？',
        a: 'はい。自分のユーザー名を入力してください。投稿も含めたアカウント全体のバックアップには、サーバーのデータエクスポート（設定 → インポートとエクスポート）も併せてご利用ください。',
      },
      {
        q: 'ダウンロードできないファイルがあるのはなぜ？',
        a: 'Web ページがファイルを保存できるのは、そのファイルを置いているサーバーが他のサイトからの読み込みを許可している場合だけです。多くの Mastodon サーバーは許可していますが、許可していないサーバーもあります。その場合はリンクとして一覧表示されるので、1 つずつ開いて保存できます。',
      },
      {
        q: 'ファイルは Mawkingbird を経由しますか？',
        a: 'いいえ。ブラウザーが Mastodon のサーバーから直接ファイルを取得し、ZIP もブラウザーの中で作ります。アップロードされるものはありません。',
      },
      {
        q: '他人の画像をダウンロードしても大丈夫？',
        a: '画像の権利は投稿者にあります。自分用に保存するのと、他の場所に投稿するのとは別の話です。転載する場合は投稿者の許可を得てください。',
      },
    ],
  },
  'zh-Hant': {
    path: '/zh-hant/download-mastodon-images',
    openApp: '開啟 App',
    eyebrow: 'Mastodon 媒體',
    heading: '批次下載 Mastodon 帳號的圖片',
    intro:
      '貼上一個 Mastodon 帳號，在同一頁看到它發過的所有圖片。接著一次全部下載，可以打包成 ZIP 或存成個別檔案，也能包含 GIF、影片與音訊。不需要帳號。',
    loading: '載入中……',
    steps: [
      {
        title: '貼上帳號',
        body: '例如 @someone@mastodon.social 的帳號名稱、個人檔案連結，或直接輸入名字。',
      },
      {
        title: '查看圖片',
        body: '每則含媒體的嘟文，最新的在前，直接從對方的伺服器讀取。',
      },
      {
        title: '全部下載',
        body: '選擇圖片、GIF、影片或音訊、要往回找多遠，以及 ZIP 或個別檔案。',
      },
    ],
    signIn: '用 Mastodon 登入',
    questionsTitle: '常見問題',
    questions: [
      {
        q: '如何下載一個 Mastodon 帳號的所有圖片？',
        a: '在上方貼上帳號，按「下載媒體」並選擇 ZIP。Mastodon 本身只能一張一張存圖，或下載您自己帳號的封存檔。',
      },
      {
        q: '可以下載我自己在 Mastodon 的媒體嗎？',
        a: '可以：貼上您自己的帳號名稱。若要完整備份帳號與所有嘟文，也請使用伺服器的資料匯出功能（偏好設定 → 匯入與匯出）。',
      },
      {
        q: '為什麼有些檔案無法下載？',
        a: '網頁只能儲存那些所在伺服器允許其他網站讀取的檔案。大多數 Mastodon 伺服器允許，有些不允許。這些檔案會以連結列出，讓您逐一開啟儲存。',
      },
      {
        q: '檔案會經過 Mawkingbird 嗎？',
        a: '不會。您的瀏覽器直接從 Mastodon 伺服器取得檔案，並自己製作 ZIP，不會上傳任何東西。',
      },
      {
        q: '可以下載別人的圖片嗎？',
        a: '圖片仍然屬於發布的人。留一份給自己是一回事；要在別處重新發布，需要對方同意。',
      },
    ],
  },
  ko: {
    path: '/ko/download-mastodon-images',
    openApp: '앱 열기',
    eyebrow: 'Mastodon 미디어',
    heading: 'Mastodon 계정의 이미지 한 번에 다운로드',
    intro:
      'Mastodon 계정을 붙여 넣으면 그 계정이 올린 이미지를 한 페이지에서 모두 볼 수 있습니다. 그런 다음 ZIP이나 개별 파일로 한 번에 다운로드하세요. 원하면 GIF, 동영상, 오디오도 함께 받을 수 있습니다. 계정은 필요 없습니다.',
    loading: '불러오는 중…',
    steps: [
      {
        title: '계정 붙여 넣기',
        body: '@someone@mastodon.social 같은 사용자 이름, 프로필 링크, 또는 그냥 이름.',
      },
      {
        title: '이미지 보기',
        body: '미디어가 있는 모든 게시물을 최신순으로, 그 계정의 서버에서 바로 읽어 옵니다.',
      },
      {
        title: '모두 다운로드',
        body: '이미지, GIF, 동영상, 오디오 중 무엇을, 얼마나 거슬러 올라갈지, ZIP인지 개별 파일인지 고르세요.',
      },
    ],
    signIn: 'Mastodon으로 로그인',
    questionsTitle: '자주 묻는 질문',
    questions: [
      {
        q: 'Mastodon 계정의 이미지를 모두 다운로드하려면?',
        a: '위에 계정을 붙여 넣고 “미디어 다운로드”를 누른 뒤 ZIP을 고르세요. Mastodon 자체로는 이미지를 하나씩 저장하거나 내 계정의 보관 파일을 받을 수만 있습니다.',
      },
      {
        q: '내 Mastodon 미디어도 다운로드할 수 있나요?',
        a: '네. 내 사용자 이름을 붙여 넣으세요. 모든 게시물을 포함한 계정 전체 백업은 서버의 데이터 내보내기(환경설정 → 가져오기 및 내보내기)도 함께 이용하세요.',
      },
      {
        q: '일부 파일이 다운로드되지 않은 이유는?',
        a: '웹 페이지는 파일이 있는 서버가 다른 사이트의 읽기를 허용할 때만 파일을 저장할 수 있습니다. 대부분의 Mastodon 서버는 허용하지만 일부는 그렇지 않습니다. 그런 파일은 링크로 보여 드리니 하나씩 열어 저장하세요.',
      },
      {
        q: '파일이 Mawkingbird를 거치나요?',
        a: '아니요. 브라우저가 Mastodon 서버에서 직접 받아 ZIP 파일을 스스로 만듭니다. 아무것도 업로드하지 않습니다.',
      },
      {
        q: '다른 사람의 이미지를 다운로드해도 되나요?',
        a: '이미지는 여전히 올린 사람의 것입니다. 나만 보려고 사본을 두는 것과 다른 곳에 다시 올리는 것은 다르며, 다시 올리려면 허락이 필요합니다.',
      },
    ],
  },
  pt: {
    path: '/pt/baixar-imagens-do-mastodon',
    openApp: 'Abrir o app',
    eyebrow: 'Mídia do Mastodon',
    heading: 'Baixar as imagens de uma conta do Mastodon',
    intro:
      'Cole uma conta do Mastodon e veja todas as imagens que ela publicou numa página só. Depois baixe tudo de uma vez, em ZIP ou em arquivos separados, com GIFs, vídeos e áudio se quiser. Sem conta.',
    loading: 'Carregando…',
    steps: [
      {
        title: 'Cole uma conta',
        body: 'Um nome como @alguem@mastodon.social, o link de um perfil ou só um nome.',
      },
      {
        title: 'Veja as imagens',
        body: 'Cada publicação com mídia, das mais recentes para as mais antigas, lidas direto do servidor da conta.',
      },
      {
        title: 'Baixe tudo',
        body: 'Escolha imagens, GIFs, vídeos ou áudio, até onde voltar, e ZIP ou arquivos separados.',
      },
    ],
    signIn: 'Entrar com o Mastodon',
    questionsTitle: 'Perguntas',
    questions: [
      {
        q: 'Como baixar todas as imagens de uma conta do Mastodon?',
        a: 'Cole a conta acima, toque em “Baixar mídia” e escolha ZIP. O Mastodon sozinho só salva as imagens uma por uma, ou baixa o arquivo da sua própria conta.',
      },
      {
        q: 'Posso baixar minha própria mídia do Mastodon?',
        a: 'Pode: cole o seu próprio nome. Para um backup completo da conta com todas as publicações, use também a exportação de dados do seu servidor (Preferências → Importar e exportar).',
      },
      {
        q: 'Por que alguns arquivos não baixaram?',
        a: 'Uma página da web só consegue salvar um arquivo se o servidor onde ele está deixa outros sites lerem. A maioria dos servidores do Mastodon deixa, alguns não. Esses arquivos aparecem como links para você abrir e salvar um por um.',
      },
      {
        q: 'Os arquivos passam pelo Mawkingbird?',
        a: 'Não. O seu navegador busca os arquivos direto nos servidores do Mastodon e monta o ZIP sozinho. Nada é enviado.',
      },
      {
        q: 'Posso baixar as imagens de outras pessoas?',
        a: 'As imagens continuam sendo de quem publicou. Guardar uma cópia para você é uma coisa; publicar de novo em outro lugar precisa da permissão da pessoa.',
      },
    ],
  },
  it: {
    path: '/it/scaricare-immagini-da-mastodon',
    openApp: 'Apri l’app',
    eyebrow: 'Media di Mastodon',
    heading: 'Scaricare le immagini di un account Mastodon',
    intro:
      'Incolla un account Mastodon e guarda tutte le immagini che ha pubblicato in una sola pagina. Poi scaricale tutte in una volta, in un file ZIP o separate, con GIF, video e audio se vuoi. Senza account.',
    loading: 'Caricamento…',
    steps: [
      {
        title: 'Incolla un account',
        body: 'Un nome come @qualcuno@mastodon.social, il link di un profilo o semplicemente un nome.',
      },
      {
        title: 'Guarda le immagini',
        body: 'Ogni post con media, dal più recente, letto direttamente dal suo server.',
      },
      {
        title: 'Scarica tutto',
        body: 'Scegli immagini, GIF, video o audio, quanto andare indietro, e ZIP o file separati.',
      },
    ],
    signIn: 'Accedi con Mastodon',
    questionsTitle: 'Domande',
    questions: [
      {
        q: 'Come scarico tutte le immagini di un account Mastodon?',
        a: 'Incolla l’account qui sopra, tocca “Scarica i media” e scegli ZIP. Mastodon da solo salva le immagini una alla volta, oppure scarica l’archivio del tuo account.',
      },
      {
        q: 'Posso scaricare i miei media di Mastodon?',
        a: 'Sì: incolla il tuo nome. Per un backup completo dell’account con tutti i post, usa anche l’esportazione dei dati del tuo server (Preferenze → Importa ed esporta).',
      },
      {
        q: 'Perché alcuni file non si sono scaricati?',
        a: 'Una pagina web può salvare un file solo se il server che lo ospita permette ad altri siti di leggerlo. Quasi tutti i server Mastodon lo permettono, alcuni no. Quei file vengono elencati come link, da aprire e salvare uno per uno.',
      },
      {
        q: 'I file passano da Mawkingbird?',
        a: 'No. Il tuo browser li prende direttamente dai server Mastodon e crea da solo il file ZIP. Non viene caricato niente.',
      },
      {
        q: 'Posso scaricare le immagini degli altri?',
        a: 'Le immagini restano di chi le ha pubblicate. Tenerne una copia per te è una cosa; ripubblicarle altrove richiede il loro permesso.',
      },
    ],
  },
};
