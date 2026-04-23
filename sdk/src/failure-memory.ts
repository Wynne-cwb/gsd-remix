import { existsSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type { PlanResult, SessionUsage } from './types.js';
import { extractFrontmatterLeading } from './query/frontmatter.js';
import { planningPaths, normalizePhaseName, phaseTokenMatches } from './query/helpers.js';
import { checkVerificationStatus } from './query/check-verification-status.js';

export type FailureEventKind =
  | 'session_error'
  | 'summary_issue'
  | 'summary_self_check'
  | 'verification_status'
  | 'blocking_antipattern';

export type FailureSeverity = 'advisory' | 'blocking';

export interface FailureEvent {
  version: '1.0';
  recorded_at: string;
  kind: FailureEventKind;
  severity: FailureSeverity;
  phase_number?: string;
  phase_name?: string;
  phase_dir?: string;
  step?: string;
  plan_id?: string;
  session_id?: string;
  summary: string;
  details: string[];
  source: {
    type: 'session_result' | 'summary' | 'verification' | 'continue_here';
    path?: string;
  };
  error_subtype?: string;
  status?: string;
  total_cost_usd?: number;
  num_turns?: number;
  usage?: SessionUsage;
  fingerprint: string;
}

export interface FailureMemoryPaths {
  directory: string;
  events: string;
  index: string;
  overview: string;
}

export interface FailureEventContext {
  phaseNumber?: string;
  phaseName?: string;
  phaseDir?: string;
  step?: string;
  planId?: string;
}

export type FailureMemoryStatus = 'candidate' | 'promoted';

export interface FailureMemoryEvidence {
  recorded_at: string;
  phase_number?: string;
  plan_id?: string;
  source_path?: string;
  summary: string;
  details: string[];
}

export interface FailureMemoryEntry {
  version: '1.0';
  id: string;
  signature: string;
  title: string;
  kind: FailureEventKind;
  severity: FailureSeverity;
  status: FailureMemoryStatus;
  summary: string;
  evidence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  phase_numbers: string[];
  source_paths: string[];
  prevention_signals: string[];
  promotion_reason?: string;
  evidence: FailureMemoryEvidence[];
}

export interface FailureMemoryIndex {
  version: '1.0';
  updated_at: string;
  entries: FailureMemoryEntry[];
}

export interface FailurePromotionResult {
  paths: FailureMemoryPaths;
  index: FailureMemoryIndex;
  touched_entry_ids: string[];
  promoted_entry_ids: string[];
  candidate_entry_ids: string[];
}

export type FailurePreflightCheckStatus = 'pass' | 'warn' | 'block' | 'skip';

export interface FailurePreflightCheck {
  id: string;
  status: FailurePreflightCheckStatus;
  summary: string;
  details: string[];
  memory_ids: string[];
}

export interface FailurePreflightResult {
  checks: FailurePreflightCheck[];
  blockers: FailurePreflightCheck[];
  warnings: FailurePreflightCheck[];
  passed: boolean;
  recommended_package_manager?: string;
  expected_node_version?: string;
  related_memory_ids: string[];
}

interface ContinueHereRow {
  pattern: string;
  description: string;
  severity: string;
  prevention: string;
}

function toRelativeProjectPath(projectDir: string, fullPath: string): string {
  const rel = relative(projectDir, fullPath);
  return rel === '' ? '.' : rel.replaceAll('\\', '/');
}

function failureMemoryPaths(projectDir: string): FailureMemoryPaths {
  const directory = join(planningPaths(projectDir).planning, 'failure-memory');
  return {
    directory,
    events: join(directory, 'events.jsonl'),
    index: join(directory, 'index.json'),
    overview: join(planningPaths(projectDir).planning, 'FAILURE-MEMORY.md'),
  };
}

function failureMemoryEntryPath(projectDir: string, id: string): string {
  return join(failureMemoryPaths(projectDir).directory, `${id}.md`);
}

function buildFingerprint(event: Omit<FailureEvent, 'fingerprint'>): string {
  return [
    event.kind,
    event.phase_number ?? '',
    event.phase_name ?? '',
    event.phase_dir ?? '',
    event.step ?? '',
    event.plan_id ?? '',
    event.session_id ?? '',
    event.source.type,
    event.source.path ?? '',
    event.error_subtype ?? '',
    event.status ?? '',
    event.summary,
    ...event.details,
  ].join('::');
}

function finalizeEvent(event: Omit<FailureEvent, 'fingerprint'>): FailureEvent {
  return {
    ...event,
    fingerprint: buildFingerprint(event),
  };
}

function normalizeLines(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[-*+]\s+/, '').trim());
}

function normalizeSignatureText(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/\b\d{2}(?:-\d{2})?-summary\.md\b/g, 'summary')
    .replace(/\b\d{2}-verification\.md\b/g, 'verification')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(text: string): string {
  if (!text) return text;
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(token => token[0]?.toUpperCase() + token.slice(1))
    .join(' ');
}

