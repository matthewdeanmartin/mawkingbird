import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Component, inject, OnInit, signal } from '@angular/core';
import { VaultBridge } from '../../../../providers/vault/vault-bridge';

/** The registry base this page's credential is stored under. */
const OPENROUTER_KEY = 'mockingbird_openrouter_key';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { OpenRouterSession } from '../../../../providers/openrouter/openrouter-session';
import {
  DEFAULT_MODEL_ID,
  OpenRouterModel,
  OpenRouterModels,
  perMillionTokens,
} from '../../../../providers/openrouter/openrouter-models';
import { OpenRouterModelChoice } from '../../../../providers/openrouter/openrouter-model-choice';
import {
  CreditsState,
  describeCredits,
  OpenRouterCredits,
} from '../../../../providers/openrouter/openrouter-credits';
import {
  PromptTemplateId,
  PromptTemplateStore,
} from '../../../../providers/openrouter/prompt-templates';
import { TranslationPreference } from '../../../../translation-preference';
import { CONNECTION_SCOPE_COPY } from '../connection-catalog';
import { expiryLabel } from '../expiry-label';
import { credentialLocation, StorageBadge } from '../storage-badge';
import { PageDiagnostics } from '../../../../page-diagnostics';

/**
 * Settings → Connections → OpenRouter. PKCE connect, model picker, credits.
 *
 * The OAuth round trip lands back here (see `pages/openrouter-callback`), so
 * this page also reads the `?openrouter=` result.
 */
// i18n settings.connections.openrouter.authFailed: OpenRouter authorization failed.
// i18n settings.connections.openrouter.back: ‹ All connections
// i18n settings.connections.openrouter.cancel: Cancel
// i18n settings.connections.openrouter.checking: Checking…
// i18n settings.connections.openrouter.connect: Connect OpenRouter
// i18n settings.connections.openrouter.connected: Connected
// i18n settings.connections.openrouter.credits.capNote: Per-key spending caps are set at OpenRouter. Add one there if you want a ceiling this page can show progress against.
// i18n settings.connections.openrouter.credits: Credits
// i18n settings.connections.openrouter.disconnect: Disconnect
// i18n settings.connections.openrouter.expiry.cleared.a: This key is cleared from this browser on
// i18n settings.connections.openrouter.expiry.cleared.b: , and fetched back from your vault the next time it is needed. The retention policy of the account you are signed in as is the one that applies.
// i18n settings.connections.openrouter.expiry.deleted.a: This key is deleted from this browser on
// i18n settings.connections.openrouter.expiry.deleted.b: . The retention policy of the account you are signed in as is the one that applies.
// i18n settings.connections.openrouter.intro: One key, hundreds of AI models, billed by usage. Authorization happens directly between this browser and OpenRouter — Mawkingbird never sees a client secret, and the key it issues is yours.
// i18n settings.connections.openrouter.keyWarning.a: The key OpenRouter issues can spend your OpenRouter credits. It is stored in this browser's localStorage, never sent to Mawkingbird, and sent only to
// i18n settings.connections.openrouter.keyWarning.b: . Use a browser profile and device you trust; revoke the key at OpenRouter to invalidate it.
// i18n settings.connections.openrouter.model.default.a: The model the search and tag helpers use. The default is
// i18n settings.connections.openrouter.model.default.b: — cheap, fast, and able to return structured JSON, which is all these features ask of it.
// i18n settings.connections.openrouter.model.in: · in
// i18n settings.connections.openrouter.model.inUse: In use
// i18n settings.connections.openrouter.model.noMatches: No models matched. Try a shorter search — model names are like “gemma”.
// i18n settings.connections.openrouter.model.out: · out
// i18n settings.connections.openrouter.model.searchNote: OpenRouter lists hundreds of models, so this searches rather than lists. With an empty box it shows the default.
// i18n settings.connections.openrouter.model.searchPlaceholder: Search models — e.g. gemma, haiku, mistral
// i18n settings.connections.openrouter.model.structuredOnly.hint.a: — both helpers ask for JSON. Unchecking this also surfaces the
// i18n settings.connections.openrouter.model.structuredOnly.hint.b: variants, which don't guarantee a schema.
// i18n settings.connections.openrouter.model.structuredOnly: Only models that support structured output
// i18n settings.connections.openrouter.model.tokenContext: token context
// i18n settings.connections.openrouter.model.useThis: Use this
// i18n settings.connections.openrouter.model.using: Using
// i18n settings.connections.openrouter.model: Model
// i18n settings.connections.openrouter.notChecked: Not checked yet.
// i18n settings.connections.openrouter.prompts.customised: Customised
// i18n settings.connections.openrouter.prompts.intro.a: What the model is actually asked. The search and tag helpers work in two passes — the model proposes, the Mastodon API grades the proposals, and the model gets one chance to improve them — so those two have a
// i18n settings.connections.openrouter.prompts.intro.b: slot that is empty on the first pass. The translator has no second pass: there is nothing to grade a translation against.
// i18n settings.connections.openrouter.prompts.placeholderNote.a: Each prompt lists the placeholders it accepts. An unknown one is left visible in the sent prompt rather than silently dropped, so a typo shows up as a stray
// i18n settings.connections.openrouter.prompts.placeholderNote.b: instead of quietly producing worse answers.
// i18n settings.connections.openrouter.prompts.placeholders: Placeholders:
// i18n settings.connections.openrouter.prompts: Prompts
// i18n settings.connections.openrouter.refresh: Refresh
// i18n settings.connections.openrouter.resetToDefault: Reset to default
// i18n settings.connections.openrouter.save: Save
// i18n settings.connections.openrouter.search: Search
// i18n settings.connections.openrouter.searching: Searching…
// i18n settings.connections.openrouter.title: 🧠 OpenRouter
// i18n settings.connections.openrouter.translation.anonNote: Browsing without an account, this choice doesn't apply — server translation needs a login, so AI is the only translator available and the 🤖🌐 button goes straight to it.
// i18n settings.connections.openrouter.translation.intro: Which translator the 🌐 button on a post uses. Your server's own translation is the default: it costs you nothing and it is what you already had. AI translation is opt-in.
// i18n settings.connections.openrouter.translation: Translation

