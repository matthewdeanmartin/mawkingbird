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

/** The /de/ headings, in the same order as FOCUSED_TOOL_GROUPS. */
const GERMAN_GROUP_TITLES: Record<FocusedToolGroup, string> = {
  start: 'Auf Mastodon starten',
  languages: 'Deine Sprachen',
  search: 'Suche',
  people: 'Deine Leute finden',
  post: 'Posten',
  account: 'Dein Konto pflegen',
};

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
  protected override readonly groups = FOCUSED_TOOL_GROUPS.map((group) => ({
    ...group,
    title: GERMAN_GROUP_TITLES[group.id],
    tools: FOCUSED_TOOLS.filter(
      (tool: FocusedTool) => toolLanguage(tool) === 'de' && tool.group === group.id,
    ),
  })).filter((group) => group.tools.length);
}