function sentenceCase(text: string): string {
  if (!text) return text;
  return text[0].toUpperCase() + text.slice(1);
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function limitEvidenceSamples(events: FailureEvent[]): FailureMemoryEvidence[] {
  const sorted = [...events]
    .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    .slice(0, 5);

  return sorted.map(event => ({
    recorded_at: event.recorded_at,
    phase_number: event.phase_number,
    plan_id: event.plan_id,
    source_path: event.source.path,
    summary: event.summary,
    details: event.details.slice(0, 4),
  }));
}

function buildFailureSignature(event: FailureEvent): string {
  switch (event.kind) {
    case 'blocking_antipattern': {
      const pattern = event.summary.replace(/^Blocking anti-pattern:\s*/i, '').trim();
      return `${event.kind}::${normalizeSignatureText(pattern || event.details[0] || event.summary)}`;
    }
    case 'session_error': {
      const detail = event.details[0] || event.summary;
      return `${event.kind}::${event.error_subtype ?? 'unknown'}::${normalizeSignatureText(detail)}`;
    }
    case 'verification_status':
      return `${event.kind}::${event.status ?? 'unknown'}`;
    case 'summary_self_check':
    case 'summary_issue': {
      const detail = event.details[0] || event.summary;
      return `${event.kind}::${normalizeSignatureText(detail)}`;
    }
    default:
      return `${event.kind}::${normalizeSignatureText(event.summary)}`;
  }
}

function buildFailureTitle(event: FailureEvent): string {
  switch (event.kind) {
    case 'blocking_antipattern':
      return event.summary.replace(/^Blocking anti-pattern:\s*/i, '').trim() || 'Blocking Anti-Pattern';
    case 'session_error':
      return `Execution Error: ${titleCase((event.error_subtype ?? 'unknown').replaceAll('_', ' '))}`;
    case 'verification_status':
      return `Verification ${titleCase((event.status ?? 'unknown').replaceAll('_', ' '))}`;
    case 'summary_self_check':
      return 'Summary Self-Check Failure';
    case 'summary_issue':
      return 'Execution Issue';
    default:
      return sentenceCase(event.summary);
  }
}

function buildFailureSummary(event: FailureEvent): string {
  switch (event.kind) {
    case 'blocking_antipattern':
      return sentenceCase(event.details[0] || event.summary);
    case 'session_error':
      return sentenceCase(event.details[0] || event.summary);
    case 'verification_status':
      return `Verification ended with status \`${event.status ?? 'unknown'}\`.`;
    case 'summary_self_check':
    case 'summary_issue':
      return sentenceCase(event.details[0] || event.summary);
    default:
      return sentenceCase(event.summary);
  }
}

function collectPreventionSignals(events: FailureEvent[]): string[] {
  const signals: string[] = [];
  for (const event of events) {
    if (event.kind === 'blocking_antipattern' && event.details[1]) {
      signals.push(event.details[1]);
    }
  }
  return uniqueSorted(signals.map(signal => signal.trim()).filter(Boolean));
}

function determinePromotionStatus(events: FailureEvent[]): { status: FailureMemoryStatus; reason?: string } {
  if (events.some(event => event.kind === 'blocking_antipattern')) {
    return {
      status: 'promoted',
      reason: 'Explicit blocking anti-pattern captured from pause/continue handoff.',
    };
  }

  if (events.length >= 2) {
    return {
      status: 'promoted',
      reason: `Repeated ${events.length} times across captured failure evidence.`,
    };
  }

  return { status: 'candidate' };
}

async function readFailureEvents(projectDir: string): Promise<FailureEvent[]> {
  const paths = failureMemoryPaths(projectDir);
  if (!existsSync(paths.events)) return [];

  let content = '';
  try {
    content = await readFile(paths.events, 'utf-8');
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const events: FailureEvent[] = [];
  for (const line of content.split('\n').map(row => row.trim()).filter(Boolean)) {
    try {
      const event = JSON.parse(line) as FailureEvent;
      if (!event.fingerprint || seen.has(event.fingerprint)) continue;
      seen.add(event.fingerprint);
      events.push(event);
    } catch {
      // Ignore malformed rows; failure-memory should remain best-effort.
    }
  }

  return events.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
}

async function readFailureMemoryIndex(projectDir: string): Promise<FailureMemoryIndex | null> {
  const paths = failureMemoryPaths(projectDir);
  if (!existsSync(paths.index)) return null;
  try {
    return JSON.parse(await readFile(paths.index, 'utf-8')) as FailureMemoryIndex;
  } catch {
    return null;
  }
}

function memorySearchText(entry: FailureMemoryEntry): string {
  return [
    entry.title,
    entry.summary,
    ...entry.prevention_signals,
    ...entry.evidence.flatMap(item => [item.summary, ...item.details]),
  ]
    .join(' ')
    .toLowerCase();
}

function hasAnyNeedle(entry: FailureMemoryEntry, needles: string[]): boolean {
  const haystack = memorySearchText(entry);
  return needles.some(needle => haystack.includes(needle));
}

interface RepoPackageManagerInfo {
  expected?: string;
  source?: string;
  lockfiles: string[];
}

interface RepoNodeVersionInfo {
  expected?: string;
  source?: string;
  current: string;
  matches: boolean;
}

interface RepoScriptsInfo {
  scripts: Record<string, string>;
  source?: string;
}

interface RepoEnvTemplateInfo {
  template_path?: string;
  variable_names: string[];
  configured_variables: string[];
}

function extractPackageManagerName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.split('@')[0]?.trim() || undefined;
}

function detectLockfiles(projectDir: string): string[] {
  const candidates = [
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'bun.lockb',
    'bun.lock',
  ];
  return candidates.filter(file => existsSync(join(projectDir, file)));
}

function packageManagerForLockfile(lockfile: string): string | undefined {
  switch (lockfile) {
    case 'pnpm-lock.yaml':
      return 'pnpm';
    case 'package-lock.json':
      return 'npm';
    case 'yarn.lock':
      return 'yarn';
    case 'bun.lock':
    case 'bun.lockb':
      return 'bun';
    default:
      return undefined;
  }
}

async function detectRepoPackageManager(projectDir: string): Promise<RepoPackageManagerInfo> {
  const info: RepoPackageManagerInfo = {
    lockfiles: detectLockfiles(projectDir),
  };

  const packageJsonPath = join(projectDir, 'package.json');
  if (!existsSync(packageJsonPath)) return info;

  try {
    const pkg = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as {
      packageManager?: string;
    };
    const expected = extractPackageManagerName(pkg.packageManager);
    if (expected) {
      info.expected = expected;
      info.source = 'package.json#packageManager';
      return info;
    }
  } catch {
    return info;
  }

  if (info.lockfiles.includes('pnpm-lock.yaml')) return { ...info, expected: 'pnpm', source: 'pnpm-lock.yaml' };
  if (info.lockfiles.includes('package-lock.json')) return { ...info, expected: 'npm', source: 'package-lock.json' };
  if (info.lockfiles.includes('yarn.lock')) return { ...info, expected: 'yarn', source: 'yarn.lock' };
  if (info.lockfiles.includes('bun.lockb') || info.lockfiles.includes('bun.lock')) {
    return { ...info, expected: 'bun', source: info.lockfiles.includes('bun.lockb') ? 'bun.lockb' : 'bun.lock' };
  }

  return info;
}

async function detectRepoScripts(projectDir: string): Promise<RepoScriptsInfo> {
  const packageJsonPath = join(projectDir, 'package.json');
  if (!existsSync(packageJsonPath)) return { scripts: {} };

  try {
    const pkg = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    return {
      scripts: pkg.scripts ?? {},
      source: 'package.json#scripts',
    };
  } catch {
    return { scripts: {} };
  }
}

function extractNodeMajor(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.trim().match(/(\d{1,3})(?:\.\d+){0,2}/);
  return match?.[1];
}

async function detectRepoNodeVersion(projectDir: string): Promise<RepoNodeVersionInfo> {
  const current = process.version;
  const currentMajor = extractNodeMajor(current);
  const files = [
    { path: join(projectDir, '.nvmrc'), source: '.nvmrc' },
    { path: join(projectDir, '.node-version'), source: '.node-version' },
  ];

  for (const file of files) {
    if (!existsSync(file.path)) continue;
    try {
      const expected = (await readFile(file.path, 'utf-8')).trim();
      const expectedMajor = extractNodeMajor(expected);
      return {
        expected,
        source: file.source,
        current,
        matches: Boolean(expectedMajor && currentMajor && expectedMajor === currentMajor),
      };
    } catch {
      // Ignore parse failures and keep checking.
    }
  }

  const packageJsonPath = join(projectDir, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as {
        engines?: { node?: string };
        volta?: { node?: string };
      };
      const expected = pkg.volta?.node ?? pkg.engines?.node;
      if (expected) {
        const expectedMajor = extractNodeMajor(expected);
        return {
          expected,
          source: pkg.volta?.node ? 'package.json#volta.node' : 'package.json#engines.node',
          current,
          matches: Boolean(expectedMajor && currentMajor && expectedMajor === currentMajor),
        };
      }
    } catch {
      // Ignore parse failures.
    }
  }

  return { current, matches: true };
}

