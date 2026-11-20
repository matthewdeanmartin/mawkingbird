import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../../design-system/button/button';
import { MbCheckbox } from '../../../design-system/checkbox/checkbox';
import { MbControl, MbField } from '../../../design-system/field/field';
import { MbSettingsRow } from '../../../design-system/settings-row/settings-row';
import { LOCAL_AI_PRESETS, LocalAi } from '../../../connections/local-ai/local-ai';

// i18n settings.connections.localAi.title: 💻 Local AI
// i18n settings.connections.localAi.intro: Connect an AI model through a local address you choose, such as Ollama, LM Studio or a llama.cpp server. Mawkingbird sends AI requests to that address. The model and any data it sends onward are outside Mawkingbird's control.
// i18n settings.connections.localAi.runsHere: Local model connection
// i18n settings.connections.localAi.server: Server
// i18n settings.connections.localAi.endpoint: Local address
// i18n settings.connections.localAi.endpointHint: http://127.0.0.1 or http://localhost, with a port.
// i18n settings.connections.localAi.preset: Use {{name}}
// i18n settings.connections.localAi.endpointPlaceholder: http://127.0.0.1:11434
// i18n settings.connections.localAi.save: Save address
// i18n settings.connections.localAi.forget: Forget
// i18n settings.connections.localAi.model: Model
// i18n settings.connections.localAi.loadModels: Load models
// i18n settings.connections.localAi.loading: Asking the server…
// i18n settings.connections.localAi.noModels: The server lists no models. Load or download one in your local AI app first.
// i18n settings.connections.localAi.use: Use Local AI for translations, suggestions and image descriptions
// i18n settings.connections.localAi.useHint: While this is on, Local AI answers instead of OpenRouter. If it fails, you see its error; Mawkingbird never switches to OpenRouter on its own.
// i18n settings.connections.localAi.review: Whatever the model writes is shown to you before anything is posted. Some models can't read images; when that happens you'll see the model's own error.
// i18n settings.connections.localAi.active: Local AI is on.
// i18n settings.connections.localAi.inactive: Choose an address and a model to turn Local AI on.

/**
 * Settings → Connections → Local AI (native only, parity item 1).
 *
 * No budget, cost or Plus copy: it is free and runs here. No guess about what
 * a model can do (owner decision 2026-11-16); its errors are shown as-is.
 */
@Component({
  selector: 'app-connection-local-ai',
  imports: [FormsModule, MbButton, MbCheckbox, MbControl, MbField, MbSettingsRow, TranslocoPipe],
  template: `
    <div class="spage-head">
      <h1>{{ 'settings.connections.localAi.title' | transloco }}</h1>
      <p>{{ 'settings.connections.localAi.intro' | transloco }}</p>
      <p class="runs-here">{{ 'settings.connections.localAi.runsHere' | transloco }}</p>
    </div>
    <div class="spage-body">
      <div class="ssection">
        <mb-settings-row [heading]="'settings.connections.localAi.server' | transloco">
          <div class="presets">
            @for (preset of presets; track preset.id) {
              <button
                mbButton
                type="button"
                variant="outline"
                size="small"
                (click)="endpointDraft.set(preset.endpoint)"
              >
                {{ 'settings.connections.localAi.preset' | transloco: { name: preset.label } }}
              </button>
            }
          </div>
          <mb-field
            [label]="'settings.connections.localAi.endpoint' | transloco"
            [hint]="'settings.connections.localAi.endpointHint' | transloco"
          >
            <input
              mbControl
              type="url"
              name="localAiEndpoint"
              autocapitalize="none"
              spellcheck="false"
              [placeholder]="'settings.connections.localAi.endpointPlaceholder' | transloco"
              [ngModel]="endpointDraft()"
              (ngModelChange)="endpointDraft.set($event)"
            />
          </mb-field>
          <div class="actions">
            <button mbButton type="button" [disabled]="busy()" (click)="saveEndpoint()">
              {{ 'settings.connections.localAi.save' | transloco }}
            </button>
            @if (localAi.endpoint()) {
              <button
                mbButton
                type="button"
                variant="outline"
                [disabled]="busy()"
                (click)="forget()"
              >
                {{ 'settings.connections.localAi.forget' | transloco }}
              </button>
            }
          </div>
        </mb-settings-row>
        @if (localAi.endpoint()) {
          <mb-settings-row [heading]="'settings.connections.localAi.model' | transloco">
            <button
              mbButton
              type="button"
              variant="outline"
              [disabled]="busy()"
              (click)="loadModels()"
            >
              {{
                (busy()
                  ? 'settings.connections.localAi.loading'
                  : 'settings.connections.localAi.loadModels'
                ) | transloco
              }}
            </button>
            @if (models(); as list) {
              @if (list.length) {
                <mb-field [label]="'settings.connections.localAi.model' | transloco">
                  <select
                    mbControl
                    name="localAiModel"
                    [ngModel]="localAi.model()"
                    (ngModelChange)="localAi.setModel($event)"
                  >
                    @for (model of list; track model) {
                      <option [value]="model">{{ model }}</option>
                    }
                  </select>
                </mb-field>
              } @else {
                <p class="hint">{{ 'settings.connections.localAi.noModels' | transloco }}</p>
              }
            } @else if (localAi.model()) {
              <p>{{ localAi.model() }}</p>
            }
            <mb-checkbox
              name="localAiEnabled"
              [checked]="localAi.enabled()"
              (checkedChange)="localAi.setEnabled($event)"
              [label]="'settings.connections.localAi.use' | transloco"
              [hint]="'settings.connections.localAi.useHint' | transloco"
            />
          </mb-settings-row>
        }
        <p role="status">
          {{
            (localAi.active()
              ? 'settings.connections.localAi.active'
              : 'settings.connections.localAi.inactive'
            ) | transloco
          }}
        </p>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
        <p class="hint">{{ 'settings.connections.localAi.review' | transloco }}</p>
      </div>
    </div>
  `,
  styles: `
    .presets,
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-block: 0.5rem;
    }
    .runs-here {
      font-weight: 600;
    }
  `,
})
export class ConnectionLocalAi implements OnInit {
  protected readonly localAi = inject(LocalAi);
  protected readonly presets = LOCAL_AI_PRESETS;
  protected readonly endpointDraft = signal('');
  protected readonly models = signal<string[] | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.endpointDraft.set(this.localAi.endpoint() ?? '');
  }

  protected async saveEndpoint(): Promise<void> {
    await this.run(async () => {
      await this.localAi.setEndpoint(this.endpointDraft().trim() || null);
      this.endpointDraft.set(this.localAi.endpoint() ?? '');
      this.models.set(null);
    });
  }

  protected async forget(): Promise<void> {
    await this.run(async () => {
      await this.localAi.setEndpoint(null);
      this.endpointDraft.set('');
      this.models.set(null);
    });
  }

  protected async loadModels(): Promise<void> {
    await this.run(async () => {
      const list = await this.localAi.listModels();
      this.models.set(list);
      if (list.length && !list.includes(this.localAi.model())) this.localAi.setModel(list[0]);
    });
  }

  private async run(task: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await task();
    } catch (error: unknown) {
      // Shown as the server or the native host wrote it.
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