@Component({
  selector: 'app-connection-openrouter',
  imports: [FormsModule, RouterLink, DecimalPipe, StorageBadge, TranslocoPipe],
  templateUrl: './connection-openrouter.html',
  styleUrls: ['../connection-page.css', './connection-openrouter.css'],
})
export class ConnectionOpenRouter implements OnInit {
  private diagnostics = inject(PageDiagnostics);
  private readonly transloco = inject(TranslocoService);
  protected openrouter = inject(OpenRouterSession);
  protected models = inject(OpenRouterModels);
  protected choice = inject(OpenRouterModelChoice);
  protected prompts = inject(PromptTemplateStore);
  protected translatePref = inject(TranslationPreference);
  private credits = inject(OpenRouterCredits);
  private bridge = inject(VaultBridge);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected readonly scopeDetail = CONNECTION_SCOPE_COPY.browser.detail;
  protected readonly defaultModelId = DEFAULT_MODEL_ID;
  protected readonly expiryLabel = expiryLabel;

  /**
   * Where this key lives, for the badge.
   *
   * Reads the connector's own two facts rather than the vault's state — a
   * locked vault is not a locked credential. See `storage-badge.ts`.
   */
  protected where() {
    return credentialLocation(this.bridge.syncs(OPENROUTER_KEY), this.openrouter.needsFetch());
  }
  protected readonly perMillionTokens = perMillionTokens;
  protected readonly describeCredits = describeCredits;

  protected error = signal<string | null>(null);
  protected notice = signal<string | null>(null);