function parseDotEnvLines(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.replace(/^export\s+/, ''))
    .map(line => line.split('=')[0]?.trim() ?? '')
    .filter(Boolean);
}

async function detectRepoEnvTemplate(projectDir: string): Promise<RepoEnvTemplateInfo> {
  const templateCandidates = [
    '.env.example',
    '.env.sample',
    '.env.local.example',
  ];
  const configuredCandidates = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.test',
  ];

  const info: RepoEnvTemplateInfo = {
    variable_names: [],
    configured_variables: [],
  };

  for (const candidate of configuredCandidates) {
    const fullPath = join(projectDir, candidate);
    if (!existsSync(fullPath)) continue;
    try {
      info.configured_variables.push(...parseDotEnvLines(await readFile(fullPath, 'utf-8')));
    } catch {
      // Ignore parse failures.
    }
  }
  info.configured_variables = uniqueSorted(info.configured_variables);

  for (const candidate of templateCandidates) {
    const fullPath = join(projectDir, candidate);
    if (!existsSync(fullPath)) continue;
    try {
      info.variable_names = uniqueSorted(parseDotEnvLines(await readFile(fullPath, 'utf-8')));
      info.template_path = candidate;
      return info;
    } catch {
      // Ignore parse failures and keep looking.
    }
  }

  return info;
}

function collectMemoryTexts(entries: FailureMemoryEntry[]): string[] {
  return entries.flatMap(entry => [
    entry.title,
    entry.summary,
    ...entry.prevention_signals,
    ...entry.evidence.flatMap(item => [item.summary, ...item.details]),
  ]);
}

