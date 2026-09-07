import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterChat } from '../providers/openrouter/openrouter-chat';
import { OpenRouterModelChoice } from '../providers/openrouter/openrouter-model-choice';
import { PromptTemplateStore } from '../providers/openrouter/prompt-templates';
import {
  MAX_PROOFREADING_FINDING_CHARS,
  Proofreader,
  cleanProofreadingFindings,
} from './proofreader';

describe('cleanProofreadingFindings', () => {
  it('keeps compact diagnostics and removes duplicates', () => {
    expect(cleanProofreadingFindings(['cat should be plural', ' cat  should be plural '])).toEqual([
      { message: 'cat should be plural' },
    ]);
  });

  it('rejects copy-ready rewrite-shaped output and long passages', () => {
    expect(
      cleanProofreadingFindings([
        'Here is a revised version: Cats are wonderful.',
        'x'.repeat(MAX_PROOFREADING_FINDING_CHARS + 1),
      ]),
    ).toEqual([]);
  });
});

describe('Proofreader', () => {
  const suggest = vi.fn();

  beforeEach(() => {
    suggest.mockReset();
    TestBed.configureTestingModule({
      providers: [
        Proofreader,
        { provide: OpenRouterChat, useValue: { suggest } },
        { provide: OpenRouterModelChoice, useValue: { modelId: () => 'test/proofreader' } },
        {
          provide: PromptTemplateStore,
          useValue: {
            render: vi.fn(
              (_id: string, values: Record<string, string>) =>
                `${values['replyContext']}\n${values['text']}`,
            ),
          },
        },
      ],
    });
  });

  it('returns no findings and makes no call for blank writing', async () => {
    await expect(TestBed.inject(Proofreader).run('   ')).resolves.toEqual([]);
    expect(suggest).not.toHaveBeenCalled();
  });

  it('includes optional original-post context without asking for a rewrite', async () => {
    suggest.mockResolvedValue({ suggestions: ['This answers the original question directly.'] });
    const findings = await TestBed.inject(Proofreader).run('Yes, because...', {
      originalPost: 'Why does this happen?',
    });

    expect(suggest).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining('Why does this happen?') }),
    );
    expect(findings).toEqual([{ message: 'This answers the original question directly.' }]);
  });

  it('previews the exact connector, model, and prompt without making a request', () => {
    const proofreader = TestBed.inject(Proofreader);

    expect(proofreader.preview('  Check this  ')).toEqual({
      connector: 'OpenRouter',
      model: 'test/proofreader',
      prompt: '\nCheck this',
    });
    expect(suggest).not.toHaveBeenCalled();
  });
});
