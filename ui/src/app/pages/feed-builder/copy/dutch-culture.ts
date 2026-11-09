import { PageLanguage } from '../../../focused-tools';
import { TopicCopy } from './topic-copy';
export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  nl: {
    title: 'Nederlandstalige cultuur op Mastodon: wie en wat te volgen',
    description:
      'Ontdek boeken, muziek, kunst, fotografie en erfgoed op Mastodon. Volg Nederlandstalige makers, culturele organisaties en liefhebbers.',
    heading: 'Nederlandstalige cultuur op Mastodon',
    listTitle: 'Cultuur',
    intro: [
      'Boeken en poëzie, muziek, kunst, fotografie, film en erfgoed: ontdek makers, culturele organisaties en liefhebbers die in het Nederlands delen wat hen bezighoudt. Nederlandstalige stemmen uit Vlaanderen en daarbuiten horen er ook bij.',
      'Bekijk eerst de openbare berichten en kies wat bij je past. #Boeken en #Poezie hadden recente berichten in onze steekproef. #Boekentips en #Muziektip zijn optionele, rustige tags: in de gemeten veertien dagen vonden we daar geen berichten. Je kunt ze alvast volgen, maar verwacht geen drukke tijdlijn.',
    ],
    faq: [
      {
        q: 'Heb ik een account nodig?',
        a: 'Niet om profielen en openbare berichten te bekijken. Log in met Mastodon om accounts en hashtags te volgen of een lijst te maken.',
      },
      {
        q: 'Gaat dit alleen over cultuur uit Nederland?',
        a: 'Nee. Dit is een Nederlandstalige selectie, geen geografische grens. Ook Vlaamse makers en mensen elders zijn welkom; sommige accounts schrijven daarnaast in andere talen.',
      },
      {
        q: 'Hoe kom ik op de lijst of laat ik mijn account verwijderen?',
        a: 'Neem contact op met @mawkingbird@mastodon.social. Ook kleine culturele accounts die gevonden willen worden zijn welkom. We respecteren verwijderverzoeken.',
      },
    ],
  },
};