function extractExpectedScriptNames(entries: FailureMemoryEntry[]): string[] {
  const scriptNames = new Set<string>();
  const patterns = [
    /(?:npm|pnpm|yarn|bun)\s+run\s+([a-zA-Z0-9:_-]+)/gi,
    /missing script:?\s*["']?([a-zA-Z0-9:_-]+)["']?/gi,
    /script(?:\s+entry)?\s+["'`]?([a-zA-Z0-9:_-]+)["'`]?/gi,
  ];

  for (const text of collectMemoryTexts(entries)) {
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const script = match[1]?.trim();
        if (script) scriptNames.add(script);
      }
    }
  }

  return [...scriptNames].sort();
}

function extractExpectedEnvVars(entries: FailureMemoryEntry[]): string[] {
  const envVars = new Set<string>();
  const strongNamePattern = /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|URL|ID|PASS|PASSWORD|HOST|PORT))\b/g;
  const explicitPattern = /\b([A-Z][A-Z0-9_]{2,})\b/g;

  for (const text of collectMemoryTexts(entries)) {
    const lower = text.toLowerCase();
    const isEnvText = lower.includes('env') || lower.includes('environment') || lower.includes('api key') || lower.includes('.env');
    if (!isEnvText) continue;

    for (const match of text.matchAll(strongNamePattern)) {
      envVars.add(match[1]);
    }

    if (envVars.size === 0) {
      for (const match of text.matchAll(explicitPattern)) {
        const candidate = match[1];
        if (candidate.length >= 5 && candidate !== 'PATH' && candidate !== 'HOME') {
          envVars.add(candidate);
        }
      }
    }
  }

  return [...envVars].sort();
}

function nextFailureMemoryId(existing: Iterable<string>): string {
  let max = 0;
  for (const id of existing) {
    const match = /^FM-(\d+)$/.exec(id);
    if (!match) continue;
    max = Math.max(max, parseInt(match[1], 10));
  }
  return `FM-${String(max + 1).padStart(3, '0')}`;
}

function renderFailureMemoryOverview(index: FailureMemoryIndex): string {
  const promoted = index.entries.filter(entry => entry.status === 'promoted');
  const candidates = index.entries.filter(entry => entry.status === 'candidate');

  const renderSection = (entries: FailureMemoryEntry[], empty: string): string => {
    if (entries.length === 0) return `${empty}\n`;
    return entries
      .map(entry => {
        const phases = entry.phase_numbers.length > 0 ? entry.phase_numbers.join(', ') : 'unknown';
        return `- [${entry.id}](failure-memory/${entry.id}.md) — ${entry.title} (${entry.evidence_count} evidence, phases: ${phases})`;
      })
      .join('\n') + '\n';
  };

  return `# Failure Memory

This file summarizes persistent failure patterns captured from \`.planning/failure-memory/events.jsonl\`.

## Promoted Memories

${renderSection(promoted, 'No promoted failure memories yet.')}
## Active Candidates

${renderSection(candidates, 'No active candidates yet.')}
`;
}

function renderFailureMemoryEntry(entry: FailureMemoryEntry): string {
  const phasesYaml = entry.phase_numbers.map(phase => `  - "${phase}"`).join('\n');
  const prevention = entry.prevention_signals.length > 0
    ? entry.prevention_signals.map(signal => `- ${signal}`).join('\n')
    : '- No explicit prevention signal captured yet.';
  const evidence = entry.evidence
    .map(item => {
      const location = [item.phase_number ? `Phase ${item.phase_number}` : null, item.plan_id ? `Plan ${item.plan_id}` : null]
        .filter(Boolean)
        .join(' · ');
      const source = item.source_path ? ` (${item.source_path})` : '';
      const details = item.details.length > 0
        ? `\n  Details:\n${item.details.map(detail => `  - ${detail}`).join('\n')}`
        : '';
      return `- ${item.recorded_at}${location ? ` — ${location}` : ''}: ${item.summary}${source}${details}`;
    })
    .join('\n');

  return `---
id: ${entry.id}
status: ${entry.status}
kind: ${entry.kind}
severity: ${entry.severity}
evidence_count: ${entry.evidence_count}
first_seen: ${entry.first_seen_at}
last_seen: ${entry.last_seen_at}
phase_numbers:
${phasesYaml || '  - "unknown"'}
---

# ${entry.id} — ${entry.title}

## Summary

${entry.summary}

## Promotion Status

- Status: ${entry.status}
- Reason: ${entry.promotion_reason ?? 'Not promoted yet.'}

## Prevention Signals

${prevention}

## Evidence

${evidence || '- No evidence samples recorded.'}
`;
}

function extractSection(content: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`(?:^|\\n)##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|\\n---\\s*(?:\\n|$)|$)`, 'i'));
  return match ? match[1].trim() : null;
}

function hasMeaningfulFailureContent(section: string | null): boolean {
  if (!section) return false;
  const normalized = normalizeLines(section).join(' ').toLowerCase();
  if (!normalized) return false;
  return !(
    normalized === 'none' ||
    normalized === 'none.' ||
    normalized === 'none - no issues encountered' ||
    normalized === 'n/a'
  );
}

