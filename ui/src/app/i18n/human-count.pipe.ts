import { Pipe, PipeTransform } from '@angular/core';

/** Format account totals compactly once they are too large to scan at a glance. */
export function humanCount(value: number): string {
  if (value <= 15_000) {
    return value.toLocaleString('en-US');
  }
  if (value < 1_000_000) {
    const digits = value < 100_000 ? 1 : 0;
    return `${(value / 1_000).toFixed(digits).replace(/\.0$/, '')}k`;
  }
  const digits = value < 100_000_000 ? 1 : 0;
  return `${(value / 1_000_000).toFixed(digits).replace(/\.0$/, '')}m`;
}

@Pipe({ name: 'humanCount' })
export class HumanCountPipe implements PipeTransform {
  transform(value: number): string {
    return humanCount(value);
  }
}
