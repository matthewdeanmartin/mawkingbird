import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { LanguageVersions } from '../focused-apps/language-versions';
import {
  ENGLISH_TOOLS,
  FOCUSED_TOOL_GROUPS,
  FocusedTool,
  FocusedToolGroup,
} from '../../focused-tools';

/**
 * /tools: every focused tool page, grouped, from the same registry that routes
 * and prerenders them, so a new tool appears here without touching this page.
 * Public and prerendered, like /features; it links to each tool's public URL.
 */
@Component({
  selector: 'app-tools-index',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions],
  templateUrl: './tools-index.html',
  styleUrls: ['../focused-apps/focused-page.css', './tools-index.css'],
})
export class ToolsIndex {
  protected readonly groups = FOCUSED_TOOL_GROUPS.map((group) => ({
    ...group,
    tools: ENGLISH_TOOLS.filter((tool: FocusedTool) => tool.group === group.id),
  })).filter((group) => group.tools.length);
}

/**
 * One language's pages, grouped like /tools, under that language's headings.
 * The route resolves them (`toolsResolver`), so their words load with the
 * index rather than with the app.
 */
function groupsIn(titles: Record<FocusedToolGroup, string>) {
  const tools: FocusedTool[] = inject(ActivatedRoute).snapshot.data['tools'] ?? [];
  return FOCUSED_TOOL_GROUPS.map((group) => ({
    ...group,
    title: titles[group.id],
    tools: tools.filter((tool) => tool.group === group.id),
  })).filter((group) => group.tools.length);
}

/**
 * /de/: the German pages, grouped like /tools, in German. Every German entry
 * in focused-tools.json appears here and nowhere else in an index.
 */
@Component({
  selector: 'app-tools-index-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions],
  templateUrl: './tools-index.de.html',
  styleUrls: ['../focused-apps/focused-page.css', './tools-index.css'],
})
export class ToolsIndexDe extends ToolsIndex {
  protected override readonly groups = groupsIn({
    start: 'Auf Mastodon starten',
    languages: 'Deine Sprachen',
    search: 'Suche',
    people: 'Deine Leute finden',
    post: 'Posten',
    account: 'Dein Konto pflegen',
  });
}

/** /ja/: the Japanese pages, the same way. */
@Component({
  selector: 'app-tools-index-ja',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions],
  templateUrl: './tools-index.ja.html',
  styleUrls: ['../focused-apps/focused-page.css', './tools-index.css'],
})
export class ToolsIndexJa extends ToolsIndex {
  protected override readonly groups = groupsIn({
    start: 'Mastodon をはじめる',
    languages: '言語の設定',
    search: '検索',
    people: '知り合いを見つける',
    post: '投稿',
    account: 'アカウントの整理',
  });
}

/** /fr/: the French pages, the same way. */
@Component({
  selector: 'app-tools-index-fr',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions],
  templateUrl: './tools-index.fr.html',
  styleUrls: ['../focused-apps/focused-page.css', './tools-index.css'],
})
export class ToolsIndexFr extends ToolsIndex {
  protected override readonly groups = groupsIn({
    start: 'Débuter sur Mastodon',
    languages: 'Tes langues',
    search: 'Recherche',
    people: 'Retrouver tes contacts',
    post: 'Publier',
    account: 'Entretenir ton compte',
  });
}

/** /es/: the Spanish pages, the same way. */
@Component({
  selector: 'app-tools-index-es',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions],
  templateUrl: './tools-index.es.html',
  styleUrls: ['../focused-apps/focused-page.css', './tools-index.css'],
})
export class ToolsIndexEs extends ToolsIndex {
  protected override readonly groups = groupsIn({
    start: 'Empezar en Mastodon',
    languages: 'Tus idiomas',
    search: 'Búsqueda',
    people: 'Encontrar a tu gente',
    post: 'Publicar',
    account: 'Cuidar tu cuenta',
  });
}

/** /zh-hant/: the Traditional Chinese pages, the same way. */
@Component({
  selector: 'app-tools-index-zh-hant',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions],
  templateUrl: './tools-index.zh-hant.html',
  styleUrls: ['../focused-apps/focused-page.css', './tools-index.css'],
})
export class ToolsIndexZhHant extends ToolsIndex {
  protected override readonly groups = groupsIn({
    start: '開始使用 Mastodon',
    languages: '您的語言',
    search: '搜尋',
    people: '找到您認識的人',
    post: '發嘟',
    account: '整理您的帳號',
  });
}

/** /ko/: the Korean pages, the same way. */
@Component({
  selector: 'app-tools-index-ko',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions],
  templateUrl: './tools-index.ko.html',
  styleUrls: ['../focused-apps/focused-page.css', './tools-index.css'],
})
export class ToolsIndexKo extends ToolsIndex {
  protected override readonly groups = groupsIn({
    start: 'Mastodon 시작하기',
    languages: '언어 설정',
    search: '검색',
    people: '아는 사람 찾기',
    post: '게시하기',
    account: '계정 정리',
  });
}

/** /pt/: the Portuguese (Brazil) pages, the same way. */
@Component({
  selector: 'app-tools-index-pt',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions],
  templateUrl: './tools-index.pt.html',
  styleUrls: ['../focused-apps/focused-page.css', './tools-index.css'],
})
export class ToolsIndexPt extends ToolsIndex {
  protected override readonly groups = groupsIn({
    start: 'Comece no Mastodon',
    languages: 'Seus idiomas',
    search: 'Busca',
    people: 'Encontre sua turma',
    post: 'Publicar',
    account: 'Cuide da sua conta',
  });
}

/** /it/: the Italian pages, the same way. */
@Component({
  selector: 'app-tools-index-it',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions],
  templateUrl: './tools-index.it.html',
  styleUrls: ['../focused-apps/focused-page.css', './tools-index.css'],
})
export class ToolsIndexIt extends ToolsIndex {
  protected override readonly groups = groupsIn({
    start: 'Inizia su Mastodon',
    languages: 'Le tue lingue',
    search: 'Ricerca',
    people: 'Ritrova la tua gente',
    post: 'Pubblicare',
    account: 'Cura il tuo account',
  });
}