function extractSelfCheck(content: string): { status: 'PASSED' | 'FAILED'; details: string[] } | null {
  const match = content.match(/(?:^|\n)##\s+Self-Check:\s*(PASSED|FAILED)\s*\n([\s\S]*?)(?=\n##\s+|\n---\s*(?:\n|$)|$)/i);
  if (!match) return null;
  return {
    status: match[1].toUpperCase() as 'PASSED' | 'FAILED',
    details: normalizeLines(match[2]),
  };
}

function parseTableRows(content: string): Array<{ cells: string[]; raw: string }> {
  return content
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return trimmed.startsWith('|') && trimmed.endsWith('|') && !/^\|[-: |]+\|$/.test(trimmed);
    })
    .map(line => ({
      raw: line.trim(),
      cells: line
        .split('|')
        .slice(1, -1)
        .map(cell => cell.trim()),
    }));
}

function parseBlockingAntiPatterns(content: string): ContinueHereRow[] {
  const section = extractSection(content, 'Critical Anti-Patterns');
  if (!section) return [];
  const rows = parseTableRows(section);
  if (rows.length < 2) return [];

  const header = rows[0].cells.map(cell => cell.toLowerCase());
  const patternIdx = header.findIndex(cell => cell === 'pattern');
  const descIdx = header.findIndex(cell => cell === 'description');
  const severityIdx = header.findIndex(cell => cell === 'severity');
  const preventionIdx = header.findIndex(cell => cell.includes('prevention'));
  const dataRows = rows.slice(1);

  return dataRows
    .map(row => ({
      pattern: row.cells[patternIdx] ?? row.cells[0] ?? row.raw,
      description: row.cells[descIdx] ?? '',
      severity: (row.cells[severityIdx] ?? '').toLowerCase(),
      prevention: row.cells[preventionIdx] ?? '',
    }))
    .filter(row => row.severity === 'blocking');
}

async function resolvePhaseDir(projectDir: string, phaseNumber?: string, phaseDir?: string): Promise<string | null> {
  if (phaseDir && existsSync(phaseDir)) return phaseDir;
  if (!phaseNumber) return null;

  const phasesDir = planningPaths(projectDir).phases;
  try {
    const entries = await readdir(phasesDir, { withFileTypes: true });
    const normalized = normalizePhaseName(phaseNumber);
    const match = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .find(entry => phaseTokenMatches(entry, normalized));
    return match ? join(phasesDir, match) : null;
  } catch {
    return null;
  }
}

async function listPhaseFiles(phaseDir: string): Promise<string[]> {
  try {
    return await readdir(phaseDir);
  } catch {
    return [];
  }
}

function extractPlanIdFromSummaryFile(filename: string): string | undefined {
  if (!filename.endsWith('-SUMMARY.md') && filename !== 'SUMMARY.md') return undefined;
  return filename === 'SUMMARY.md' ? undefined : filename.replace(/-SUMMARY\.md$/, '');
}

export async function appendFailureEvents(projectDir: string, events: FailureEvent[]): Promise<FailureMemoryPaths> {
  const paths = failureMemoryPaths(projectDir);
  if (events.length === 0) return paths;

  await mkdir(paths.directory, { recursive: true });
  const existingFingerprints = new Set((await readFailureEvents(projectDir)).map(event => event.fingerprint));
  const uniqueEvents = events.filter(event => {
    if (existingFingerprints.has(event.fingerprint)) return false;
    existingFingerprints.add(event.fingerprint);
    return true;
  });
  if (uniqueEvents.length === 0) return paths;

  const payload = uniqueEvents.map(event => JSON.stringify(event)).join('\n') + '\n';
  await appendFile(paths.events, payload, 'utf-8');
  return paths;
}

export async function recordPlanResultFailure(
  projectDir: string,
  context: FailureEventContext,
  result: PlanResult,
): Promise<FailureEvent[]> {
  if (result.success || !result.error) return [];
  const normalizedPhaseNumber = context.phaseNumber ? normalizePhaseName(context.phaseNumber) : undefined;

  const event = finalizeEvent({
    version: '1.0',
    recorded_at: new Date().toISOString(),
    kind: 'session_error',
    severity: 'blocking',
    phase_number: normalizedPhaseNumber,
    phase_name: context.phaseName,
    phase_dir: context.phaseDir ? toRelativeProjectPath(projectDir, context.phaseDir) : undefined,
    step: context.step,
    plan_id: context.planId,
    session_id: result.sessionId || undefined,
    summary: `Session error during ${context.step ?? 'execution'}: ${result.error.subtype}`,
    details: result.error.messages,
    source: {
      type: 'session_result',
    },
    error_subtype: result.error.subtype,
    total_cost_usd: result.totalCostUsd,
    num_turns: result.numTurns,
    usage: result.usage,
  });

  await appendFailureEvents(projectDir, [event]);
  return [event];
}

