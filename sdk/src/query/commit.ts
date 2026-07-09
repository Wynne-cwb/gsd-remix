/**
 * Git commit and check-commit query handlers.
 *
 * Ported from get-shit-done/bin/lib/commands.cjs (cmdCommit, cmdCheckCommit)
 * and core.cjs (execGit). Provides commit creation with message sanitization
 * and pre-commit validation.
 *
 * @example
 * ```typescript
 * import { commit, checkCommit } from './commit.js';
 *
 * await commit(['docs: update state', '.planning/STATE.md'], '/project');
 * // { data: { committed: true, hash: 'abc1234', message: 'docs: update state', files: [...] } }
 *
 * await checkCommit([], '/project');
 * // { data: { can_commit: true, reason: 'commit_docs_enabled', ... } }
 * ```
 */

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { GSDError } from '../errors.js';
import { planningPaths, resolvePathUnderProject } from './helpers.js';
import type { QueryHandler } from './utils.js';

// ─── execGit ──────────────────────────────────────────────────────────────

/**
 * Run a git command in the given working directory.
 *
 * Ported from core.cjs lines 531-542.
 *
 * @param cwd - Working directory for the git command
 * @param args - Git command arguments (e.g., ['commit', '-m', 'msg'])
 * @returns Object with exitCode, stdout, and stderr
 */
export function execGit(cwd: string, args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync('git', args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
  });
  return {
    exitCode: result.status ?? 1,
    stdout: (result.stdout ?? '').toString().trim(),
    stderr: (result.stderr ?? '').toString().trim(),
  };
}

// ─── sanitizeCommitMessage ────────────────────────────────────────────────

/**
 * Sanitize a commit message to prevent prompt injection.
 *
 * Ported from security.cjs sanitizeForPrompt.
 * Strips zero-width characters, null bytes, and neutralizes
 * known injection markers that could hijack agent context.
 *
 * @param text - Raw commit message
 * @returns Sanitized message safe for git commit
 */
export function sanitizeCommitMessage(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text;

  // Strip null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Strip zero-width characters that could hide instructions
  sanitized = sanitized.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, '');

  // Neutralize XML/HTML tags that mimic system boundaries
  sanitized = sanitized.replace(/<(\/?)?(?:system|assistant|human)>/gi,
    (_match, slash) => `\uFF1C${slash || ''}system-text\uFF1E`);

  // Neutralize [SYSTEM] / [INST] markers
  sanitized = sanitized.replace(/\[(SYSTEM|INST)\]/gi, '[$1-TEXT]');

  // Neutralize <<SYS>> markers
  sanitized = sanitized.replace(/<<\s*SYS\s*>>/gi, '\u00ABSYS-TEXT\u00BB');

  return sanitized;
}

// ─── commit ───────────────────────────────────────────────────────────────

/**
 * Stage files and create a git commit.
 *
 * Checks commit_docs config (unless --force), sanitizes message,
 * stages specified files (or all .planning/), and commits.
 *
 * @param args - args[0]=message, remaining=file paths or flags (--force, --amend, --no-verify)
 * @param projectDir - Project root directory
 * @returns QueryResult with commit result
 */
