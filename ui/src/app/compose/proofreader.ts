import { inject, Injectable } from '@angular/core';
import { OpenRouterChat } from '../providers/openrouter/openrouter-chat';
import { OpenRouterModelChoice } from '../providers/openrouter/openrouter-model-choice';
import { PromptTemplateStore } from '../providers/openrouter/prompt-templates';

/** A diagnostic observation. There is deliberately no replacement-text field. */
export interface ProofreadingFinding {
  message: string;
}

export interface ProofreadingContext {
  /** Plain text from the original post when the writing is a reply. */
  originalPost?: string;
}

/** The billable request shown to the author before anything leaves the browser. */
export interface ProofreadingRequestPreview {
  connector: 'OpenRouter';
  model: string;
  prompt: string;
}

/** Long enough to explain a problem, too short to smuggle in a replacement post. */
export const MAX_PROOFREADING_FINDING_CHARS = 240;
const MAX_FINDINGS = 8;

/**
 * Keep only compact, single-line diagnostics.
 *
 * The prompt is the first guard; this is the last one. Model output is untrusted,
 * and a paragraph-sized "suggestion" is exactly the ghostwriting failure this
 * feature must not put in front of the author.
 */
export function cleanProofreadingFindings(values: string[]): ProofreadingFinding[] {
  const seen = new Set<string>();
  const findings: ProofreadingFinding[] = [];
  for (const value of values) {
    const message = value.replace(/\s+/g, ' ').trim();
    const key = message.toLowerCase();
    if (
      !message ||
      message.length > MAX_PROOFREADING_FINDING_CHARS ||
      /^(?:rewritten|revised|rewrite|try this|suggested version|here(?:'s| is))/i.test(message) ||
      seen.has(key)
    ) {
      continue;
    }
    seen.add(key);
    findings.push({ message });
    if (findings.length >= MAX_FINDINGS) {
      break;
    }
  }
  return findings;
}

/** OpenRouter-backed diagnostic proofreading shared by current and future composers. */
@Injectable({ providedIn: 'root' })
export class Proofreader {
  private chat = inject(OpenRouterChat);
  private choice = inject(OpenRouterModelChoice);
  private prompts = inject(PromptTemplateStore);

  /** Build exactly the request the model will receive, without sending it. */
  preview(text: string, context: ProofreadingContext = {}): ProofreadingRequestPreview {
    return {
      connector: 'OpenRouter',
      model: this.choice.modelId(),
      prompt: this.prompts.render('proofread', {
        text: text.trim(),
        replyContext: context.originalPost?.trim() ?? '',
      }),
    };
  }

  async run(text: string, context: ProofreadingContext = {}): Promise<ProofreadingFinding[]> {
    const source = text.trim();
    if (!source) {
      return [];
    }
    const request = this.preview(source, context);
    const reply = await this.chat.suggest({
      prompt: request.prompt,
      schemaName: 'writing_proofreading_findings',
      max: MAX_FINDINGS,
    });
    return cleanProofreadingFindings(reply.suggestions);
  }
}
