import { describe, expect, it } from 'vitest';
import { Account, Status } from '../../platform/api/models';
import {
  accountHost,
  classifyAccount,
  classifyAuthors,
  classifyResult,
  classifyStatus,
  isAdultServer,
} from './adult-classifier';
import { IN_PROGRESS_LOCALES, PRODUCTION_LOCALES } from '../../i18n/locale';
import {
  classifyContentWarning,
  postTextMarker,
  selfDeclaredMarker,
  SEX_WORK_PHRASES,
  SEX_WORK_PHRASES_CJK,
} from './adult-lexicon';

function account(over: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    username: 'user',
    acct: 'user@example.social',
    display_name: 'User',
    note: '',
    url: '',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
    ...over,
  };
}

let nextId = 0;
function status(over: Partial<Status> = {}): Status {
  return {
    id: `s${++nextId}`,
    created_at: '2026-11-01T00:00:00Z',
    content: '<p>hello</p>',
    spoiler_text: '',
    sensitive: false,
    visibility: 'public',
    media_attachments: [],
    account: account(),
    reblog: null,
    ...over,
  } as Status;
}

describe('adult lexicon', () => {
  it('reads self-declarations in many forms', () => {
    for (const bio of [
      '18+ only, MDNI',
      '🔞 art',
      'artist | R18 | commissions',
      'minors do not interact',
      'Links: onlyfans.com/someone',
      'open BO area Jakarta',
      'Ready VCS, DM',
    ]) {
      expect(selfDeclaredMarker(bio), bio).not.toBeNull();
    }
  });

  it('has sex-work phrases for every language the app is translated into', () => {
    const covered = new Set([
      ...Object.keys(SEX_WORK_PHRASES),
      ...Object.keys(SEX_WORK_PHRASES_CJK),
    ]);
    for (const locale of [...PRODUCTION_LOCALES, ...IN_PROGRESS_LOCALES]) {
      expect(covered.has(locale.split('-')[0]), locale).toBe(true);
    }
  });

  it('matches advertising in each language, and in CJK text without spaces', () => {
    for (const ad of [
      'Escort service, incall and outcall',
      'Diskrete Erotikmassage in Berlin',
      'Massage érotique sur rendez-vous',
      'Masajes eróticos a domicilio',
      'Garota de programa em SP',
      'Massaggi erotici a Milano',
      'Erotische massage aan huis',
      'Erotisk massage i Stockholm',
      'Masaj erotic la domiciliu',
      'Diskret eskortservice i København',
      'Ερωτικό μασάζ κατόπιν ραντεβού',
      'Agencja towarzyska Warszawa',
      'Интим услуги, звоните',
      'Еротичний масаж у Києві',
      'Escort bayan İstanbul',
      'Gadis panggilan KL',
      'Dịch vụ tình dục giá rẻ',
      'कॉल गर्ल उपलब्ध',
      '今夜パパ活できる人',
      '台北外送茶line',
      '서울조건만남',
    ]) {
      expect(postTextMarker(ad), ad).not.toBeNull();
    }
  });

  it('leaves ordinary posts in those languages alone', () => {
    for (const text of [
      'Licensed massage therapist, booking open',
      'Vendo bicicleta usada',
      'Sponsoring für unseren Verein',
      'Massaggio sportivo dopo la corsa',
      'Masaj sportiv după alergare',
      'Sportsmassage efter løbeturen',
      'Αθλητικό μασάζ μετά το τρέξιμο',
      'Ich gehe heute ins Theater',
      '今日はパパと公園に行った',
      '我们周末一起吃饭',
    ]) {
      expect(postTextMarker(text), text).toBeNull();
    }
  });

  it('reads "minors, keep out" however it is phrased', () => {
    for (const bio of [
      'minors do not interact',
      'Minors DNI',
      'no minors pls',
      'under 18s, please don’t follow',
      'Under-18 accounts: not welcome',
      'kids: go away',
      'Minors are not welcome here',
      'teens please do not interact',
    ]) {
      expect(selfDeclaredMarker(bio), bio).not.toBeNull();
    }
    for (const bio of ['Dad of two, no kids stuff here', 'I teach kids to code', 'minors league']) {
      expect(selfDeclaredMarker(bio), bio).toBeNull();
    }
  });

  it('does not read ordinary profiles as adult', () => {
    for (const bio of [
      'Born 2018+ projects',
      'Tech lead at BO Corp',
      'git, svn and other VCS nerd',
      'Saya suka ayam goreng',
      'Speaks Bahasa Melayu and English',
      'Spicy food reviews',
      'Essex, UK',
    ]) {
      expect(selfDeclaredMarker(bio), bio).toBeNull();
    }
  });

  it('tells sexual content warnings from every other kind', () => {
    expect(classifyContentWarning('lewd').kind).toBe('sexual');
    expect(classifyContentWarning('NSFW, nudity').kind).toBe('sexual');
    expect(classifyContentWarning('🔞').kind).toBe('sexual');
    expect(classifyContentWarning('food').kind).toBe('other');
    expect(classifyContentWarning('uspol').kind).toBe('other');
    expect(classifyContentWarning('spoilers for the finale').kind).toBe('other');
    expect(classifyContentWarning('nsfw language').kind).toBe('other');
    expect(classifyContentWarning('sexual assault mention').kind).toBe('other');
    expect(classifyContentWarning('sex ed, STI').kind).toBe('other');
    expect(classifyContentWarning('  ').kind).toBe('none');
  });

  it('only flags post text on sex-work phrases and adult-platform links', () => {
    expect(postTextMarker('open bo malam ini, chat ya')).toBe('open bo');
    expect(postTextMarker('new set up at https://onlyfans.com/x')).not.toBeNull();
    expect(postTextMarker('we talked about sex education at school')).toBeNull();
  });
});