export const commit: QueryHandler = async (args, projectDir) => {
  const allArgs = [...args];

  // Extract flags
  const hasForce = allArgs.includes('--force');
  const hasAmend = allArgs.includes('--amend');
  const hasNoVerify = allArgs.includes('--no-verify');
  const filesIndex = allArgs.indexOf('--files');
  const endIndex = filesIndex !== -1 ? filesIndex : allArgs.length;
  // CodeRabbit #6: don't strip arbitrary `--foo` tokens from commit messages
  const knownFlags = new Set(['--force', '--amend', '--no-verify']);
  const messageArgs = allArgs.slice(0, endIndex).filter(a => !knownFlags.has(a));
  const message = messageArgs.join(' ') || undefined;
  const filePaths =
    filesIndex !== -1 ? allArgs.slice(filesIndex + 1).filter(a => !a.startsWith('--')) : [];

  if (!message && !hasAmend) {
    return { data: { committed: false, reason: 'commit message required' } };
  }

  // Check commit_docs config unless --force
  if (!hasForce) {
    const paths = planningPaths(projectDir);
    try {
      const raw = await readFile(paths.config, 'utf-8');
      const config = JSON.parse(raw) as Record<string, unknown>;
      if (config.commit_docs === false) {
        return { data: { committed: false, reason: 'commit_docs disabled' } };
      }
    } catch {
      // No config or malformed — allow commit
    }
  }

  // Sanitize message
  const sanitized = message ? sanitizeCommitMessage(message) : message;

  // A8: validate caller-supplied paths stay within the project (parity with
  // commitToSubrepo). git itself rejects out-of-repo paths, but this makes the
  // trust boundary explicit and returns a clean validation error instead of a
  // confusing git failure.
  for (const file of filePaths) {
    try {
      await resolvePathUnderProject(projectDir, file);
    } catch (err) {
      if (err instanceof GSDError) {
        return { data: { committed: false, reason: `${err.message}: ${file}` } };
      }
      throw err;
    }
  }

  // Stage files
  const filesToStage = filePaths.length > 0 ? filePaths : ['.planning/'];
  for (const file of filesToStage) {
    const addResult = execGit(projectDir, ['add', file]);
    if (addResult.exitCode !== 0) {
      return { data: { committed: false, reason: addResult.stderr || `failed to stage ${file}`, exitCode: addResult.exitCode } };
    }
  }

  // Check if anything is staged
  const diffResult = execGit(projectDir, ['diff', '--cached', '--name-only']);
  const stagedFiles = diffResult.stdout ? diffResult.stdout.split('\n').filter(Boolean) : [];
  if (stagedFiles.length === 0) {
    return { data: { committed: false, reason: 'nothing staged' } };
  }

  // Build commit command
  const commitArgs: string[] = hasAmend
    ? ['commit', '--amend', '--no-edit']
    : ['commit', '-m', sanitized ?? ''];
  if (hasNoVerify) commitArgs.push('--no-verify');

  const commitResult = execGit(projectDir, commitArgs);
  if (commitResult.exitCode !== 0) {
    if (commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit')) {
      return { data: { committed: false, reason: 'nothing to commit' } };
    }
    return { data: { committed: false, reason: commitResult.stderr || 'commit failed', exitCode: commitResult.exitCode } };
  }

  // Get short hash
  const hashResult = execGit(projectDir, ['rev-parse', '--short', 'HEAD']);
  const hash = hashResult.exitCode === 0 ? hashResult.stdout : null;

  return { data: { committed: true, hash, message: sanitized, files: stagedFiles } };
};

// ─── checkCommit ──────────────────────────────────────────────────────────

/**
 * Validate whether a commit can proceed.
 *
 * Checks commit_docs config and staged file state.
 *
 * @param _args - Unused
 * @param projectDir - Project root directory
 * @returns QueryResult with { can_commit, reason, commit_docs, staged_files }
 */
