/**
 * Unit tests for git commit and check-commit query handlers.
 *
 * Tests: execGit, sanitizeCommitMessage, commit, checkCommit.
 * Uses real git repos in temp directories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

// ─── Test setup ─────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'gsd-commit-'));
  // Initialize a git repo
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });
  // Create .planning directory
  await mkdir(join(tmpDir, '.planning'), { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ─── execGit ───────────────────────────────────────────────────────────────

describe('execGit', () => {
  it('returns exitCode 0 for successful command', async () => {
    const { execGit } = await import('./commit.js');
    const result = execGit(tmpDir, ['status']);
    expect(result.exitCode).toBe(0);
  });

  it('returns non-zero exitCode for failed command', async () => {
    const { execGit } = await import('./commit.js');
    const result = execGit(tmpDir, ['log', '--oneline']);
    // git log fails in empty repo with no commits
    expect(result.exitCode).not.toBe(0);
  });

  it('captures stdout from git command', async () => {
    const { execGit } = await import('./commit.js');
    const result = execGit(tmpDir, ['rev-parse', '--git-dir']);
    expect(result.stdout).toBe('.git');
  });
});

// ─── sanitizeCommitMessage ─────────────────────────────────────────────────

describe('sanitizeCommitMessage', () => {
  it('strips null bytes and zero-width characters', async () => {
    const { sanitizeCommitMessage } = await import('./commit.js');
    const result = sanitizeCommitMessage('hello\u0000\u200Bworld');
    expect(result).toBe('helloworld');
  });

  it('neutralizes injection markers', async () => {
    const { sanitizeCommitMessage } = await import('./commit.js');
    const result = sanitizeCommitMessage('fix: update <system> prompt [SYSTEM] test');
    expect(result).not.toContain('<system>');
    expect(result).not.toContain('[SYSTEM]');
  });

  it('preserves normal commit messages', async () => {
    const { sanitizeCommitMessage } = await import('./commit.js');
    const result = sanitizeCommitMessage('feat(auth): add login endpoint');
    expect(result).toBe('feat(auth): add login endpoint');
  });

  it('returns input unchanged for non-string', async () => {
    const { sanitizeCommitMessage } = await import('./commit.js');
    expect(sanitizeCommitMessage('')).toBe('');
  });
});

// ─── commit ────────────────────────────────────────────────────────────────

describe('commit', () => {
  it('returns committed:false when commit_docs is false and no --force', async () => {
    const { commit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: false }),
    );
    const result = await commit(['test commit message'], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(false);
    expect((result.data as { reason: string }).reason).toContain('commit_docs');
  });

  it('creates commit with --force even when commit_docs is false', async () => {
    const { commit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: false }),
    );
    await writeFile(join(tmpDir, '.planning', 'STATE.md'), '# State\n');
    const result = await commit(['test commit', '--force'], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(true);
    expect((result.data as { hash: string }).hash).toBeTruthy();
  });

  it('stages files and creates commit with correct message', async () => {
    const { commit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: true }),
    );
    await writeFile(join(tmpDir, '.planning', 'STATE.md'), '# State\n');
    const result = await commit(['docs: update state'], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(true);
    expect((result.data as { hash: string }).hash).toBeTruthy();

    // Verify commit message in git log
    const log = execSync('git log -1 --format=%s', { cwd: tmpDir, encoding: 'utf-8' }).trim();
    expect(log).toBe('docs: update state');
  });

  it('returns nothing staged when no files match', async () => {
    const { commit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: true }),
    );
    // Stage config.json first then commit it so .planning/ has no unstaged changes
    execSync('git add .planning/config.json', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
    // Now commit with specific nonexistent file (--files separates message from paths, matching CJS argv)
    const result = await commit(['test msg', '--files', 'nonexistent-file.txt'], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(false);
    expect((result.data as { reason: string }).reason).toContain('nonexistent-file.txt');
  });

  it('commits specific files when provided', async () => {
    const { commit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: true }),
    );
    await writeFile(join(tmpDir, '.planning', 'STATE.md'), '# State\n');
    await writeFile(join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n');
    const result = await commit(['docs: state only', '--files', '.planning/STATE.md'], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(true);

    // Verify only STATE.md was committed
    const files = execSync('git show --name-only --format=', { cwd: tmpDir, encoding: 'utf-8' }).trim();
    expect(files).toContain('STATE.md');
    expect(files).not.toContain('ROADMAP.md');
  });
});

// ─── checkCommit ───────────────────────────────────────────────────────────

describe('checkCommit', () => {
  it('returns can_commit:true when commit_docs is enabled', async () => {
    const { checkCommit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: true }),
    );
    const result = await checkCommit([], tmpDir);
    expect((result.data as { can_commit: boolean }).can_commit).toBe(true);
  });

  it('returns can_commit:true when commit_docs is not set', async () => {
    const { checkCommit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({}),
    );
    const result = await checkCommit([], tmpDir);
    expect((result.data as { can_commit: boolean }).can_commit).toBe(true);
  });

  it('returns can_commit:false when commit_docs is false and planning files staged', async () => {
    const { checkCommit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: false }),
    );
    await writeFile(join(tmpDir, '.planning', 'STATE.md'), '# State\n');
    execSync('git add .planning/STATE.md', { cwd: tmpDir, stdio: 'pipe' });
    const result = await checkCommit([], tmpDir);
    expect((result.data as { can_commit: boolean }).can_commit).toBe(false);
  });

  it('returns can_commit:true when commit_docs is false but no planning files staged', async () => {
    const { checkCommit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: false }),
    );
    const result = await checkCommit([], tmpDir);
    expect((result.data as { can_commit: boolean }).can_commit).toBe(true);
  });
});

// ─── commitToSubrepo ───────────────────────────────────────────────────────

interface SubrepoData {
  committed: boolean;
  repos?: Record<string, { committed: boolean; hash: string | null; files: string[]; reason?: string }>;
  unmatched?: string[];
  reason?: string;
}

async function makeSubrepo(root: string, name: string, files: Record<string, string>): Promise<void> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: 'pipe' });
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(join(dir, dirname(rel)), { recursive: true });
    await writeFile(join(dir, rel), content);
  }
}

describe('commitToSubrepo', () => {
  it('commits a cross-repo change inside each sub-repo and returns per-repo hashes', async () => {
    const { commitToSubrepo } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ sub_repos: ['backend', 'frontend'], commit_docs: false }),
    );
    await makeSubrepo(tmpDir, 'backend', { 'src/app.js': 'console.log("api")\n' });
    await makeSubrepo(tmpDir, 'frontend', { 'src/index.js': 'console.log("ui")\n' });

    const result = await commitToSubrepo(
      ['feat(01-01): cross-repo change', '--files', 'backend/src/app.js', 'frontend/src/index.js'],
      tmpDir,
    );
    const data = result.data as SubrepoData;

    expect(data.committed).toBe(true);
    expect(data.repos?.backend.committed).toBe(true);
    expect(data.repos?.backend.hash).toBeTruthy();
    expect(data.repos?.backend.files).toEqual(['backend/src/app.js']);
    expect(data.repos?.frontend.committed).toBe(true);
    expect(data.repos?.frontend.hash).toBeTruthy();

    // Commits landed inside each sub-repo, with the sub-repo-relative path
    const backendLog = execSync('git log -1 --format=%s', { cwd: join(tmpDir, 'backend'), encoding: 'utf-8' }).trim();
    expect(backendLog).toBe('feat(01-01): cross-repo change');
    const backendFiles = execSync('git show --name-only --format=', { cwd: join(tmpDir, 'backend'), encoding: 'utf-8' }).trim();
    expect(backendFiles).toBe('src/app.js');
    const frontendLog = execSync('git log -1 --format=%s', { cwd: join(tmpDir, 'frontend'), encoding: 'utf-8' }).trim();
    expect(frontendLog).toBe('feat(01-01): cross-repo change');

    // Root repo untouched: no commits, nothing staged
    expect(() => execSync('git log -1', { cwd: tmpDir, stdio: 'pipe' })).toThrow();
    const rootStaged = execSync('git diff --cached --name-only', { cwd: tmpDir, encoding: 'utf-8' }).trim();
    expect(rootStaged).toBe('');
  });

  it('reads sub_repos from the planning section when top-level key is absent', async () => {
    const { commitToSubrepo } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ planning: { sub_repos: ['backend'] } }),
    );
    await makeSubrepo(tmpDir, 'backend', { 'main.go': 'package main\n' });

    const result = await commitToSubrepo(['fix: backend only', '--files', 'backend/main.go'], tmpDir);
    const data = result.data as SubrepoData;

    expect(data.committed).toBe(true);
    expect(data.repos?.backend.hash).toBeTruthy();
  });

  it('reports unmatched files and does not commit them at the root', async () => {
    const { commitToSubrepo } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ sub_repos: ['backend'] }),
    );
    await makeSubrepo(tmpDir, 'backend', { 'main.go': 'package main\n' });
    await writeFile(join(tmpDir, 'rootfile.txt'), 'not in any sub-repo\n');

    const result = await commitToSubrepo(
      ['feat: mixed paths', '--files', 'backend/main.go', 'rootfile.txt'],
      tmpDir,
    );
    const data = result.data as SubrepoData;

    expect(data.committed).toBe(true);
    expect(data.repos?.backend.committed).toBe(true);
    expect(data.unmatched).toEqual(['rootfile.txt']);
    // Unmatched file was not committed anywhere
    expect(() => execSync('git log -1', { cwd: tmpDir, stdio: 'pipe' })).toThrow();
  });

  it('returns committed:false with unmatched list when no file matches any sub-repo', async () => {
    const { commitToSubrepo } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ sub_repos: ['backend'] }),
    );
    await makeSubrepo(tmpDir, 'backend', {});
    await writeFile(join(tmpDir, 'rootfile.txt'), 'root\n');

    const result = await commitToSubrepo(['feat: nothing matches', '--files', 'rootfile.txt'], tmpDir);
    const data = result.data as SubrepoData;

    expect(data.committed).toBe(false);
    expect(data.repos).toEqual({});
    expect(data.unmatched).toEqual(['rootfile.txt']);
  });

  it('marks a repo nothing_to_commit when its files are already committed', async () => {
    const { commitToSubrepo } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ sub_repos: ['backend'] }),
    );
    await makeSubrepo(tmpDir, 'backend', { 'main.go': 'package main\n' });

    const first = await commitToSubrepo(['feat: initial', '--files', 'backend/main.go'], tmpDir);
    expect((first.data as SubrepoData).committed).toBe(true);

    const second = await commitToSubrepo(['feat: repeat', '--files', 'backend/main.go'], tmpDir);
    const data = second.data as SubrepoData;
    expect(data.committed).toBe(false);
    expect(data.repos?.backend.reason).toBe('nothing_to_commit');
  });

  it('rejects paths that escape the project directory', async () => {
    const { commitToSubrepo } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ sub_repos: ['backend'] }),
    );
    await makeSubrepo(tmpDir, 'backend', {});

    const result = await commitToSubrepo(['feat: escape', '--files', '../outside.txt'], tmpDir);
    const data = result.data as SubrepoData;
    expect(data.committed).toBe(false);
    expect(data.reason).toContain('escapes');
  });

  it('returns committed:false when no sub_repos are configured', async () => {
    const { commitToSubrepo } = await import('./commit.js');
    await writeFile(join(tmpDir, '.planning', 'config.json'), JSON.stringify({ commit_docs: true }));

    const result = await commitToSubrepo(['feat: no subrepos', '--files', 'a.txt'], tmpDir);
    const data = result.data as SubrepoData;
    expect(data.committed).toBe(false);
    expect(data.reason).toContain('no sub_repos');
  });
});
