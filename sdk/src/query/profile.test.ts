/**
 * Tests for profile / learnings query handlers (filesystem writes use temp dirs).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { learningsCopy } from './profile.js';

describe('learningsCopy', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'gsd-learn-'));
    await mkdir(join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns zero counts when LEARNINGS.md is missing (matches learnings.cjs)', async () => {
    const result = await learningsCopy([], tmpDir);
    const data = result.data as Record<string, unknown>;
    expect(data.total).toBe(0);
    expect(data.created).toBe(0);
    expect(data.skipped).toBe(0);
  });
});
