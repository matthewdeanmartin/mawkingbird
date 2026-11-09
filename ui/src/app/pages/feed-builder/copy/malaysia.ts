import { PageLanguage } from '../../../focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  ms: {
    title: 'Malaysia di Mastodon: akaun dan komuniti untuk diikuti',
    description:
      'Temui suara dari Malaysia di Mastodon: kehidupan harian, seni, teknologi, permainan dan berita dalam bahasa Melayu, Inggeris atau campuran.',
    heading: 'Malaysia di Mastodon',
    listTitle: 'Malaysia',
    intro: [
      'Kenali sudut kecil Malaysia di Mastodon: kehidupan harian, seni, teknologi, permainan meja, pengangkutan dan berita. Akaun ini menunjukkan kaitan setempat dengan Malaysia melalui profil atau siaran awam mereka.',
      'Senarai ini menggabungkan siaran bahasa Melayu, bahasa Inggeris dan campuran bahasa. Ada akaun yang jarang menulis, dan beberapa suapan berita tidak rasmi. Pratonton dahulu dan pilih yang anda suka; anda tidak perlu mengikuti semuanya.',
    ],
    faq: [
      {
        q: 'Adakah saya perlukan akaun?',
        a: 'Tidak untuk membaca profil dan pratonton siaran awam. Log masuk dengan Mastodon untuk mengikuti akaun atau menyimpannya dalam senarai.',
      },
      {
        q: 'Adakah semua siaran dalam bahasa Melayu?',
        a: 'Tidak. Ini senarai serantau Malaysia, bukan senarai bahasa sahaja. Siaran bahasa Inggeris dan campuran turut disertakan. Beberapa akaun permainan berkongsi komuniti yang sama, jadi pilih mengikut minat anda.',
      },
      {
        q: 'Bagaimana saya boleh menyertai atau keluar daripada senarai ini?',
        a: 'Hubungi @mawkingbird@mastodon.social. Akaun kecil juga dialu-alukan jika ada kaitan setempat dengan Malaysia dan kandungan yang sesuai untuk keluarga. Permintaan untuk dikeluarkan akan dihormati.',
      },
    ],
  },
};
