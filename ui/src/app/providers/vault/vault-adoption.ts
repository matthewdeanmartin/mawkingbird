/** Reconcile low-churn connector credentials between this browser and the open vault. */

import { inject, Injectable } from '@angular/core';
import { CorsProxySettings } from '../cors-proxy/cors-proxy-settings';
import { GitHubSession } from '../github/github-session';
import { HugoSettings } from '../hugo/hugo-settings';
import { MataroaSettings } from '../mataroa/mataroa-settings';
import { OpenRouterSession } from '../openrouter/openrouter-session';
import { GistSettings } from '../paste/gist-settings';
import { RaindropSession } from '../raindrop/raindrop-session';
import { ShortenerSettings } from '../shortener/shortener-settings';
import { TwitterSettings } from '../twitter/twitter-settings';
import type { VaultReconcileOutcome } from './vault-reconcile';

export interface VaultAdoptionResult {
  restored: string[];
  stored: string[];
  merged: string[];
  conflicts: { connector: string; message: string }[];
  failed: { connector: string; message: string }[];
}

@Injectable({ providedIn: 'root' })
export class VaultAdoption {
  private openRouter = inject(OpenRouterSession);
  private corsProxy = inject(CorsProxySettings);
  private shorteners = inject(ShortenerSettings);
  private raindrop = inject(RaindropSession);
  private twitter = inject(TwitterSettings);
  private mataroa = inject(MataroaSettings);
  private hugo = inject(HugoSettings);
  private github = inject(GitHubSession);
  private gist = inject(GistSettings);

  /**
   * Sequential on purpose: every successful call advances one shared vault
   * version. Parallel writes would manufacture conflicts between credentials
   * being imported by the same click.
   */
  async reconcileExisting(): Promise<VaultAdoptionResult> {
    const sources: readonly [string, () => Promise<VaultReconcileOutcome>][] = [
      ['OpenRouter', () => this.openRouter.reconcileVault()],
      ['CORS proxy', () => this.corsProxy.reconcileVault()],
      ['Link shorteners', () => this.shorteners.reconcileVault()],
      ['Raindrop', () => this.raindrop.reconcileVault()],
      ['Twitter', () => this.twitter.reconcileVault()],
      ['Mataroa', () => this.mataroa.reconcileVault()],
      ['Hugo', () => this.hugo.reconcileVault()],
      ['GitHub', () => this.github.reconcileVault()],
      ['GitHub Gist', () => this.gist.reconcileVault()],
    ];
    const restored: string[] = [];
    const stored: string[] = [];
    const merged: string[] = [];
    const conflicts: VaultAdoptionResult['conflicts'] = [];
    const failed: VaultAdoptionResult['failed'] = [];

    for (const [connector, sync] of sources) {
      try {
        const outcome = await sync();
        switch (outcome.kind) {
          case 'restored':
            restored.push(connector);
            break;
          case 'stored':
            stored.push(connector);
            break;
          case 'merged':
            merged.push(connector);
            break;
          case 'conflict':
            conflicts.push({ connector, message: outcome.message });
            break;
          case 'failed':
            failed.push({ connector, message: outcome.message });
            break;
        }
      } catch (error) {
        failed.push({
          connector,
          message: error instanceof Error ? error.message : 'Unexpected connector error.',
        });
      }
    }
    return { restored, stored, merged, conflicts, failed };
  }
}
