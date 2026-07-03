/**
 * Learnings query handlers —
 * profile generation, and knowledge store management.
 *
 * Ported from get-shit-done/bin/lib/profile-pipeline.cjs, profile-output.cjs,
 * and learnings.cjs.
 *
 * @example
 * ```typescript
 * import { scanSessions, profileQuestionnaire } from './profile.js';
 *
 * await scanSessions([], '/project');
 * // { data: { projects: [...], project_count: 5, session_count: 42 } }
 *
 * await profileQuestionnaire([], '/project');
 * // { data: { mode: 'interactive', questions: [...] } } — same shape as gsd-tools.cjs
 * ```
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';

import { planningPaths } from './helpers.js';
import { GSDError, ErrorClassification } from '../errors.js';
import type { QueryHandler } from './utils.js';

// ─── Learnings — ~/.gsd/knowledge/ knowledge store ───────────────────────

const STORE_DIR = join(homedir(), '.gsd', 'knowledge');

function ensureStore(): void {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
}

function learningsWrite(entry: { source_project: string; learning: string; context?: string; tags?: string[] }): { created: boolean; id: string } {
  ensureStore();
  const hash = createHash('sha256').update(entry.learning + '\n' + entry.source_project).digest('hex');
  for (const file of readdirSync(STORE_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const r = JSON.parse(readFileSync(join(STORE_DIR, file), 'utf-8'));
      if (r.content_hash === hash) return { created: false, id: r.id };
    } catch { /* skip */ }
  }
  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  const record = { id, source_project: entry.source_project, date: new Date().toISOString(), context: entry.context ?? '', learning: entry.learning, tags: entry.tags ?? [], content_hash: hash };
  writeFileSync(join(STORE_DIR, `${id}.json`), JSON.stringify(record, null, 2), 'utf-8');
  return { created: true, id };
}

function learningsList(): Array<Record<string, unknown>> {
  if (!existsSync(STORE_DIR)) return [];
  const results: Array<Record<string, unknown>> = [];
  for (const file of readdirSync(STORE_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const record = JSON.parse(readFileSync(join(STORE_DIR, file), 'utf-8'));
      results.push(record);
    } catch { /* skip */ }
  }
  results.sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime());
  return results;
}

/**
 * List all entries in the global learnings store (`~/.gsd/knowledge/`).
 *
 * Port of `cmdLearningsList` from learnings.cjs.
 */
export const learningsListHandler: QueryHandler = async () => {
  const learnings = learningsList();
  return { data: { learnings, count: learnings.length } };
};

/**
 * Query learnings from the global knowledge store, optionally filtered by tag.
 *
 * Port of `cmdLearningsQuery` from learnings.cjs lines 316-323.
 * Called by gsd-planner agent to inject prior learnings into plan generation.
 *
 * Args: --tag <tag> [--limit N]
 */
export const learningsQuery: QueryHandler = async (args) => {
  const tagIdx = args.indexOf('--tag');
  const tag = tagIdx !== -1 ? args[tagIdx + 1] : null;
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined;

  let results = learningsList();
  if (tag) {
    results = results.filter(r => Array.isArray(r.tags) && (r.tags as string[]).includes(tag));
  }
  if (limit && limit > 0) {
    results = results.slice(0, limit);
  }
  return { data: { learnings: results, count: results.length, tag } };
};

export const learningsCopy: QueryHandler = async (_args, projectDir) => {
  const paths = planningPaths(projectDir);
  const learningsPath = join(paths.planning, 'LEARNINGS.md');
  if (!existsSync(learningsPath)) {
    return { data: { copied: false, total: 0, created: 0, skipped: 0, reason: 'No LEARNINGS.md found' } };
  }
  const content = readFileSync(learningsPath, 'utf-8');
  const sourceProject = basename(resolve(projectDir));
  const sections = content.split(/^## /m).slice(1);
  let created = 0; let skipped = 0;

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const title = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();
    if (!body) continue;
    const tags = title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const result = learningsWrite({ source_project: sourceProject, learning: body, context: title, tags });
    if (result.created) created++; else skipped++;
  }
  return { data: { copied: true, total: created + skipped, created, skipped } };
};

/**
 * Prune learnings older than duration (e.g. `90d`). Port of `learningsPrune` from learnings.cjs.
 */
function learningsPruneStore(olderThan: string): { removed: number; kept: number } {
  const match = /^(\d+)d$/.exec(olderThan);
  if (!match) {
    throw new Error(`Invalid duration format: "${olderThan}" — expected format like "90d"`);
  }
  const days = parseInt(match[1], 10);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  if (!existsSync(STORE_DIR)) return { removed: 0, kept: 0 };
  const files = readdirSync(STORE_DIR).filter(f => f.endsWith('.json'));
  let removed = 0;
  let kept = 0;
  for (const file of files) {
    const filePath = join(STORE_DIR, file);
    let record: Record<string, unknown> | null = null;
    try {
      record = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!record?.date) continue;
    const recordDate = new Date(record.date as string);
    if (recordDate < cutoff) {
      unlinkSync(filePath);
      removed++;
    } else {
      kept++;
    }
  }
  return { removed, kept };
}

/** Port of `cmdLearningsPrune`. */
export const learningsPrune: QueryHandler = async (args) => {
  const olderIdx = args.indexOf('--older-than');
  const olderThan = olderIdx !== -1 ? args[olderIdx + 1] : null;
  if (!olderThan) {
    throw new GSDError('Usage: learnings prune --older-than <duration>', ErrorClassification.Validation);
  }
  try {
    return { data: learningsPruneStore(olderThan) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new GSDError(msg, ErrorClassification.Validation);
  }
};

/** Port of `cmdLearningsDelete`. */
export const learningsDelete: QueryHandler = async (args) => {
  const id = args[0];
  if (!id) {
    throw new GSDError('Usage: learnings delete <id>', ErrorClassification.Validation);
  }
  if (!/^[a-z0-9]+-[a-f0-9]+$/.test(id)) {
    throw new GSDError(`Invalid learning ID: "${id}"`, ErrorClassification.Validation);
  }
  const filePath = join(STORE_DIR, `${id}.json`);
  if (!existsSync(filePath)) {
    return { data: { id, deleted: false } };
  }
  unlinkSync(filePath);
  return { data: { id, deleted: true } };
};

// ─── extractMessages — session message extraction for profiling ───────────

/**
 * Extract user messages from Claude Code session files for a given project.
 *
 * Port of `cmdExtractMessages` from profile-pipeline.cjs — JSON matches `gsd-tools extract-messages`
 * (`output_file` JSONL + metadata). Uses `--session` (CJS); `--session-id` is accepted as an alias.
 *
 * @param args - args[0]: project name/keyword (required), `--session <id>`, `--limit N`, `--path <dir>`
 */
