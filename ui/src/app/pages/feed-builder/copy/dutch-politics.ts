import { PageLanguage } from '../../../focused-tools';
import { TopicCopy } from './topic-copy';

export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  nl: {
    title: 'Nederlandse politiek op Mastodon: nieuws, beleid en democratie',
    description:
      'Volg Nederlandse politiek op Mastodon: journalistiek, beleid, lokale democratie en publieke instellingen. Kies accounts en bekijk eerst hun berichten.',
    heading: 'Nederlandse politiek op Mastodon',
    listTitle: 'Nederlandse politiek',
    intro: [
      'Wat besluit de Tweede Kamer, hoe werkt de rechtsstaat en wat speelt er in de provincie? Ontdek Nederlandstalige journalistiek, beleidsuitleg en lokale democratie. De selectie bevat stemmen links van het midden, in het midden en rechts van het midden, met een stevige basis van journalistiek en publieke instellingen.',
      'Overheidsaccounts geven informatie vanuit hun eigen rol; dat is geen onafhankelijke journalistiek. Kies zelf welke bronnen je wilt volgen. Hashtags zijn open stromen en volgen niet de inhoudelijke selectie van deze accounts. Laat ze uitgevinkt als je alleen de geselecteerde bronnen wilt lezen.',
    ],
    faq: [
      {
        q: 'Heb ik een account nodig?',
        a: 'Niet om profielen en openbare berichten te bekijken. Log in met Mastodon om accounts en hashtags te volgen of een lijst te maken.',
      },
      {
        q: 'Welke politieke inhoud staat centraal?',
        a: 'Politiek van Nederland en constructieve democratische betrokkenheid. Extremistische, racistische, seksistische of antisemitische propaganda, anti-immigratiepropaganda en voortdurende verontwaardiging passen niet in deze selectie. Accounts die vooral over het Israëlisch-Palestijnse conflict schrijven vallen buiten dit onderwerp. Berichtgeving over een partij is geen steunbetuiging. De selectie is een momentopname, geen garantie over toekomstige berichten of een gelijke verdeling van politieke opvattingen.',
      },
      {
        q: 'Hoe actief zijn de hashtags?',
        a: '#TweedeKamer bevat veel geautomatiseerde stemmingsverslagen: één account leverde ongeveer 82% van de berichten in onze steekproef. #Gemeenteraad en #RaadvanState zijn rustiger, met gemiddeld minder dan één bericht per dag in de gemeten twee weken. Bij beide kwam ongeveer 60% van de berichten van één account. Bekijk de inhoud voordat je een tag volgt.',
      },
      {
        q: 'Hoe kom ik op de lijst of laat ik mijn account verwijderen?',
        a: 'Deze selectie is voor gevestigde publieke stemmen en organisaties met recente, relevante berichten. Kleine persoonlijke accounts blijven uit respect voor hun privacy buiten deze politieke selectie. We respecteren privacykeuzes en verzoeken om verwijdering. Neem contact op met @mawkingbird@mastodon.social.',
      },
    ],
  },
};
