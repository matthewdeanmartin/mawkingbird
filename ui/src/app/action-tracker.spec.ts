import { describe, expect, it } from 'vitest';
import { actionTarget } from './action-tracker';

describe('actionTarget', () => {
  it('uses code-owned component, element, type, and class names', () => {
    const host = document.createElement('app-compose');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn publish-action active';
    host.append(button);

    expect(actionTarget(button)).toBe('app-compose > button > button > btn > publish-action');
  });

  it('does not retain labels, values, ids, or dynamic numeric classes', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'private-account-id';
    input.value = 'private post text';
    input.setAttribute('aria-label', 'Private label');
    input.className = 'field account-123456';

    const target = actionTarget(input);

    expect(target).toBe('input > text > field');
    expect(target).not.toContain('private');
    expect(target).not.toContain('123456');
  });
});
