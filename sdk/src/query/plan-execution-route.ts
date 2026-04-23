/**
 * plan.execution-route — deterministic routing recommendation for execute-plan.
 *
 * Keeps `workflow.inline_plan_threshold` as the hard floor while allowing a
 * conservative low-complexity override for small plans that are slightly above
 * the threshold. This avoids spawning subagents for trivial 3-5 task plans
 * without handing routing decisions back to the LLM.
 */

import { readFile } from 'node:fs/promises';
import { GSDError, ErrorClassification } from '../errors.js';
import { parsePlan } from '../plan-parser.js';
import { resolvePathUnderProject } from './helpers.js';
import type { PlanTask } from '../types.js';
import type { QueryHandler } from './utils.js';

const DEFAULT_INLINE_THRESHOLD = 2;
const MAX_DYNAMIC_INLINE_TASKS = 5;
const MAX_DYNAMIC_INLINE_FILES = 3;
const MAX_DYNAMIC_INLINE_READ_FIRST = 4;
const MAX_DYNAMIC_INLINE_ACCEPTANCE = 4;

type CheckpointMode = 'none' | 'verify_only' | 'decision_or_action';

function parseIntFlag(args: string[], flag: string, fallback: number): number {
  const idx = args.indexOf(flag);
  if (idx === -1) return fallback;
  const raw = args[idx + 1];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedReadFirst(entries: string[]): string[] {
  return entries.filter((entry) => {
    const trimmed = entry.trim().toLowerCase();
    return trimmed !== '' && trimmed !== 'none';
  });
}

function classifyCheckpointMode(tasks: PlanTask[]): CheckpointMode {
  const checkpointTypes = tasks
    .map((task) => task.type)
    .filter((type) => type.toLowerCase().startsWith('checkpoint'));

  if (checkpointTypes.length === 0) {
    return 'none';
  }

  const verifyOnly = checkpointTypes.every((type) => {
    const lowered = type.toLowerCase();
    return lowered.includes('verify');
  });

  return verifyOnly ? 'verify_only' : 'decision_or_action';
}

function uniqueFilesFromPlan(tasks: PlanTask[], frontmatterFiles: string[]): string[] {
  const unique = new Set<string>();
  for (const file of frontmatterFiles) {
    const trimmed = file.trim();
    if (trimmed) unique.add(trimmed);
  }
  for (const task of tasks) {
    for (const file of task.files) {
      const trimmed = file.trim();
      if (trimmed) unique.add(trimmed);
    }
  }
  return [...unique];
}

/**
 * Args: `<path-to-PLAN.md>` [`--inline-threshold N`]
 */
export const planExecutionRoute: QueryHandler = async (args, projectDir) => {
  const rel = args[0];
  if (!rel) {
    throw new GSDError('PLAN.md path required', ErrorClassification.Validation);
  }

  const inlineThreshold = parseIntFlag(args, '--inline-threshold', DEFAULT_INLINE_THRESHOLD);

  let path: string;
  try {
    path = await resolvePathUnderProject(projectDir, rel);
  } catch (err) {
    if (err instanceof GSDError) {
      throw new GSDError(`cannot read plan file: ${err.message}`, ErrorClassification.Blocked);
    }
    throw err;
  }

  let content: string;
  try {
    content = await readFile(path, 'utf-8');
  } catch {
    throw new GSDError(`cannot read plan file: ${rel}`, ErrorClassification.Blocked);
  }

  const parsed = parsePlan(content);
  const checkpointMode = classifyCheckpointMode(parsed.tasks);
  const taskCount = parsed.tasks.length;
  const readFirstCount = parsed.tasks.reduce(
    (sum, task) => sum + normalizedReadFirst(task.read_first).length,
    0,
  );
  const acceptanceCriteriaCount = parsed.tasks.reduce(
    (sum, task) => sum + task.acceptance_criteria.length,
    0,
  );
  const filesModified = uniqueFilesFromPlan(parsed.tasks, parsed.frontmatter.files_modified ?? []);
  const filesModifiedCount = filesModified.length;
  const autonomous = parsed.frontmatter.autonomous !== false;

  const thresholdInline = inlineThreshold > 0 && taskCount <= inlineThreshold;
  const dynamicInlineBand = inlineThreshold > 0
    && taskCount > inlineThreshold
    && taskCount <= MAX_DYNAMIC_INLINE_TASKS;

  let complexityScore = 0;
  const complexitySignals: string[] = [];

  if (checkpointMode !== 'none') {
    complexityScore += 3;
    complexitySignals.push(`checkpoint mode: ${checkpointMode}`);
  }
  if (taskCount > inlineThreshold + 1) {
    complexityScore += 1;
    complexitySignals.push(`task count exceeds threshold by ${taskCount - inlineThreshold}`);
  }
  if (filesModifiedCount > MAX_DYNAMIC_INLINE_FILES) {
    complexityScore += 2;
    complexitySignals.push(`touches ${filesModifiedCount} files`);
  }
  if (readFirstCount > MAX_DYNAMIC_INLINE_READ_FIRST) {
    complexityScore += 2;
    complexitySignals.push(`read_first surface is ${readFirstCount} files`);
  }
  if (acceptanceCriteriaCount > MAX_DYNAMIC_INLINE_ACCEPTANCE) {
    complexityScore += 2;
    complexitySignals.push(`acceptance surface is ${acceptanceCriteriaCount} checks`);
  }
  if (!autonomous && complexityScore > 0) {
    complexityScore -= 1;
    complexitySignals.push('autonomous=false reduces subagent value');
  }

  const lowComplexityChecks = [
    { ok: dynamicInlineBand, reason: `task count ${taskCount} is within dynamic inline band (>${inlineThreshold} and <= ${MAX_DYNAMIC_INLINE_TASKS})` },
    { ok: checkpointMode === 'none', reason: 'no checkpoint tasks' },
    { ok: filesModifiedCount <= MAX_DYNAMIC_INLINE_FILES, reason: `touches ${filesModifiedCount} files (<= ${MAX_DYNAMIC_INLINE_FILES})` },
    { ok: readFirstCount <= MAX_DYNAMIC_INLINE_READ_FIRST, reason: `read_first surface is ${readFirstCount} files (<= ${MAX_DYNAMIC_INLINE_READ_FIRST})` },
    { ok: acceptanceCriteriaCount <= MAX_DYNAMIC_INLINE_ACCEPTANCE, reason: `acceptance surface is ${acceptanceCriteriaCount} checks (<= ${MAX_DYNAMIC_INLINE_ACCEPTANCE})` },
    { ok: taskCount <= 4 || !autonomous, reason: taskCount <= 4 ? 'task count stays within 4-task inline comfort zone' : '5-task plan is non-autonomous, so keeping it inline is safer' },
  ];

  const lowComplexityReasons = lowComplexityChecks.filter((check) => check.ok).map((check) => check.reason);
  const lowComplexityBlockers = lowComplexityChecks.filter((check) => !check.ok).map((check) => check.reason);
  const lowComplexityInline = inlineThreshold > 0 && lowComplexityBlockers.length === 0;

  let recommendedPattern: 'A' | 'B' | 'C' = 'A';
  let recommendedExecution: 'single-subagent' | 'segmented' | 'main-inline' = 'single-subagent';
  let reason = 'autonomous_default';

  if (thresholdInline) {
    recommendedPattern = 'C';
    recommendedExecution = 'main-inline';
    reason = 'task_count_threshold';
  } else if (checkpointMode === 'decision_or_action') {
    recommendedPattern = 'C';
    recommendedExecution = 'main-inline';
    reason = 'decision_checkpoint';
  } else if (checkpointMode === 'verify_only') {
    recommendedPattern = 'B';
    recommendedExecution = 'segmented';
    reason = 'verify_checkpoints';
  } else if (lowComplexityInline) {
    recommendedPattern = 'C';
    recommendedExecution = 'main-inline';
    reason = 'low_complexity_override';
  }

  return {
    data: {
      path: rel,
      phase: parsed.frontmatter.phase || null,
      plan: parsed.frontmatter.plan || null,
      inline_threshold: inlineThreshold,
      task_count: taskCount,
      autonomous,
      checkpoint_mode: checkpointMode,
      files_modified_count: filesModifiedCount,
      files_modified: filesModified,
      read_first_count: readFirstCount,
      acceptance_criteria_count: acceptanceCriteriaCount,
      threshold_inline: thresholdInline,
      dynamic_inline_band: dynamicInlineBand,
      low_complexity_inline: lowComplexityInline,
      low_complexity_reasons: lowComplexityReasons,
      low_complexity_blockers: lowComplexityBlockers,
      complexity_score: complexityScore,
      complexity_signals: complexitySignals,
      recommended_pattern: recommendedPattern,
      recommended_execution: recommendedExecution,
      reason,
    },
  };
};
