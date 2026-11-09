import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_BUDGET_KEY, AiBudget, DEFAULT_DAILY_CAP_USD, formatUsd } from './ai-budget';

describe('AiBudget', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('defaults to a $0.25 daily cap (owner decision)', () => {
    const budget = TestBed.inject(AiBudget);
    expect(DEFAULT_DAILY_CAP_USD).toBe(0.25);
    expect(budget.capUsd()).toBe(0.25);
    expect(budget.canSpend()).toBe(true);
  });

  it('counts reported costs and stops at the cap', () => {
    const budget = TestBed.inject(AiBudget);
    budget.record(0.1);
    budget.record(0.1);
    expect(budget.canSpend()).toBe(true);
    budget.record(0.06);
    expect(budget.canSpend()).toBe(false);
    expect(budget.spentTodayUsd()).toBeCloseTo(0.26);
  });

  it('ignores missing or nonsense costs', () => {
    const budget = TestBed.inject(AiBudget);
    budget.record(null);
    budget.record(-1);
    budget.record(Number.NaN);
    expect(budget.spentTodayUsd()).toBe(0);
  });

  it('asks once a day when refused, and raising adds a cap for today only', () => {
    const budget = TestBed.inject(AiBudget);
    budget.record(0.3);
    budget.refused();
    expect(budget.promptOpen()).toBe(true);
    budget.raiseToday(0.25);
    expect(budget.promptOpen()).toBe(false);
    expect(budget.limitTodayUsd()).toBeCloseTo(0.5);
    expect(budget.capUsd()).toBe(0.25);
    expect(budget.canSpend()).toBe(true);
    budget.record(0.3);
    budget.refused();
    // Already answered today.
    expect(budget.promptOpen()).toBe(false);
  });

  it('declining stops the prompt until tomorrow', () => {
    const budget = TestBed.inject(AiBudget);
    budget.record(1);
    budget.refused();
    budget.declineToday();
    budget.refused();
    expect(budget.promptOpen()).toBe(false);
  });

  it('starts each day fresh but keeps the standing cap', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 9, 12));
    const budget = TestBed.inject(AiBudget);
    budget.setCap(1);
    budget.record(0.9);
    budget.raiseToday(0.5);
    TestBed.resetTestingModule();
    vi.setSystemTime(new Date(2026, 10, 10, 9));
    const tomorrow = TestBed.inject(AiBudget);
    expect(tomorrow.capUsd()).toBe(1);
    expect(tomorrow.spentTodayUsd()).toBe(0);
    expect(tomorrow.limitTodayUsd()).toBe(1);
    expect(JSON.parse(localStorage.getItem(AI_BUDGET_KEY)!).capUsd).toBe(1);
  });

  it('formats dollars with enough digits to see fractions of a cent', () => {
    expect(formatUsd(0.25)).toBe('$0.25');
    expect(formatUsd(0.0042)).toBe('$0.004');
    expect(formatUsd(0)).toBe('$0.00');
  });
});