describe('classifyStatus', () => {
  it('never treats a food content warning as adult', () => {
    const verdict = classifyStatus(status({ spoiler_text: 'food', sensitive: true }));
    expect(verdict).toEqual({ adult: false, reasons: [], weak: [] });
  });

  it('marks a sexual CW, a sexual hashtag or sex-work text as adult, saying which', () => {
    expect(classifyStatus(status({ spoiler_text: 'lewd', sensitive: true })).reasons).toEqual([
      { kind: 'cw', evidence: 'lewd' },
    ]);
    expect(classifyStatus(status({ tags: [{ name: 'NSFW', url: '' }] })).reasons[0]).toEqual({
      kind: 'hashtag',
      evidence: '#NSFW',
    });
    expect(classifyStatus(status({ content: '<p>Open BO area Medan</p>' })).reasons[0]).toEqual({
      kind: 'text',
      evidence: 'Open BO',
    });
  });

  it('keeps sensitive media without any CW as weak evidence only', () => {
    const verdict = classifyStatus(status({ sensitive: true }));
    expect(verdict.adult).toBe(false);
    expect(verdict.weak).toEqual([{ kind: 'sensitive', evidence: '' }]);
  });

  it('reads Bluesky labels, telling self-labels from moderation services', () => {
    const author = account({ id: 'bsky:did:plc:me' });
    const self = classifyStatus(
      status({
        provider: 'bluesky',
        account: author,
        providerRef: { labels: [{ val: 'porn', src: 'did:plc:me' }] } as never,
      }),
    );
    expect(self.reasons).toEqual([{ kind: 'bsky-self-label', evidence: 'porn' }]);
    const labeler = classifyStatus(
      status({
        provider: 'bluesky',
        account: author,
        providerRef: { labels: [{ val: 'nudity', src: 'did:plc:mod' }] } as never,
      }),
    );
    expect(labeler.reasons).toEqual([{ kind: 'bsky-labeler', evidence: 'nudity' }]);
    const gore = classifyStatus(
      status({
        provider: 'bluesky',
        account: author,
        providerRef: { labels: [{ val: 'graphic-media' }] } as never,
      }),
    );
    expect(gore.adult).toBe(false);
    const withdrawn = classifyStatus(
      status({
        provider: 'bluesky',
        account: author,
        providerRef: { labels: [{ val: 'porn', neg: true }] } as never,
      }),
    );
    expect(withdrawn.adult).toBe(false);
  });

  it('classifies the boosted post, not the boost wrapper', () => {
    const inner = status({ spoiler_text: 'nsfw' });
    expect(classifyStatus(status({ reblog: inner })).adult).toBe(true);
  });
});

