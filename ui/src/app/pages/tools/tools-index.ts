import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import {
  ENGLISH_TOOLS,
  FOCUSED_TOOL_GROUPS,
  FOCUSED_TOOLS,
  FocusedTool,
  FocusedToolGroup,
  PageLanguage,
  toolLanguage,
} from '../../focused-tools';

/**
 * /tools: every focused tool page, grouped, from the same registry that routes
 * and prerenders them, so a new tool appears here without touching this page.
 * Public and prerendered, like /features; it links to each tool's public URL.
 */
@Component({
  selector: 'app-tools-index',
  imports: [RouterLink, MbButton, MbContentLink],
  templateUrl: './tools-index.html',
  styleUrls: ['../focused-apps/focused-page.css', './tools-index.css'],
})
export class ToolsIndex {
  protected readonly groups = FOCUSED_TOOL_GROUPS.map((group) => ({
    ...group,
    tools: ENGLISH_TOOLS.filter((tool: FocusedTool) => tool.group === group.id),
  })).filter((group) => group.tools.length);
}

/** One language's pages, grouped like /tools, under that language's headings. */
function groupsIn(lang: PageLanguage, titles: Record<FocusedToolGroup, string>) {
  return FOCUSED_TOOL_GROUPS.map((group) => ({
    ...group,
    title: titles[group.id],
    tools: FOCUSED_TOOLS.filter(
      (tool: FocusedTool) => toolLanguage(tool) === lang && tool.group === group.id,
    ),
  })).filter((group) => group.tools.length);
}

/**
 * /de/: the German pages, grouped like /tools, in German. Every German entry
 * in focused-tools.json appears here and nowhere else in an index.
 */
@Component({
  selector: 'app-tools-index-de',
  imports: [RouterLink, MbButton, MbContentLink],
  templateUrl: './tools-index.de.html',
  styleUrls: ['../focused-apps/focused-page.css', './tools-index.css'],
})
export class ToolsIndexDe extends ToolsIndex {
  protected override readonly groups = groupsIn('de', {
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
  imports: [RouterLink, MbButton, MbContentLink],
  templateUrl: './tools-index.ja.html',
  styleUrls: ['../focused-apps/focused-page.css', './tools-index.css'],
})
export class ToolsIndexJa extends ToolsIndex {
  protected override readonly groups = groupsIn('ja', {
    start: 'Mastodon をはじめる',
    languages: '言語の設定',
    search: '検索',
    people: '知り合いを見つける',
    post: '投稿',
    account: 'アカウントの整理',
  });
}
