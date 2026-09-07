import { computed, inject, Injectable } from '@angular/core';
import { Account } from '../models';
import { AiAvailability } from '../ai-availability';
import { ElizaService } from '../eliza/eliza.service';
import { ELIZA_PEER } from '../eliza/eliza-identity';
import { OpenRouterModelChoice } from '../providers/openrouter/openrouter-model-choice';
import { OpenRouterSession } from '../providers/openrouter/openrouter-session';
import { OPENROUTER_PEER, openRouterAccount } from '../providers/openrouter/openrouter-identity';

/** A browser-local correspondent you can hold conversations with. */
export interface BotPeer {
  /** Conversation-store peer key. */
  peer: string;
  account: Account;
  /**
   * True when replies cost money and take time — i.e. a real model.
   *
   * Drives the things that only make sense for a billed, streaming reply: the
   * "still answering" state, the stop button, and the partial-response
   * handling. Eliza answers instantly and free, so none of it applies to her.
   */
  streams: boolean;
}

/**
 * The bot correspondents available right now.
 *
 * Both are conditional, and for different reasons. Eliza appears once followed
 * — she is a character you opt into. OpenRouter appears once connected, because
 * without a key there is no model to talk to and offering the conversation
 * would only produce an error. Neither appears when AI features are off.
 */
@Injectable({ providedIn: 'root' })
export class BotPeers {
  private ai = inject(AiAvailability);
  private eliza = inject(ElizaService);
  private openRouter = inject(OpenRouterSession);
  private modelChoice = inject(OpenRouterModelChoice);

  readonly peers = computed<BotPeer[]>(() => {
    if (!this.ai.enabled()) {
      return [];
    }
    const peers: BotPeer[] = [];
    if (this.openRouter.connected()) {
      peers.push({
        peer: OPENROUTER_PEER,
        account: openRouterAccount(this.modelChoice.modelId()),
        streams: true,
      });
    }
    // Eliza is unconditional. Following her governs whether her posts appear in
    // your *timeline* — a real opt-in — but it was never a sensible gate on
    // whether you can talk to her, and once "Meet Eliza" left the menu it
    // became a gate with no way to open it. She costs nothing, runs no model,
    // and is the one correspondent every visitor has.
    peers.push({ peer: ELIZA_PEER, account: this.eliza.account(), streams: false });
    return peers;
  });

  /** One peer by key, or undefined when it is not currently available. */
  find(peer: string): BotPeer | undefined {
    return this.peers().find((p) => p.peer === peer);
  }
}