describe('classifyAccount', () => {
  it('trusts a self-declared bio', () => {
    const verdict = classifyAccount(account({ note: '<p>18+ MDNI</p>' }));
    expect(verdict.adult).toBe(true);
    expect(verdict.reasons[0]).toEqual({ kind: 'declared', evidence: '18+' });
  });

  it('reads an Indonesian sex-work bio', () => {
    const verdict = classifyAccount(account({ note: '<p>Open BO area Jakarta, fast respon</p>' }));
    expect(verdict.adult).toBe(true);
  });

  it('reads profile fields too', () => {
    const verdict = classifyAccount(
      account({ fields: [{ name: 'Links', value: '<a>fansly.com/me</a>', verified_at: null }] }),
    );
    expect(verdict.adult).toBe(true);
  });

  it('needs two adult posts and a third of what loaded before posts decide', () => {
    const a = account();
    const lewd = () => status({ account: a, spoiler_text: 'lewd' });
    const plain = () => status({ account: a });

    const one = classifyAccount(a, [lewd(), plain(), plain()]);
    expect(one.adult).toBe(false);
    expect(one.weak).toEqual([{ kind: 'posts', evidence: '', count: 1, of: 3 }]);

    const twoOfThree = classifyAccount(a, [lewd(), lewd(), plain()]);
    expect(twoOfThree.adult).toBe(true);
    expect(twoOfThree.reasons).toEqual([{ kind: 'posts', evidence: '', count: 2, of: 3 }]);

    const twoOfTen = classifyAccount(a, [lewd(), lewd(), ...Array.from({ length: 8 }, plain)]);
    expect(twoOfTen.adult).toBe(false);
  });

  it('ignores other people’s posts in the list', () => {
    const a = account();
    const b = account({ id: 'b2' });
    const verdict = classifyAccount(a, [
      status({ account: b, spoiler_text: 'nsfw' }),
      status({ account: b, spoiler_text: 'nsfw' }),
    ]);
    expect(verdict.adult).toBe(false);
  });

  it('uses Bluesky author labels from loaded posts, once each', () => {
    const a = account({ id: 'bsky:did:plc:me' });
    const post = () =>
      status({
        provider: 'bluesky',
        account: a,
        providerRef: { authorLabels: [{ val: 'sexual', src: 'did:plc:me' }] } as never,
      });
    expect(classifyAccount(a, [post(), post()]).reasons).toEqual([
      { kind: 'bsky-self-label', evidence: 'sexual' },
    ]);
  });

  it('uses the reviewed adult-server list', () => {
    const list = new Set(['adults.example']);
    const verdict = classifyAccount(account({ acct: 'x@Adults.example' }), [], list);
    expect(verdict.reasons).toEqual([{ kind: 'server', evidence: 'adults.example' }]);
    expect(accountHost(account({ acct: 'local' }))).toBe('');
    expect(isAdultServer('', list)).toBe(false);
    // The shipped list starts empty: nothing is adult by server alone.
    expect(isAdultServer('adults.example')).toBe(false);
  });

  it('gives an ordinary Malay speaker no adult evidence at all', () => {
    const a = account({ note: '<p>Cikgu di Johor. Suka baca buku.</p>' });
    const posts = [
      status({ account: a, content: '<p>Selamat pagi semua</p>', language: 'ms' }),
      status({ account: a, spoiler_text: 'makanan', sensitive: true, language: 'ms' }),
    ];
    expect(classifyAccount(a, posts)).toEqual({ adult: false, reasons: [], weak: [] });
  });
});

describe('classifyResult and classifyAuthors', () => {
  it('flags an un-CW’d post by an adult author, with the author’s reasons', () => {
    const a = account({ note: '18+' });
    const plain = status({ account: a });
    const authors = classifyAuthors([plain]);
    const verdict = classifyResult(plain, authors.get(a.id));
    expect(verdict.adult).toBe(true);
    expect(verdict.reasons[0].kind).toBe('declared');
  });

  it('does not taint a person’s other posts because of one CW’d post', () => {
    const a = account();
    const lewd = status({ account: a, spoiler_text: 'lewd' });
    const plain = status({ account: a });
    const authors = classifyAuthors([lewd, plain]);
    expect(classifyResult(plain, authors.get(a.id)).adult).toBe(false);
    expect(classifyResult(lewd, authors.get(a.id)).adult).toBe(true);
  });
});
