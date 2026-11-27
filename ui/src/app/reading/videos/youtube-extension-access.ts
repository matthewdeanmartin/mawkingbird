import { ChangeDetectionStrategy, Component, inject, OnInit, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { ExtensionBridge, YOUTUBE_SITE } from '../../platform/extension/extension-bridge';

// i18n videos.extensionAccess.lead: Mawkingbird for Firefox can search YouTube, show whole channels, video details and comments, from this computer, with no Plus needed.
// i18n videos.extensionAccess.allow: Let Mawkingbird for Firefox read YouTube
// i18n videos.extensionAccess.declined: Not allowed. You can allow YouTube later in the add-on's settings.

/**
 * One permission for every YouTube feature Mawkingbird for Firefox carries
 * (spec/firefox-extension.md, sprint 8). Renders nothing without the extension,
 * or once YouTube is allowed. `allowed` fires after the reader allows it, so the
 * host can load what it couldn't before.
 */
@Component({
  selector: 'app-youtube-extension-access',
  imports: [MbButton, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (needed()) {
      <div class="yt-access" role="note">
        <p>{{ 'videos.extensionAccess.lead' | transloco }}</p>
        <button mbButton size="small" type="button" [disabled]="asking()" (click)="allow()">
          {{ 'videos.extensionAccess.allow' | transloco }}
        </button>
        @if (declined()) {
          <p class="muted small" role="status">
            {{ 'videos.extensionAccess.declined' | transloco }}
          </p>
        }
      </div>
    }
  `,
  styles: `
    .yt-access {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      margin: 8px 16px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .yt-access p {
      margin: 0;
      flex: 1 1 18rem;
    }
  `,
})
export class YoutubeExtensionAccess implements OnInit {
  private readonly bridge = inject(ExtensionBridge);

  readonly allowed = output<void>();

  protected readonly needed = signal(false);
  protected readonly asking = signal(false);
  protected readonly declined = signal(false);

  async ngOnInit(): Promise<void> {
    if (!this.bridge.present()) return;
    this.needed.set(!(await this.bridge.hasAccess(YOUTUBE_SITE)));
  }

  protected async allow(): Promise<void> {
    this.asking.set(true);
    try {
      const granted = await this.bridge.requestAccess(YOUTUBE_SITE);
      this.declined.set(!granted);
      if (granted) {
        this.needed.set(false);
        this.allowed.emit();
      }
    } finally {
      this.asking.set(false);
    }
  }
}