  protected creditsState = signal<CreditsState | null>(null);
  protected creditsBusy = signal(false);

  /**
   * Draft text per template, so typing doesn't rewrite storage on every
   * keystroke and Cancel is a real option.
   */
  protected drafts = signal<Partial<Record<PromptTemplateId, string>>>({});

  protected query = signal('');
  protected structuredOnly = signal(true);
  protected results = signal<OpenRouterModel[] | null>(null);
  protected searchError = signal<string | null>(null);

  ngOnInit(): void {
    const result = this.route.snapshot.queryParamMap.get('openrouter');
    if (result === 'connected') {
      this.notice.set('OpenRouter connected.');
    } else if (result === 'error') {
      this.error.set(
        this.route.snapshot.queryParamMap.get('message') ??
          this.transloco.translate<string>('settings.connections.openrouter.authFailed'),
      );
    }
    if (result) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }

    // Deep-link case: re-check against a policy shortened on the catalog page.
    this.openrouter.enforceLifetime();

    if (this.openrouter.connected()) {
      void this.refreshCredits();
    }
    // The model list is public, so show the current pick's details either way.
    void this.runSearch();
  }

  async connect(): Promise<void> {
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.openrouter.connect();
    } catch (error: unknown) {
      this.diagnostics.error('OpenRouter', 'connect:error', error);
      this.error.set(describeError(error, "Couldn't start OpenRouter authorization."));
    }
  }

  disconnect(): void {
    this.openrouter.disconnect();
    this.creditsState.set(null);
    this.notice.set(null);
    this.error.set(null);
  }

  async refreshCredits(): Promise<void> {
    if (this.creditsBusy()) {
      return;
    }
    this.creditsBusy.set(true);
    try {
      this.creditsState.set(await this.credits.load());
    } finally {
      this.creditsBusy.set(false);
    }
  }

  async runSearch(): Promise<void> {
    this.searchError.set(null);
    try {
      this.results.set(
        await this.models.search(this.query(), { structuredOnly: this.structuredOnly() }),
      );
    } catch (error: unknown) {
      this.diagnostics.error('OpenRouter', 'model-search:error', error, {
        queryLength: this.query().length,
      });
      this.results.set(null);
      this.searchError.set(describeError(error, "Couldn't search OpenRouter's models."));
    }
  }

  toggleStructuredOnly(value: boolean): void {
    this.structuredOnly.set(value);
    void this.runSearch();
  }

  choose(model: OpenRouterModel): void {
    this.choice.set(model.id);
  }

  // ------------------------------------------------------------- prompts

  /**
   * A placeholder as the user writes it, braces and all.
   *
   * Built here rather than in the template because Angular decodes `&#123;`
   * back to `{` and then parses the result as an interpolation — there is no
   * way to spell a literal `{{name}}` in a template.
   */
  braced(name: string): string {
    return `{{${name}}}`;
  }

  /** The text in the editor: the unsaved draft if there is one, else the saved text. */
  promptDraft(id: PromptTemplateId): string {
    return this.drafts()[id] ?? this.prompts.text(id);
  }

  editPrompt(id: PromptTemplateId, text: string): void {
    this.drafts.set({ ...this.drafts(), [id]: text });
  }

  promptDirty(id: PromptTemplateId): boolean {
    const draft = this.drafts()[id];
    return draft !== undefined && draft !== this.prompts.text(id);
  }

  savePrompt(id: PromptTemplateId): void {
    this.prompts.set(id, this.promptDraft(id));
    this.clearDraft(id);
  }

  revertPrompt(id: PromptTemplateId): void {
    this.clearDraft(id);
  }

  resetPrompt(id: PromptTemplateId): void {
    this.prompts.reset(id);
    this.clearDraft(id);
  }

  private clearDraft(id: PromptTemplateId): void {
    const next = { ...this.drafts() };
    delete next[id];
    this.drafts.set(next);
  }
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
