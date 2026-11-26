import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-og-preview',
  templateUrl: './og-preview.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './og-preview.css',
})
export class OgPreview {
  protected readonly cards = [
    { file: 'default', label: 'Default', use: 'Home and fallback preview' },
    { file: 'tools', label: 'Tools', use: 'Free tools and tool pages' },
    { file: 'communities', label: 'Communities', use: 'Community pages and hubs' },
    { file: 'follow', label: 'Follow', use: 'Who to follow' },
    { file: 'audience', label: 'Audience', use: 'Reader and audience pages' },
    { file: 'help', label: 'Help', use: 'Help guides' },
    { file: 'news', label: 'News', use: 'News posts' },
    { file: 'invite', label: 'Invite', use: 'Reserved for invitation links' },
    { file: 'share', label: 'Share', use: 'Reserved for shared-post links' },
  ] as const;
}
