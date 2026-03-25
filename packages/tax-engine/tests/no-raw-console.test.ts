import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('no raw console usage in tax-engine', () => {
  it('ensures source files use logger instead of console.warn/console.error', () => {
    const dir = resolve(__dirname, '../src');
    const files = readdirSync(dir).filter(f => f.endsWith('.ts'));
    for (const file of files) {
      if (file === 'logger.ts' || file.endsWith('.d.ts')) continue;
      const content = readFileSync(resolve(dir, file), 'utf8');
      expect(content.includes('console.warn(')).toBe(false);
      expect(content.includes('console.error(')).toBe(false);
    }
  });
});
