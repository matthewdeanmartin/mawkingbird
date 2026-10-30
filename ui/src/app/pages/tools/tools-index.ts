import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { FOCUSED_TOOL_GROUPS, FOCUSED_TOOLS, FocusedTool } from '../../focused-tools';

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
    tools: FOCUSED_TOOLS.filter((tool: FocusedTool) => tool.group === group.id),
  })).filter((group) => group.tools.length);
}
