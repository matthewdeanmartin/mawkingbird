import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbRadioGroup, RadioOption } from '../../design-system/radio-group/radio-group';
import { MbSettingsRow } from '../../design-system/settings-row/settings-row';
import type { NativeProxyMode, NativeProxyStatus } from '../../platform/http/connector-types';
import { PLATFORM_NETWORK } from '../../platform/http/platform-http';

// i18n settings.network.title: 🌐 Network
// i18n settings.network.intro: How this app reaches the internet. Every connection it makes follows this setting.
// i18n settings.network.mode: Connection
// i18n settings.network.mode.direct: Direct (no proxy)
// i18n settings.network.mode.direct.hint: Connect straight to each server. This is the default.
// i18n settings.network.mode.windows: Use Windows proxy
// i18n settings.network.mode.windows.hint: Use the proxy set in Windows settings. Read when the app starts, or when you press Refresh.
// i18n settings.network.mode.http: Manual HTTP proxy
// i18n settings.network.mode.http.hint: An HTTP proxy that supports CONNECT, such as a company proxy.
// i18n settings.network.mode.socks5: Manual SOCKS5 proxy
// i18n settings.network.mode.socks5.hint: A SOCKS5 proxy, such as Tor. The proxy looks up server names, so they never reach your local resolver.
// i18n settings.network.host: Proxy host
// i18n settings.network.port: Port
// i18n settings.network.username: User name (optional)
// i18n settings.network.password: Password (optional)
// i18n settings.network.passwordHint: Stored in your computer's credential store, never in settings files.
// i18n settings.network.passwordSaved: A password is saved. Leave this empty to keep it.
// i18n settings.network.tor: Use Tor (127.0.0.1:9050)
// i18n settings.network.save: Save
// i18n settings.network.refresh: Refresh
// i18n settings.network.saved: Saved. New connections use this setting.
// i18n settings.network.direct: Connecting directly.
// i18n settings.network.using: Using {{address}}.
// i18n settings.network.usingWindows: Using {{address}} from Windows.
// i18n settings.network.windowsNone: Windows has no proxy set, so the app connects directly.
// i18n settings.network.pac: Windows uses an automatic proxy script, which isn't supported. Enter the proxy manually.
// i18n settings.network.failure: If the proxy can't be reached, connections fail. The app never falls back to connecting directly.
// i18n settings.network.error: Couldn't save: {{message}}

/**
 * Settings → Network (native only, parity item 5).
 *
 * The route and its menu entry exist only when {@link PLATFORM_NETWORK} is
 * provided, which is the native build; the web build never shows them.
 */
@Component({
  selector: 'app-settings-network',
  imports: [FormsModule, MbButton, MbControl, MbField, MbRadioGroup, MbSettingsRow, TranslocoPipe],
  template: `
    <div class="spage-head">
      <h1>{{ 'settings.network.title' | transloco }}</h1>
      <p>{{ 'settings.network.intro' | transloco }}</p>
    </div>
    <div class="spage-body">
      <div class="ssection">
        <mb-settings-row [heading]="'settings.network.mode' | transloco">
          <mb-radio-group
            [label]="'settings.network.mode' | transloco"
            [options]="modes()"
            [value]="mode()"
            (valueChange)="mode.set($any($event))"
          />
          @if (mode() === 'http' || mode() === 'socks5') {
            <div class="proxy-fields">
              <mb-field [label]="'settings.network.host' | transloco">
                <input
                  mbControl
                  type="text"
                  name="proxyHost"
                  autocapitalize="none"
                  spellcheck="false"
                  [ngModel]="host()"
                  (ngModelChange)="host.set($event)"
                />
              </mb-field>
              <mb-field [label]="'settings.network.port' | transloco">
                <input
                  mbControl
                  type="number"
                  name="proxyPort"
                  min="1"
                  max="65535"
                  [ngModel]="port()"
                  (ngModelChange)="port.set($event)"
                />
              </mb-field>
              <mb-field [label]="'settings.network.username' | transloco">
                <input
                  mbControl
                  type="text"
                  name="proxyUser"
                  autocomplete="off"
                  [ngModel]="username()"
                  (ngModelChange)="username.set($event)"
                />
              </mb-field>
              <mb-field
                [label]="'settings.network.password' | transloco"
                [hint]="
                  (status()?.settings?.has_credentials
                    ? 'settings.network.passwordSaved'
                    : 'settings.network.passwordHint'
                  ) | transloco
                "
              >
                <input
                  mbControl
                  type="password"
                  name="proxyPassword"
                  autocomplete="off"
                  [ngModel]="password()"
                  (ngModelChange)="password.set($event)"
                />
              </mb-field>
              @if (mode() === 'socks5') {
                <button mbButton type="button" variant="outline" size="small" (click)="useTor()">
                  {{ 'settings.network.tor' | transloco }}
                </button>
              }
            </div>
          }
          <div class="network-actions">
            <button mbButton type="button" [disabled]="busy()" (click)="save()">
              {{ 'settings.network.save' | transloco }}
            </button>
            @if (status()?.settings?.mode === 'windows') {
              <button
                mbButton
                type="button"
                variant="outline"
                [disabled]="busy()"
                (click)="refresh()"
              >
                {{ 'settings.network.refresh' | transloco }}
              </button>
            }
          </div>
          <p class="network-state" role="status">{{ stateLine() }}</p>
          @if (savedNote()) {
            <p class="hint" role="status">{{ 'settings.network.saved' | transloco }}</p>
          }
          @if (error(); as message) {
            <p class="error" role="alert">
              {{ 'settings.network.error' | transloco: { message } }}
            </p>
          }
          <p class="hint">{{ 'settings.network.failure' | transloco }}</p>
        </mb-settings-row>
      </div>
    </div>
  `,
  styles: `
    .proxy-fields {
      display: grid;
      gap: 0.75rem;
      margin-block: 0.75rem;
      max-width: 28rem;
    }
    .network-actions {
      display: flex;
      gap: 0.5rem;
      margin-block: 0.75rem;
    }
    .network-state {
      margin: 0.25rem 0;
    }
  `,
})
export class SettingsNetwork implements OnInit {
  private readonly network = inject(PLATFORM_NETWORK);
  private readonly i18n = inject(TranslocoService);

