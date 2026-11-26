import { PageLanguage } from '../../../public-pages/focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  es: {
    title: 'Narrativa literaria en Mastodon: a quién seguir',
    description:
      'Encuentra lectores, autores y conversaciones sobre narrativa literaria en Mastodon. Explora perfiles y etiquetas antes de crear una cuenta.',
    heading: 'Narrativa literaria en Mastodon',
    listTitle: 'Narrativa literaria',
    intro: [
      'Descubre novelas, relatos y conversaciones sobre cómo se cuentan las historias. Aquí encontrarás lectores y autores que comparten lecturas, fragmentos y reflexiones sobre personajes, lenguaje y creación literaria.',
      'Explora los perfiles y las etiquetas antes de seguirlos. Las cuentas también pueden hablar de otros temas; sus publicaciones te ayudarán a elegir las voces que quieres leer.',
    ],
    faq: [
      {
        q: '¿Necesito una cuenta para leer?',
        a: 'No. Puedes consultar esta página y las publicaciones públicas sin cuenta. Para seguir perfiles o etiquetas, inicia sesión con una cuenta de Mastodon.',
      },
      {
        q: '¿Qué se entiende aquí por narrativa literaria?',
        a: 'Novelas y relatos que dan lugar a conversaciones sobre el lenguaje, los personajes, la forma de narrar o la mirada sobre la sociedad. También caben obras que cruzan géneros cuando se comentan esas cualidades.',
      },
      {
        q: '¿Cómo puedo aparecer en esta lista?',
        a: 'Comparte publicaciones sobre narrativa literaria y usa etiquetas relacionadas. Los perfiles deben cumplir los criterios de actividad e inclusión del catálogo; usar una etiqueta no garantiza aparecer.',
      },
    ],
  },
  en: {
    title: 'Literary fiction on Mastodon: people and hashtags to follow',
    description:
      'Discover literary novels, short stories, readers and writers on Mastodon. Choose people and hashtags, then preview your literary fiction feed.',
    heading: 'Literary fiction on Mastodon',
    listTitle: 'Literary fiction',
    intro: [
      'Find novels and short stories that stay with you, and people to discuss them with. Explore literary fiction through reading recommendations, reviews, close reading and writers sharing their work, including translated fiction and experimental prose.',
      'Choose people and hashtags, then preview their posts before following. Useful subject tags remain available even when quiet. Accounts are selected for recurring literary-fiction content and substantive writing updates, not just a word in a profile.',
    ],
    faq: [
      {
        q: 'Do I need an account?',
        a: 'Browse and preview public posts without an account. Sign in with your Mastodon account to follow your selection or create a list.',
      },
      {
        q: 'What belongs in this community?',
        a: 'Literary novels and short fiction, from contemporary realism and translated literature to experimental prose and magical realism. Reading, reviewing, editing, translating and writing fiction all count. Genre boundaries can overlap; recurring discussion of literary fiction matters more than a label. Poetry, nonfiction or general writing advice alone do not qualify. Hashtags are open conversations, so preview their posts before choosing.',
      },
      {
        q: 'How do I get onto this list?',
        a: 'Share literary-fiction content regularly and allow your server to suggest your profile. Substantive updates about your own fiction count too; a bio keyword alone does not. For help or removal, contact @mawkingbird@mastodon.social.',
      },
    ],
  },
};
