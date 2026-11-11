import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ClientPrefs } from '../client-prefs';
import { Drafts } from '../drafts';

/**
 * One post's text from what another app shared. Android often repeats the
 * link inside `text`, and the title inside `text` too; each piece appears once.
 */
export function sharedText(params: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}): string {
  const title = params.title?.trim() ?? '';
  const text = params.text?.trim() ?? '';
  const url = params.url?.trim() ?? '';
  const parts: string[] = [];
  if (title && !text.includes(title) && title !== url) parts.push(title);
  if (text) parts.push(text);
  if (url && !text.includes(url)) parts.push(url);
  return parts.join('\n\n');
}

/**
 * `/share`: the manifest's `share_target`. The system Share menu opens this
 * route with `title`, `text` and `url`; it parks them in an unsent draft and
 * sends the reader to Home's composer. Nothing is ever posted from here.
 */
@Component({
  selector: 'app-share-target',
  template: '',
})
export class ShareTarget implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly drafts = inject(Drafts);
  private readonly prefs = inject(ClientPrefs);

  ngOnInit(): void {
    const query = this.route.snapshot.queryParamMap;
    const text = sharedText({
      title: query.get('title'),
      text: query.get('text'),
      url: query.get('url'),
    });
    if (text) {
      this.drafts.handoff({
        segments: [text],
        spoilerText: '',
        sensitive: false,
        visibility: this.prefs.defaultVisibility(),
        poll: null,
      });
    }
    // Replace /share in history so Back does not re-run the share.
    void this.router.navigate(['/home'], { replaceUrl: true });
  }
}