  protected readonly status = signal<NativeProxyStatus | null>(null);
  protected readonly mode = signal<NativeProxyMode>('direct');
  protected readonly host = signal('');
  protected readonly port = signal<number | null>(null);
  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly savedNote = signal(false);

  protected readonly modes = computed<RadioOption[]>(() => {
    const options: [NativeProxyMode, string][] = [
      ['direct', 'settings.network.mode.direct'],
      ['windows', 'settings.network.mode.windows'],
      ['http', 'settings.network.mode.http'],
      ['socks5', 'settings.network.mode.socks5'],
    ];
    return options
      .filter(([value]) => value !== 'windows' || this.status()?.windows_available)
      .map(([value, key]) => ({
        value,
        label: this.i18n.translate(key),
        hint: this.i18n.translate(`${key}.hint`),
      }));
  });

  /** What is actually in force, in a sentence. */
  protected readonly stateLine = computed(() => {
    const status = this.status();
    if (!status) return '';
    if (status.problem === 'pac') return this.i18n.translate('settings.network.pac');
    if (!status.in_use) {
      return this.i18n.translate(
        status.settings.mode === 'windows'
          ? 'settings.network.windowsNone'
          : 'settings.network.direct',
      );
    }
    return this.i18n.translate(
      status.settings.mode === 'windows'
        ? 'settings.network.usingWindows'
        : 'settings.network.using',
      { address: status.in_use },
    );
  });

  async ngOnInit(): Promise<void> {
    if (!this.network) return;
    this.adopt(await this.network.status());
  }

  private adopt(status: NativeProxyStatus): void {
    this.status.set(status);
    this.mode.set(status.settings.mode);
    this.host.set(status.settings.host);
    this.port.set(status.settings.port || null);
    this.password.set('');
  }

  protected useTor(): void {
    this.mode.set('socks5');
    this.host.set('127.0.0.1');
    this.port.set(9050);
  }

  protected async save(): Promise<void> {
    if (!this.network || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.savedNote.set(false);
    try {
      const manual = this.mode() === 'http' || this.mode() === 'socks5';
      this.adopt(
        await this.network.set({
          mode: this.mode(),
          ...(manual
            ? {
                host: this.host().trim(),
                port: Number(this.port()) || 0,
                username: this.username().trim() || undefined,
                password: this.password() || undefined,
              }
            : {}),
        }),
      );
      this.savedNote.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async refresh(): Promise<void> {
    if (!this.network || this.busy()) return;
    this.busy.set(true);
    try {
      this.adopt(await this.network.refresh());
    } finally {
      this.busy.set(false);
    }
  }
}