export async function collectPhaseArtifactFailureEvents(
  projectDir: string,
  context: FailureEventContext,
): Promise<FailureEvent[]> {
  const normalizedPhaseNumber = context.phaseNumber ? normalizePhaseName(context.phaseNumber) : undefined;
  const phaseDir = await resolvePhaseDir(projectDir, normalizedPhaseNumber, context.phaseDir);
  if (!phaseDir) return [];

  const events: FailureEvent[] = [];
  const phaseDirRel = toRelativeProjectPath(projectDir, phaseDir);
  const phaseFiles = await listPhaseFiles(phaseDir);
  const summaryFiles = phaseFiles.filter(file => file.endsWith('-SUMMARY.md') || file === 'SUMMARY.md').sort();

  for (const summaryFile of summaryFiles) {
    const fullPath = join(phaseDir, summaryFile);
    let content = '';
    try {
      content = await readFile(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const planId = extractPlanIdFromSummaryFile(summaryFile);
    const issuesSection = extractSection(content, 'Issues Encountered');
    if (hasMeaningfulFailureContent(issuesSection)) {
      const details = normalizeLines(issuesSection ?? '');
      events.push(finalizeEvent({
        version: '1.0',
        recorded_at: new Date().toISOString(),
        kind: 'summary_issue',
        severity: 'advisory',
        phase_number: normalizedPhaseNumber,
        phase_name: context.phaseName,
        phase_dir: phaseDirRel,
        plan_id: planId,
        summary: `Execution issues recorded in ${summaryFile}`,
        details,
        source: {
          type: 'summary',
          path: toRelativeProjectPath(projectDir, fullPath),
        },
      }));
    }

    const selfCheck = extractSelfCheck(content);
    if (selfCheck?.status === 'FAILED') {
      events.push(finalizeEvent({
        version: '1.0',
        recorded_at: new Date().toISOString(),
        kind: 'summary_self_check',
        severity: 'blocking',
        phase_number: normalizedPhaseNumber,
        phase_name: context.phaseName,
        phase_dir: phaseDirRel,
        plan_id: planId,
        summary: `Self-check failed in ${summaryFile}`,
        details: selfCheck.details,
        source: {
          type: 'summary',
          path: toRelativeProjectPath(projectDir, fullPath),
        },
      }));
    }
  }

  const verificationFiles = phaseFiles
    .filter(file => file.endsWith('-VERIFICATION.md') || file === 'VERIFICATION.md')
    .sort();
  const verificationFile = verificationFiles[0];
  if (verificationFile && normalizedPhaseNumber) {
    const verificationPath = join(phaseDir, verificationFile);
    try {
      const verification = await checkVerificationStatus([normalizedPhaseNumber], projectDir);
      const verificationData = verification.data as {
        status?: string;
        gaps?: string[];
        human_items?: string[];
        deferred?: string[];
      };
      const status = verificationData.status ?? 'missing';
      if (status !== 'pass' && status !== 'missing') {
        const details = [
          ...(verificationData.gaps ?? []),
          ...(verificationData.human_items ?? []),
          ...(verificationData.deferred ?? []),
        ];
        events.push(finalizeEvent({
          version: '1.0',
          recorded_at: new Date().toISOString(),
          kind: 'verification_status',
          severity: status === 'human_needed' ? 'advisory' : 'blocking',
          phase_number: normalizedPhaseNumber,
          phase_name: context.phaseName,
          phase_dir: phaseDirRel,
          summary: `Verification status is ${status}`,
          details,
          source: {
            type: 'verification',
            path: toRelativeProjectPath(projectDir, verificationPath),
          },
          status,
        }));
      } else {
        const raw = await readFile(verificationPath, 'utf-8');
        const fm = extractFrontmatterLeading(raw) as { status?: string };
        if (fm.status && fm.status !== 'passed') {
          events.push(finalizeEvent({
            version: '1.0',
            recorded_at: new Date().toISOString(),
            kind: 'verification_status',
            severity: fm.status === 'human_needed' ? 'advisory' : 'blocking',
            phase_number: normalizedPhaseNumber,
            phase_name: context.phaseName,
            phase_dir: phaseDirRel,
            summary: `Verification frontmatter status is ${fm.status}`,
            details: [],
            source: {
              type: 'verification',
              path: toRelativeProjectPath(projectDir, verificationPath),
            },
            status: fm.status,
          }));
        }
      }
    } catch {
      // Ignore verification parsing failures — capture should never block the phase flow.
    }
  }

  const continueHereCandidates = [
    join(phaseDir, '.continue-here.md'),
    join(planningPaths(projectDir).planning, '.continue-here.md'),
    join(projectDir, '.continue-here.md'),
  ];
  const seenContinueHere = new Set<string>();

  for (const candidate of continueHereCandidates) {
    if (seenContinueHere.has(candidate) || !existsSync(candidate)) continue;
    seenContinueHere.add(candidate);

    let content = '';
    try {
      content = await readFile(candidate, 'utf-8');
    } catch {
      continue;
    }

    const antiPatterns = parseBlockingAntiPatterns(content);
    for (const antiPattern of antiPatterns) {
      events.push(finalizeEvent({
        version: '1.0',
        recorded_at: new Date().toISOString(),
        kind: 'blocking_antipattern',
        severity: 'blocking',
        phase_number: normalizedPhaseNumber,
        phase_name: context.phaseName,
        phase_dir: phaseDirRel,
        summary: `Blocking anti-pattern: ${antiPattern.pattern}`,
        details: [antiPattern.description, antiPattern.prevention].filter(Boolean),
        source: {
          type: 'continue_here',
          path: toRelativeProjectPath(projectDir, candidate),
        },
      }));
    }
  }

  return events;
}

export async function recordPhaseArtifactFailureEvents(
  projectDir: string,
  context: FailureEventContext,
): Promise<FailureEvent[]> {
  const events = await collectPhaseArtifactFailureEvents(projectDir, context);
  await appendFailureEvents(projectDir, events);
  return events;
}

export async function promoteFailureMemory(
  projectDir: string,
  phaseNumber?: string,
): Promise<FailurePromotionResult> {
  const paths = failureMemoryPaths(projectDir);
  await mkdir(paths.directory, { recursive: true });

  const normalizedPhaseNumber = phaseNumber ? normalizePhaseName(phaseNumber) : undefined;
  const events = await readFailureEvents(projectDir);
  const existingIndex = await readFailureMemoryIndex(projectDir);
  const existingIds = new Set(existingIndex?.entries.map(entry => entry.id) ?? []);
  const idBySignature = new Map<string, string>(
    (existingIndex?.entries ?? []).map(entry => [entry.signature, entry.id]),
  );

  const groups = new Map<string, FailureEvent[]>();
  for (const event of events) {
    const signature = buildFailureSignature(event);
    const existing = groups.get(signature) ?? [];
    existing.push(event);
    groups.set(signature, existing);
  }

  const entries = [...groups.entries()]
    .map(([signature, groupedEvents]) => {
      const sortedEvents = [...groupedEvents].sort(
        (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
      );
      const firstEvent = sortedEvents[0];
      let id = idBySignature.get(signature);
      if (!id) {
        id = nextFailureMemoryId(existingIds);
        existingIds.add(id);
        idBySignature.set(signature, id);
      }

      const promotion = determinePromotionStatus(sortedEvents);
      return {
        version: '1.0' as const,
        id,
        signature,
        title: buildFailureTitle(firstEvent),
        kind: firstEvent.kind,
        severity: sortedEvents.some(event => event.severity === 'blocking') ? 'blocking' : 'advisory',
        status: promotion.status,
        summary: buildFailureSummary(firstEvent),
        evidence_count: sortedEvents.length,
        first_seen_at: sortedEvents[0].recorded_at,
        last_seen_at: sortedEvents[sortedEvents.length - 1].recorded_at,
        phase_numbers: uniqueSorted(sortedEvents.map(event => event.phase_number)),
        source_paths: uniqueSorted(sortedEvents.map(event => event.source.path)),
        prevention_signals: collectPreventionSignals(sortedEvents),
        promotion_reason: promotion.reason,
        evidence: limitEvidenceSamples(sortedEvents),
      } satisfies FailureMemoryEntry;
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'promoted' ? -1 : 1;
      return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
    });

  const index: FailureMemoryIndex = {
    version: '1.0',
    updated_at: new Date().toISOString(),
    entries,
  };

  await writeFile(paths.index, JSON.stringify(index, null, 2) + '\n', 'utf-8');
  await writeFile(paths.overview, renderFailureMemoryOverview(index), 'utf-8');

  for (const entry of entries) {
    await writeFile(failureMemoryEntryPath(projectDir, entry.id), renderFailureMemoryEntry(entry), 'utf-8');
  }

  const touchedEntries = normalizedPhaseNumber
    ? entries.filter(entry => entry.phase_numbers.includes(normalizedPhaseNumber))
    : entries;

  return {
    paths,
    index,
    touched_entry_ids: touchedEntries.map(entry => entry.id),
    promoted_entry_ids: touchedEntries.filter(entry => entry.status === 'promoted').map(entry => entry.id),
    candidate_entry_ids: touchedEntries.filter(entry => entry.status === 'candidate').map(entry => entry.id),
  };
}

export async function runFailurePreflight(projectDir: string): Promise<FailurePreflightResult> {
  const index = await readFailureMemoryIndex(projectDir);
  if (!index) {
    return {
      checks: [],
      blockers: [],
      warnings: [],
      passed: true,
      related_memory_ids: [],
    };
  }

  const promoted = index.entries.filter(entry => entry.status === 'promoted');
  const checks: FailurePreflightCheck[] = [];
  const relatedMemoryIds = new Set<string>();

  const packageManagerEntries = promoted.filter(entry =>
    hasAnyNeedle(entry, ['package manager', 'pnpm', 'npm', 'yarn', 'bun', 'lockfile']),
  );
  if (packageManagerEntries.length > 0) {
    packageManagerEntries.forEach(entry => relatedMemoryIds.add(entry.id));
    const pkg = await detectRepoPackageManager(projectDir);
    const details: string[] = [];
    let status: FailurePreflightCheckStatus = 'warn';
    let summary = 'Package manager drift was seen before; prefer the repo-declared tool.';

    if (pkg.expected) {
      details.push(`Expected package manager: ${pkg.expected} (${pkg.source ?? 'detected'})`);
      summary = `Use ${pkg.expected} for install/test/build commands in this repo.`;
      status = 'pass';
    } else {
      details.push('No explicit package manager detected from package.json or lockfiles.');
    }

    if (pkg.lockfiles.length > 1) {
      status = 'warn';
      details.push(`Multiple lockfiles present: ${pkg.lockfiles.join(', ')}`);
    } else if (pkg.lockfiles.length === 1) {
      details.push(`Detected lockfile: ${pkg.lockfiles[0]}`);
      const lockfileManager = packageManagerForLockfile(pkg.lockfiles[0]);
      if (pkg.expected && lockfileManager && lockfileManager !== pkg.expected) {
        status = 'warn';
        details.push(`Lockfile implies ${lockfileManager}, which conflicts with expected ${pkg.expected}.`);
      }
    }

    checks.push({
      id: 'package_manager_consistency',
      status,
      summary,
      details,
      memory_ids: packageManagerEntries.map(entry => entry.id),
    });
  }

  const nodeEntries = promoted.filter(entry =>
    hasAnyNeedle(entry, ['node version', 'node mismatch', 'node environment', '.nvmrc', '.node-version', 'engines.node']),
  );
  if (nodeEntries.length > 0) {
    nodeEntries.forEach(entry => relatedMemoryIds.add(entry.id));
    const node = await detectRepoNodeVersion(projectDir);
    const details = [`Current Node runtime: ${node.current}`];
    let status: FailurePreflightCheckStatus = 'warn';
    let summary = 'Node runtime mismatch was seen before; verify runtime before executing.';

    if (node.expected) {
      details.push(`Expected Node version: ${node.expected} (${node.source ?? 'detected'})`);
      if (node.matches) {
        status = 'pass';
        summary = `Current Node runtime matches expected version from ${node.source ?? 'repo config'}.`;
      } else {
        status = 'block';
        summary = `Current Node runtime does not match expected version from ${node.source ?? 'repo config'}.`;
      }
    } else {
      details.push('No explicit Node version file or package.json runtime hint detected.');
    }

    checks.push({
      id: 'node_runtime_alignment',
      status,
      summary,
      details,
      memory_ids: nodeEntries.map(entry => entry.id),
    });
  }

  const scriptEntries = promoted.filter(entry =>
    hasAnyNeedle(entry, ['missing script', 'script not found', 'npm run', 'pnpm run', 'yarn run', 'bun run', 'command entry']),
  );
  if (scriptEntries.length > 0) {
    scriptEntries.forEach(entry => relatedMemoryIds.add(entry.id));
    const scripts = await detectRepoScripts(projectDir);
    const expectedScripts = extractExpectedScriptNames(scriptEntries);
    const details: string[] = [];
    let status: FailurePreflightCheckStatus = 'warn';
    let summary = 'Command-entry failures were seen before; verify required scripts before execution.';

    if (expectedScripts.length > 0) {
      const missingScripts = expectedScripts.filter(script => !(script in scripts.scripts));
      details.push(`Expected scripts from failure memory: ${expectedScripts.join(', ')}`);
      if (missingScripts.length > 0) {
        status = 'block';
        summary = `Missing required package.json scripts: ${missingScripts.join(', ')}.`;
        details.push(`Missing scripts: ${missingScripts.join(', ')}`);
      } else {
        status = 'pass';
        summary = `Previously missing scripts are present in ${scripts.source ?? 'package.json'}.`;
      }
    } else if (Object.keys(scripts.scripts).length > 0) {
      details.push(`Available scripts: ${Object.keys(scripts.scripts).sort().join(', ')}`);
    } else {
      details.push('No package.json scripts detected.');
    }

    checks.push({
      id: 'script_entry_readiness',
      status,
      summary,
      details,
      memory_ids: scriptEntries.map(entry => entry.id),
    });
  }

  const envEntries = promoted.filter(entry =>
    hasAnyNeedle(entry, ['env', 'environment variable', '.env', 'api key', 'missing configuration', 'missing secret']),
  );
  if (envEntries.length > 0) {
    envEntries.forEach(entry => relatedMemoryIds.add(entry.id));
    const envTemplate = await detectRepoEnvTemplate(projectDir);
    const expectedEnvVars = uniqueSorted([
      ...envTemplate.variable_names,
      ...extractExpectedEnvVars(envEntries),
    ]);
    const configured = new Set([
      ...envTemplate.configured_variables,
      ...Object.keys(process.env),
    ]);
    const details: string[] = [];
    let status: FailurePreflightCheckStatus = 'warn';
    let summary = 'Environment setup caused failures before; verify required variables before execution.';

    if (envTemplate.template_path) {
      details.push(`Environment template detected: ${envTemplate.template_path}`);
    }

    if (expectedEnvVars.length > 0) {
      const missingEnvVars = expectedEnvVars.filter(variable => !configured.has(variable));
      details.push(`Expected env vars: ${expectedEnvVars.join(', ')}`);
      if (missingEnvVars.length > 0) {
        summary = `Environment may be incomplete; missing vars: ${missingEnvVars.join(', ')}.`;
        details.push(`Missing env vars: ${missingEnvVars.join(', ')}`);
      } else {
        status = 'pass';
        summary = 'Previously missing environment variables are present.';
      }
    } else {
      details.push('No concrete env var names could be derived from failure memory.');
    }

    checks.push({
      id: 'env_setup_readiness',
      status,
      summary,
      details,
      memory_ids: envEntries.map(entry => entry.id),
    });
  }

  const blockers = checks.filter(check => check.status === 'block');
  const warnings = checks.filter(check => check.status === 'warn');
  const packageManagerCheck = checks.find(check => check.id === 'package_manager_consistency');
  const nodeCheck = checks.find(check => check.id === 'node_runtime_alignment');

  return {
    checks,
    blockers,
    warnings,
    passed: blockers.length === 0,
    recommended_package_manager: packageManagerCheck?.summary.startsWith('Use ')
      ? packageManagerCheck.summary.replace(/^Use\s+(\S+).*/, '$1')
      : undefined,
    expected_node_version: nodeCheck?.details.find(detail => detail.startsWith('Expected Node version: '))
      ?.replace(/^Expected Node version:\s*/, '')
      .replace(/\s+\(.+\)$/, ''),
    related_memory_ids: [...relatedMemoryIds],
  };
}
