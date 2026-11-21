import { describe, expect, it } from 'vitest';
import { isChain } from '../src/index.js';

describe('isChain', () => {
  it('accepts supported chains only', () => {
    expect(isChain('TRON')).toBe(true);
    expect(isChain('DOGE')).toBe(false);
  });
});
