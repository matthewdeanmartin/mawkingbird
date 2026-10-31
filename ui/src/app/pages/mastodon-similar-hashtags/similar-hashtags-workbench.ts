import { Component, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { SimilarHashtagsPanel } from '../../similar-hashtags/similar-hashtags-panel';
import {
  MAX_SIMILAR_SEEDS,
  parseHashtags,
  parseSimilarParam,
  similarParam,
} from '../../similar-hashtags/similar-hashtags';
import { FocusedNextSteps, NextStepCard } from '../focused-apps/focused-next-steps';

/**
 * The body of /mastodon-similar-hashtags: type a few hashtags, get the ones that
 * travel with them. Works signed out. The hashtags live in `?tags=`, so a result
 * can be shared and Back steps through earlier comparisons.
 */
@Component({
  selector: 'app-similar-hashtags-workbench',
  imports: [FormsModule, MbButton, MbControl, MbField, SimilarHashtagsPanel, FocusedNextSteps],
  templateUrl: './similar-hashtags-workbench.html',
  styleUrl: '../focused-apps/focused-page.css',
  styles: `
    .finder {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 12px;
    }
    .finder mb-field {
      flex: 1 1 260px;
    }
    /* The panel brings its own padding. */
    .panel {
      padding: 0;
    }
  `,
})
export class SimilarHashtagsWorkbench {
  /** Where "Invite your friends" goes: the tool's own Invite tab when signed in. */
  readonly inviteLink = input('/invites');

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected readonly hint = `One or more, like #dog #dogs. Up to ${MAX_SIMILAR_SEEDS}, compared together as one set.`;

  protected tags = toSignal(
    this.route.queryParamMap.pipe(map((params) => parseSimilarParam(params.get('tags')))),
    { initialValue: [] as string[] },
  );
  protected text = signal(
    this.tags()
      .map((tag) => `#${tag}`)
      .join(' '),
  );
  protected canFind = computed(() => parseHashtags(this.text()).length > 0);
  protected nextStep = computed<NextStepCard | null>(() => {
    const first = this.tags()[0];
    return first
      ? {
          link: `/tags/${first}`,
          title: `Read #${first} in Mawkingbird`,
          body: 'The latest posts for the hashtag; follow it to see them on Home.',
        }
      : null;
  });

  protected find(event: Event): void {
    event.preventDefault();
    this.show(parseHashtags(this.text()));
  }

  protected show(tags: string[]): void {
    this.text.set(tags.map((tag) => `#${tag}`).join(' '));
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tags: similarParam(tags) },
    });
  }
}
