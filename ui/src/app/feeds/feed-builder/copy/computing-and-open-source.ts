import { PageLanguage } from '../../../public-pages/focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  el: {
    title: 'Πληροφορική και ανοικτό λογισμικό στο Mastodon: ποιον να ακολουθήσεις',
    description:
      'Τέσσερις λογαριασμοί για προγραμματισμό, ανοικτό λογισμικό και τεχνολογία στα ελληνικά. Δες τη δημόσια ροή και διάλεξε ποιους θα ακολουθήσεις.',
    heading: 'Πληροφορική και ανοικτό λογισμικό στο Mastodon',
    listTitle: 'Πληροφορική και ανοικτό λογισμικό',
    intro: [
      'Μια μικρή αρχή για την ελληνόφωνη τεχνολογική σου ροή: τέσσερις λογαριασμοί με αναρτήσεις για προγραμματισμό, ελεύθερο λογισμικό και ψηφιακά εργαλεία. Οι δημιουργοί γράφουν επίσης στα αγγλικά και για άλλα θέματα.',
      'Δες πρώτα τις δημόσιες αναρτήσεις. Τα ελληνικά hashtags μπορεί να έχουν λίγη ή καθόλου πρόσφατη κίνηση· είναι προτάσεις για το θέμα, όχι υπόσχεση καθημερινής ροής. Το κοινό #FOSS περιλαμβάνει πολύ αγγλόφωνο περιεχόμενο.',
    ],
    faq: [
      {
        q: 'Χρειάζομαι λογαριασμό;',
        a: 'Μπορείς να δεις τα δημόσια προφίλ και την προεπισκόπηση χωρίς λογαριασμό. Συνδέσου με Mastodon για να ακολουθήσεις προφίλ και hashtags ή να δημιουργήσεις λίστα.',
      },
      {
        q: 'Είναι όλες οι αναρτήσεις στα ελληνικά και μόνο για τεχνολογία;',
        a: 'Όχι. Η επιλογή βασίζεται σε τεχνολογικές αναρτήσεις στα ελληνικά, αλλά οι λογαριασμοί γράφουν και σε άλλες γλώσσες και για άλλα θέματα. Δες τη ροή πριν ακολουθήσεις.',
      },
      {
        q: 'Πώς προτείνω ένα προφίλ ή ζητώ αφαίρεση;',
        a: 'Γράψε στο @mawkingbird@mastodon.social. Ελέγχουμε τη θεματολογία, τη γλώσσα, την πρόσφατη δραστηριότητα και τις ρυθμίσεις ανακάλυψης. Σεβόμαστε τα αιτήματα αφαίρεσης.',
      },
    ],
  },
  hu: {
    title: 'Informatika és szabad szoftver a Mastodonon: kit érdemes követni?',
    description:
      'Három magyarul is író Mastodon-profil programozásról, szabad szoftverről és technológiáról. Nézz bele a nyilvános bejegyzésekbe!',
    heading: 'Informatika és szabad szoftver a Mastodonon',
    listTitle: 'Informatika és szabad szoftver',
    intro: [
      'Kis válogatás a magyar nyelvű technológiai hírfolyamod elindításához: három profil programozásról, szabad szoftverről és digitális eszközökről. A szerzők angolul és más témákról is írnak.',
      'Először nézz bele a nyilvános hírfolyamba. A magyar hashtagek csendesek lehetnek, akár friss bejegyzés nélkül: témaválasztási javaslatok, nem napi aktivitási ígéretek. A közös #FOSS alatt sok az angol nyelvű tartalom.',
    ],
    faq: [
      {
        q: 'Kell hozzá fiók?',
        a: 'A nyilvános profilokat és az előnézetet fiók nélkül is megnézheted. A profilok és hashtagek követéséhez vagy lista létrehozásához jelentkezz be a Mastodonnal.',
      },
      {
        q: 'Minden bejegyzés magyarul és az informatikáról szól?',
        a: 'Nem. A válogatás magyar nyelvű technológiai bejegyzésekre épül, de a szerzők más nyelveken és más témákról is írnak. Követés előtt nézz bele a hírfolyamba.',
      },
      {
        q: 'Hogyan ajánlhatok profilt vagy kérhetem az eltávolításomat?',
        a: 'Írj a @mawkingbird@mastodon.social címre. Ellenőrizzük a témát, a nyelvet, a friss aktivitást és a felfedezhetőségi beállításokat. Az eltávolítási kéréseket teljesítjük.',
      },
    ],
  },
  lt: {
    title: 'Technologijos ir atvirasis kodas Mastodon: ką sekti',
    description:
      'Keturi lietuviškai rašantys Mastodon profiliai apie programavimą, atvirąjį kodą ir technologijas. Peržiūrėk įrašus ir pasirink, ką sekti.',
    heading: 'Technologijos ir atvirasis kodas Mastodon',
    listTitle: 'Technologijos ir atvirasis kodas',
    intro: [
      'Nedidelė pradžia tavo technologijų srautui lietuvių kalba: keturi profiliai apie programavimą, atvirąjį kodą ir skaitmeninius įrankius. Autoriai taip pat rašo angliškai ir kitomis temomis.',
      'Pirmiausia peržiūrėk viešus įrašus. Lietuviškos grotažymės gali būti tylios ar neturėti naujų įrašų: jos žymi naudingas temas, o ne žada kasdienį srautą. Bendroje #FOSS grotažymėje daug turinio anglų kalba.',
    ],
    faq: [
      {
        q: 'Ar reikia paskyros?',
        a: 'Viešus profilius ir peržiūrą gali skaityti be paskyros. Prisijunk per Mastodon, kad sektum profilius ir grotažymes arba sukurtum sąrašą.',
      },
      {
        q: 'Ar visi įrašai lietuviški ir tik apie technologijas?',
        a: 'Ne. Atranka paremta technologijų įrašais lietuvių kalba, tačiau autoriai rašo ir kitomis kalbomis bei temomis. Prieš sekdamas peržiūrėk srautą.',
      },
      {
        q: 'Kaip pasiūlyti profilį arba paprašyti pašalinti savąjį?',
        a: 'Rašyk @mawkingbird@mastodon.social. Tikriname temą, kalbą, naujausią veiklą ir profilio atrandamumo nustatymus. Pašalinimo prašymus vykdome.',
      },
    ],
  },

  lv: {
    title: 'Tehnoloģijas un atvērtais kods Mastodon: kam sekot',
    description:
      'Latviski par programmēšanu, atvērto kodu un digitālajiem rīkiem: septiņi Mastodon profili un tēmturi tavas plūsmas sākumam.',
    heading: 'Tehnoloģijas un atvērtais kods Mastodon',
    listTitle: 'Tehnoloģijas un atvērtais kods',
    intro: [
      'Programmēšana, serveri, digitālie rīki un atvērtais kods — septiņu profilu izlase lasītājiem, kuri vēlas par tehnoloģijām lasīt latviski. Te ir gan projektu veidotāji, gan cilvēki, kuri dalās ikdienas pieredzē. Daļa autoru raksta arī angliski un par citām tēmām.',
      'Vispirms apskati publisko plūsmu un izvēlies sev interesanto. Vietējie tēmturi #AtvērtaisKods un #Programmēšana pašlaik ir klusi; tie nenozīmē ikdienas ierakstu plūsmu. Kopīgajā #FOSS tēmturī ir arī daudz satura angliski.',
    ],
    faq: [
      {
        q: 'Vai vajadzīgs konts?',
        a: 'Publiskos profilus un priekšskatījumu vari apskatīt bez konta. Pieslēdzies ar Mastodon, lai sekotu atlasītajiem profiliem un tēmturiem vai izveidotu sarakstu.',
      },
      {
        q: 'Vai visi ieraksti būs latviski un tikai par tehnoloģijām?',
        a: 'Nē. Izlase balstīta uz autoru tehnoloģiju ierakstiem latviešu valodā, taču viņu plūsmās ir arī angļu valoda un citas tēmas. Tēmturu saturs ir publisks un mainīgs.',
      },
      {
        q: 'Kā pieteikt profilu vai izņemt savu?',
        a: 'Raksti @mawkingbird@mastodon.social. Pārbaudām tēmu, valodu, neseno aktivitāti un profila atrašanas atļaujas. Izņemšanas lūgumus ievērojam.',
      },
    ],
  },
};