export const checkCommit: QueryHandler = async (_args, projectDir) => {
  const paths = planningPaths(projectDir);

  let commitDocs = true;
  try {
    const raw = await readFile(paths.config, 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    if (config.commit_docs === false) {
      commitDocs = false;
    }
  } catch {
    // No config — default to allowing commits
  }

  // Check staged files
  const diffResult = execGit(projectDir, ['diff', '--cached', '--name-only']);
  const stagedFiles = diffResult.stdout ? diffResult.stdout.split('\n').filter(Boolean) : [];

  if (!commitDocs) {
    // If commit_docs is false, check if any .planning/ files are staged
    const planningFiles = stagedFiles.filter(f => f.startsWith('.planning/') || f.startsWith('.planning\\'));
    if (planningFiles.length > 0) {
      return {
        data: {
          allowed: false,
          can_commit: false,
          reason: `commit_docs is false but ${planningFiles.length} .planning/ file(s) are staged`,
          commit_docs: false,
          staged_files: planningFiles,
        },
      };
    }
  }

  return {
    data: {
      allowed: true,
      can_commit: true,
      reason: commitDocs ? 'commit_docs_enabled' : 'no_planning_files_staged',
      commit_docs: commitDocs,
      staged_files: stagedFiles,
    },
  };
};

// ─── commitToSubrepo ─────────────────────────────────────────────────────

interface SubrepoResult {
  committed: boolean;
  hash: string | null;
  files: string[];
  reason?: string;
  error?: string;
}

/**
 * Route files to their sub-repos and commit inside each one.
 *
 * Mirrors commands.cjs cmdCommitToSubrepo: groups files by sub-repo prefix,
 * stages/commits inside projectDir/<repo>, and returns per-repo hashes in
 * the shape gsd-executor.md expects: { committed, repos: { name: { hash, files } } }.
 * Reads sub_repos from top-level config or the planning.sub_repos section.
 */
export const commitToSubrepo: QueryHandler = async (args, projectDir) => {
  const filesIdx = args.indexOf('--files');
  const endIdx = filesIdx >= 0 ? filesIdx : args.length;
  const knownFlags = new Set(['--force', '--amend', '--no-verify']);
  const messageArgs = args.slice(0, endIdx).filter(a => !knownFlags.has(a));
  const message = messageArgs.join(' ') || undefined;
  const files = filesIdx >= 0 ? args.slice(filesIdx + 1).filter(a => !a.startsWith('--')) : [];

  if (!message) {
    return { data: { committed: false, reason: 'commit message required' } };
  }

  const paths = planningPaths(projectDir);
  let config: Record<string, unknown> = {};
  try {
    const raw = await readFile(paths.config, 'utf-8');
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* no config */
  }
  const planning = config.planning as Record<string, unknown> | undefined;
  const subRepos = (config.sub_repos ?? planning?.sub_repos) as string[] | undefined;
  if (!subRepos || subRepos.length === 0) {
    return {
      data: { committed: false, reason: 'no sub_repos configured in .planning/config.json' },
    };
  }

  if (files.length === 0) {
    return { data: { committed: false, reason: '--files required for commit-to-subrepo' } };
  }

  const sanitized = sanitizeCommitMessage(message);
  if (!sanitized && message) {
    return { data: { committed: false, reason: 'commit message empty after sanitization' } };
  }

  try {
    for (const file of files) {
      try {
        await resolvePathUnderProject(projectDir, file);
      } catch (err) {
        if (err instanceof GSDError) {
          return { data: { committed: false, reason: `${err.message}: ${file}` } };
        }
        throw err;
      }
    }

    // Group files by sub-repo prefix
    const grouped: Record<string, string[]> = {};
    const unmatched: string[] = [];
    for (const file of files) {
      const match = subRepos.find(repo => file.startsWith(repo + '/'));
      if (match) {
        (grouped[match] ??= []).push(file);
      } else {
        unmatched.push(file);
      }
    }

    const repos: Record<string, SubrepoResult> = {};
    for (const [repo, repoFiles] of Object.entries(grouped)) {
      const repoCwd = join(projectDir, repo);

      // Stage files (strip sub-repo prefix for paths relative to that repo)
      let addError: string | null = null;
      for (const file of repoFiles) {
        const addResult = execGit(repoCwd, ['add', file.slice(repo.length + 1)]);
        if (addResult.exitCode !== 0) {
          addError = addResult.stderr || `failed to stage ${file}`;
          break;
        }
      }
      if (addError) {
        repos[repo] = { committed: false, hash: null, files: repoFiles, reason: 'error', error: addError };
        continue;
      }

      const commitResult = execGit(repoCwd, ['commit', '-m', sanitized]);
      if (commitResult.exitCode !== 0) {
        if (commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit')) {
          repos[repo] = { committed: false, hash: null, files: repoFiles, reason: 'nothing_to_commit' };
          continue;
        }
        repos[repo] = { committed: false, hash: null, files: repoFiles, reason: 'error', error: commitResult.stderr };
        continue;
      }

      const hashResult = execGit(repoCwd, ['rev-parse', '--short', 'HEAD']);
      repos[repo] = {
        committed: true,
        hash: hashResult.exitCode === 0 ? hashResult.stdout : null,
        files: repoFiles,
      };
    }

    return {
      data: {
        committed: Object.values(repos).some(r => r.committed),
        repos,
        message: sanitized,
        ...(unmatched.length > 0 ? { unmatched } : {}),
      },
    };
  } catch (err) {
    return { data: { committed: false, reason: String(err) } };
  }
};
