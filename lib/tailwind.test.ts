/* eslint-disable no-constant-binary-expression */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { describe, expect, it } from 'vitest';

import { cn } from './tailwind';

describe('cn', () => {
  it('merges multiple class strings into one', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('resolves Tailwind conflicts by keeping the last value', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('ignores falsy values', () => {
    expect(
      cn('px-2', false && 'py-1', null, undefined, Boolean(0) && 'mt-1'),
    ).toBe('px-2');
  });

  it('returns an empty string when given no input', () => {
    expect(cn()).toBe('');
  });

  it('returns an empty string when all inputs are falsy', () => {
    expect(cn(false, null, undefined)).toBe('');
  });

  it('includes a conditional class when the condition is truthy', () => {
    const active = true;
    expect(cn('base', active && 'active')).toBe('base active');
  });

  it('resolves conflicts across multiple groups', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('handles array inputs', () => {
    expect(cn(['px-2', 'py-1'])).toBe('px-2 py-1');
  });
});
