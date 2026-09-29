import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../../design-system/button/button';
import { MbControl, MbField } from '../../../design-system/field/field';

export interface FilterDraft {
  title: string;
  keywords: string[];
  expiresIn: number | null;
}

// i18n settings.filters.wizard.title: Filter setup
// i18n settings.filters.wizard.choose: 1. What would you like to hide?
// i18n settings.filters.wizard.politics: Politics
// i18n settings.filters.wizard.spoilers: Movie or book spoilers
// i18n settings.filters.wizard.custom: Set up a custom filter
// i18n settings.filters.wizard.words: 2. Choose words and related phrases
// i18n settings.filters.wizard.name: Filter name
// i18n settings.filters.wizard.keywords: Words and phrases, one per line
// i18n settings.filters.wizard.politicsHint: Edit these suggestions and add names, parties, issues or hashtags you want to avoid. Each phrase matches separately; related words must be listed explicitly.
// i18n settings.filters.wizard.spoilersHint: Add the movie or book title, character names, series names and common hashtags. Each phrase matches separately; related words must be listed explicitly.
// i18n settings.filters.wizard.politicsWords: politics, political, election, elections, voting, parliament, congress
// i18n settings.filters.wizard.spoilersName: Spoilers
// i18n settings.filters.wizard.duration: Hide spoilers for
// i18n settings.filters.wizard.day: One day
// i18n settings.filters.wizard.week: One week
// i18n settings.filters.wizard.month: One month
// i18n settings.filters.wizard.back: Back
// i18n settings.filters.wizard.review: Review filter
// i18n settings.filters.wizard.reviewHint: 3. Review your filter, then choose Create filter. You can adjust the keywords, where it applies and when it expires below.
@Component({
  selector: 'app-filter-wizard',
  imports: [FormsModule, TranslocoPipe, MbButton, MbControl, MbField],
  template: `
    <section class="spage-body" aria-labelledby="filter-wizard-title">
      <h2 id="filter-wizard-title">{{ 'settings.filters.wizard.title' | transloco }}</h2>
      @if (!scenario()) {
        <p>{{ 'settings.filters.wizard.choose' | transloco }}</p>
        <div class="choices">
          <button mbButton type="button" (click)="choose('politics')">
            {{ 'settings.filters.wizard.politics' | transloco }}
          </button>
          <button mbButton type="button" (click)="choose('spoilers')">
            {{ 'settings.filters.wizard.spoilers' | transloco }}
          </button>
          <button mbButton variant="outline" type="button" (click)="custom.emit()">
            {{ 'settings.filters.wizard.custom' | transloco }}
          </button>
        </div>
      } @else {
        <p>{{ 'settings.filters.wizard.words' | transloco }}</p>
        <mb-field [label]="'settings.filters.wizard.name' | transloco">
          <input mbControl [ngModel]="name()" (ngModelChange)="name.set($event)" />
        </mb-field>
        <mb-field
          [label]="'settings.filters.wizard.keywords' | transloco"
          [hint]="
            'settings.filters.wizard.' +
              (scenario() === 'politics' ? 'politicsHint' : 'spoilersHint') | transloco
          "
        >
          <textarea
            mbControl
            rows="7"
            [ngModel]="words()"
            (ngModelChange)="words.set($event)"
          ></textarea>
        </mb-field>
        @if (scenario() === 'spoilers') {
          <mb-field [label]="'settings.filters.wizard.duration' | transloco">
            <select mbControl [ngModel]="duration()" (ngModelChange)="duration.set($event)">
              <option [ngValue]="86400">{{ 'settings.filters.wizard.day' | transloco }}</option>
              <option [ngValue]="604800">{{ 'settings.filters.wizard.week' | transloco }}</option>
              <option [ngValue]="2592000">{{ 'settings.filters.wizard.month' | transloco }}</option>
            </select>
          </mb-field>
        }
        <div class="choices">
          <button mbButton variant="outline" type="button" (click)="scenario.set(null)">
            {{ 'settings.filters.wizard.back' | transloco }}
          </button>
          <button
            mbButton
            type="button"
            [disabled]="!name().trim() || !keywords().length"
            (click)="review()"
          >
            {{ 'settings.filters.wizard.review' | transloco }}
          </button>
        </div>
      }
    </section>
  `,
  styles: `
    .choices {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    mb-field {
      display: block;
      margin-block: 12px;
    }
  `,
})
export class FilterWizard {
  private readonly transloco = inject(TranslocoService);
  readonly prepared = output<FilterDraft>();
  readonly custom = output<void>();
  protected readonly scenario = signal<'politics' | 'spoilers' | null>(null);
  protected readonly name = signal('');
  protected readonly words = signal('');
  protected readonly duration = signal(604800);
  protected readonly keywords = computed(() => [
    ...new Set(
      this.words()
        .split(/[\n,]+/)
        .map((word) => word.trim())
        .filter(Boolean),
    ),
  ]);

  protected choose(scenario: 'politics' | 'spoilers'): void {
    this.scenario.set(scenario);
    this.name.set(
      this.transloco.translate(
        `settings.filters.wizard.${scenario === 'politics' ? 'politics' : 'spoilersName'}`,
      ),
    );
    this.words.set(
      scenario === 'politics'
        ? this.transloco
            .translate<string>('settings.filters.wizard.politicsWords')
            .split(', ')
            .join('\n')
        : '',
    );
  }

  protected review(): void {
    if (!this.name().trim() || !this.keywords().length) return;
    this.prepared.emit({
      title: this.name().trim(),
      keywords: this.keywords(),
      expiresIn: this.scenario() === 'spoilers' ? this.duration() : null,
    });
  }
}
