/**
 * Tests for condensed prior CONTEXT.md history.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { contextHistory } from './context-history.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'gsd-context-history-'));
  await mkdir(join(tmpDir, '.planning'), { recursive: true });
  await mkdir(join(tmpDir, '.planning', 'phases', '01-foundation'), { recursive: true });
  await mkdir(join(tmpDir, '.planning', 'phases', '02-cli'), { recursive: true });
  await mkdir(join(tmpDir, '.planning', 'phases', '03-feed'), { recursive: true });
  await writeFile(
    join(tmpDir, '.planning', 'ROADMAP.md'),
    [
      '## v1.0 Current Milestone',
      '',
      '### Phase 1: Foundation',
      '**Goal:** Establish keyboard and shell interaction rules',
      '',
      '### Phase 2: CLI Output',
      '**Goal:** Define output defaults and JSON mode for the CLI',
      '',
      '### Phase 3: CLI Polish',
      '**Goal:** Improve CLI output behavior, defaults, and JSON interoperability',
    ].join('\n'),
    'utf-8',
  );

  await writeFile(
    join(tmpDir, '.planning', 'phases', '01-foundation', '01-CONTEXT.md'),
    [
      '# Phase 1: Foundation - Context',
      '',
      '<decisions>',
      '## Implementation Decisions',
      '',
      '### Keyboard',
      '- **D-01:** Use Ctrl/Cmd combinations only',
      '- **D-02:** No single-key shortcuts',
      '',
      '### Claude\'s Discretion',
      'Keep fallback bindings conventional.',
      '',
      '</decisions>',
      '',
      '<specifics>',
      '## Specific Ideas',
      '- "Should feel like git CLI"',
      '</specifics>',
    ].join('\n'),
    'utf-8',
  );

  await writeFile(
    join(tmpDir, '.planning', 'phases', '02-cli', '02-CONTEXT.md'),
    [
      '# Phase 2: CLI Output - Context',
      '',
      '## Implementation Decisions',
      '',
      '### Output format',
      '- **D-01:** Default to table output',
      '- **D-02:** Add --json for machine-readable mode',
      '',
      '## Specific Ideas',
      'I want it to feel like pg_dump.',
    ].join('\n'),
    'utf-8',
  );
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('contextHistory', () => {
  it('returns condensed prior context for phases before the current phase', async () => {
    const result = await contextHistory(['03'], tmpDir);
    const data = result.data as {
      prior_contexts: Array<Record<string, unknown>>;
      counts: Record<string, number>;
    };

    expect(data.prior_contexts).toHaveLength(2);
    expect(data.prior_contexts[0].phase).toBe('02');
    expect(data.prior_contexts[0].decisions).toEqual([
      'Output format: Default to table output',
      'Output format: Add --json for machine-readable mode',
    ]);
    expect(Number(data.prior_contexts[0].relevance_score)).toBeGreaterThan(Number(data.prior_contexts[1].relevance_score));
    expect(data.prior_contexts[0].relevance_reasons).toContain('json');
    expect(data.prior_contexts[1].specifics).toEqual([
      '"Should feel like git CLI"',
    ]);
    expect(data.counts.omitted_phases).toBe(0);
  });

  it('honors max item limits and marks truncated entries', async () => {
    const result = await contextHistory(['03', '--max-decisions', '1', '--max-specifics', '0'], tmpDir);
    const data = result.data as {
      prior_contexts: Array<Record<string, unknown>>;
    };

    expect(data.prior_contexts[0].decisions).toEqual([
      'Output format: Default to table output',
    ]);
    expect(data.prior_contexts[0].has_more_decisions).toBe(true);
    expect(data.prior_contexts[0].specifics).toEqual([]);
    expect(data.prior_contexts[1].has_more_specifics).toBe(true);
  });

  it('honors phase limit and reports omitted phases', async () => {
    const result = await contextHistory(['03', '--limit', '1'], tmpDir);
    const data = result.data as {
      prior_contexts: Array<Record<string, unknown>>;
      counts: Record<string, number>;
    };

    expect(data.prior_contexts).toHaveLength(1);
    expect(data.prior_contexts[0].phase).toBe('02');
    expect(data.counts.omitted_phases).toBe(1);
  });

  it('returns phase-not-found error for unknown phase', async () => {
    const result = await contextHistory(['99'], tmpDir);
    const data = result.data as Record<string, unknown>;
    expect(data.error).toBe('Phase not found');
    expect(data.prior_contexts).toEqual([]);
  });

  it('surfaces recurring topics and possible conflicts', async () => {
    await mkdir(join(tmpDir, '.planning', 'phases', '00-legacy'), { recursive: true });
    await writeFile(
      join(tmpDir, '.planning', 'phases', '00-legacy', '00-CONTEXT.md'),
      [
        '# Phase 0: Legacy CLI - Context',
        '',
        '## Implementation Decisions',
        '',
        '### Output format',
        '- **D-01:** Default to JSON output',
      ].join('\n'),
      'utf-8',
    );

    const result = await contextHistory(['03'], tmpDir);
    const data = result.data as {
      recurring_topics: Array<Record<string, unknown>>;
      conflicts: Array<Record<string, unknown>>;
    };

    expect(data.recurring_topics.some((entry) => entry.topic === 'Output format')).toBe(true);
    const outputConflict = data.conflicts.find((entry) => entry.topic === 'Output format');
    expect(outputConflict).toBeTruthy();
    expect(outputConflict?.requires_source_review).toBe(true);
  });
});
