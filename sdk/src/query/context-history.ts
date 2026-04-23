/**
 * Context history query handlers — condensed prior CONTEXT.md history for discuss-phase.
 *
 * Provides a summary-first view of prior phase decisions and specifics so workflows
 * can avoid eagerly loading every historical CONTEXT.md into the main prompt.
 */

import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { GSDError, ErrorClassification } from '../errors.js';
import {
  comparePhaseNum,
  escapeRegex,
  normalizePhaseName,
  phaseTokenMatches,
  planningPaths,
  toPosixPath,
} from './helpers.js';
import { roadmapGetPhase } from './roadmap.js';
import type { QueryHandler } from './utils.js';

interface TopicDecision {
  topic: string;
  decision: string;
}

interface ParsedItems {
  items: string[];
  total: number;
  topics: string[];
  topicDecisions: TopicDecision[];
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'about',
  'have', 'will', 'when', 'then', 'than', 'them', 'they', 'their', 'should',
  'using', 'used', 'only', 'mode', 'area', 'areas', 'phase', 'phases',
  'implementation', 'decisions', 'decision', 'ideas', 'specific', 'specifics',
  'default', 'defaults', 'user', 'users', 'project', 'feature', 'features',
  'output', 'input', 'like', 'want', 'needs', 'ready', 'planning', 'context',
]);

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = raw ? parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function extractTaggedOrHeadingBlock(content: string, tag: string, heading: string): string {
  const tagMatch = content.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (tagMatch) return tagMatch[1].trim();

  const headingRegex = new RegExp(`^##\\s*${escapeRegex(heading)}\\s*$`, 'im');
  const headingMatch = headingRegex.exec(content);
  if (!headingMatch) return '';

  const start = headingMatch.index + headingMatch[0].length;
  const rest = content.slice(start);
  const endMatch = /(?:^##\s+|^<\w+>|^---\s*$)/m.exec(rest);
  return (endMatch ? rest.slice(0, endMatch.index) : rest).trim();
}

function cleanInline(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDecisionText(text: string): string {
  return cleanInline(text.replace(/^\s*-\s*/, ''))
    .replace(/^D-\d+:\s*/i, '')
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

function topicKey(label: string | null): string | null {
  if (!label) return null;
  const normalized = cleanInline(label).toLowerCase();
  if (!normalized || /claude'?s discretion|ai discretion|general/.test(normalized)) {
    return null;
  }
  const tokens = tokenize(normalized);
  if (tokens.length === 0) return null;
  return tokens.join('_');
}

function normalizeDecisionForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pushUnique(target: string[], value: string): void {
  if (value && !target.includes(value)) {
    target.push(value);
  }
}

function formatDecision(area: string | null, text: string): string {
  if (!area) return text;
  return `${area}: ${text}`;
}

function parseDecisionItems(section: string, maxItems: number): ParsedItems {
  const allItems: string[] = [];
  const topics: string[] = [];
  const topicDecisions: TopicDecision[] = [];
  let area: string | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = cleanInline(paragraph.join(' '));
    pushUnique(allItems, formatDecision(area, text));
    if (area) {
      pushUnique(topics, area);
      topicDecisions.push({ topic: area, decision: text });
    }
    paragraph = [];
  };

  for (const line of section.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    if (/^###\s+/.test(trimmed)) {
      flushParagraph();
      area = cleanInline(trimmed.replace(/^###\s+/, ''));
      pushUnique(topics, area);
      continue;
    }
    if (/^##\s+/.test(trimmed) || /^<\/?\w+/.test(trimmed)) {
      flushParagraph();
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      flushParagraph();
      const text = cleanDecisionText(trimmed);
      if (text) {
        pushUnique(allItems, formatDecision(area, text));
        if (area) {
          pushUnique(topics, area);
          topicDecisions.push({ topic: area, decision: text });
        }
      }
      continue;
    }
    paragraph.push(trimmed);
  }

  flushParagraph();
  return {
    items: allItems.slice(0, maxItems),
    total: allItems.length,
    topics,
    topicDecisions,
  };
}

function parseSpecificItems(section: string, maxItems: number): ParsedItems {
  const allItems: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    pushUnique(allItems, cleanInline(paragraph.join(' ')));
    paragraph = [];
  };

  for (const line of section.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    if (/^##\s+/.test(trimmed) || /^###\s+/.test(trimmed) || /^<\/?\w+/.test(trimmed)) {
      flushParagraph();
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      flushParagraph();
      const text = cleanInline(trimmed.replace(/^\s*-\s*/, ''));
      if (text) pushUnique(allItems, text);
      continue;
    }
    paragraph.push(trimmed);
  }

  flushParagraph();
  return {
    items: allItems.slice(0, maxItems),
    total: allItems.length,
    topics: [],
    topicDecisions: [],
  };
}

function extractPhaseName(content: string, dirName: string): string {
  const headingMatch = content.match(/^#\s*Phase\s+[^:]+:\s*(.+?)\s*-\s*Context\s*$/im);
  if (headingMatch) return headingMatch[1].trim();
  const dirMatch = dirName.match(/^[^-]+-(.+)$/);
  return dirMatch ? dirMatch[1] : dirName;
}

function buildWeightedTokens(phaseName: string, goal: string | null): Map<string, number> {
  const weights = new Map<string, number>();
  for (const token of tokenize(phaseName)) {
    weights.set(token, Math.max(weights.get(token) ?? 0, 3));
  }
  for (const token of tokenize(goal ?? '')) {
    weights.set(token, Math.max(weights.get(token) ?? 0, 2));
  }
  return weights;
}

function toRoadmapPhaseArg(phase: string): string {
  const match = phase.match(/^0*(\d+)([A-Z]?)(.*)$/i);
  if (!match) return phase;
  return `${parseInt(match[1], 10)}${match[2]}${match[3]}`;
}

function scoreRelevance(
  currentWeights: Map<string, number>,
  phaseName: string,
  decisions: string[],
  specifics: string[],
  topics: string[],
): { score: number; reasons: string[] } {
  if (currentWeights.size === 0) {
    return { score: 0, reasons: [] };
  }

  const contextTokens = new Set([
    ...tokenize(phaseName),
    ...tokenize(decisions.join(' ')),
    ...tokenize(specifics.join(' ')),
    ...tokenize(topics.join(' ')),
  ]);

  const matched = [...currentWeights.keys()].filter((token) => contextTokens.has(token));
  const matchedWeight = matched.reduce((sum, token) => sum + (currentWeights.get(token) ?? 0), 0);
  const totalWeight = [...currentWeights.values()].reduce((sum, value) => sum + value, 0);
  const score = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;

  matched.sort((a, b) => (currentWeights.get(b) ?? 0) - (currentWeights.get(a) ?? 0) || a.localeCompare(b));
  return {
    score,
    reasons: matched.slice(0, 4),
  };
}

/**
 * context-history — condensed prior CONTEXT.md history for the given phase.
 *
 * Args: `<phase>` [`--limit N`] [`--max-decisions N`] [`--max-specifics N`]
 */
export const contextHistory: QueryHandler = async (args, projectDir) => {
  const phaseArg = args[0];
  if (!phaseArg) {
    throw new GSDError('phase required for context-history', ErrorClassification.Validation);
  }

  const limitIdx = args.indexOf('--limit');
  const maxDecisionsIdx = args.indexOf('--max-decisions');
  const maxSpecificsIdx = args.indexOf('--max-specifics');

  const phaseLimit = limitIdx !== -1
    ? clampInt(args[limitIdx + 1], 8, 1, 200)
    : null;
  const maxDecisions = clampInt(args[maxDecisionsIdx + 1], 3, 1, 10);
  const maxSpecifics = clampInt(args[maxSpecificsIdx + 1], 2, 0, 10);

  const normalizedPhase = normalizePhaseName(phaseArg);
  const phasesDir = planningPaths(projectDir).phases;

  let phaseDirs: string[];
  try {
    const entries: Dirent[] = await readdir(phasesDir, { withFileTypes: true });
    phaseDirs = entries
      .filter((entry: Dirent) => entry.isDirectory())
      .map((entry: Dirent) => entry.name)
      .sort((a: string, b: string) => comparePhaseNum(a, b));
  } catch {
    return {
      data: {
        phase: normalizedPhase,
        prior_contexts: [],
        counts: { phases: 0, decisions: 0, specifics: 0, omitted_phases: 0 },
        error: 'No phases directory found',
      },
    };
  }

  const currentExists = phaseDirs.some((dir) => phaseTokenMatches(dir, normalizedPhase));
  if (!currentExists) {
    return {
      data: {
        phase: normalizedPhase,
        prior_contexts: [],
        counts: { phases: 0, decisions: 0, specifics: 0, omitted_phases: 0 },
        error: 'Phase not found',
      },
    };
  }

  const currentDir = phaseDirs.find((dir) => phaseTokenMatches(dir, normalizedPhase)) ?? normalizedPhase;
  let currentPhaseName = extractPhaseName('', currentDir);
  let currentGoal: string | null = null;
  try {
    const currentPhase = await roadmapGetPhase([toRoadmapPhaseArg(normalizedPhase)], projectDir);
    const phaseData = currentPhase.data as Record<string, unknown>;
    if (phaseData.found === true) {
      currentPhaseName = typeof phaseData.phase_name === 'string' ? phaseData.phase_name : currentPhaseName;
      currentGoal = typeof phaseData.goal === 'string' ? phaseData.goal : null;
    }
  } catch {
    /* roadmap is optional for relevance scoring */
  }

  const currentWeights = buildWeightedTokens(currentPhaseName, currentGoal);
  const priorPhaseDirs = phaseDirs.filter((dir) => comparePhaseNum(dir, normalizedPhase) < 0);
  const priorContexts: Array<Record<string, unknown>> = [];
  let totalDecisions = 0;
  let totalSpecifics = 0;
  const topicHistory = new Map<string, { topic: string; entries: Array<{ phase: string; path: string; decision: string }> }>();

  for (const dir of priorPhaseDirs) {
    const dirPath = join(phasesDir, dir);
    let files: string[];
    try {
      files = await readdir(dirPath);
    } catch {
      continue;
    }

    const contextFile = files
      .filter((file) => file.endsWith('-CONTEXT.md') || file === 'CONTEXT.md')
      .sort()[0];

    if (!contextFile) continue;

    const fullPath = join(dirPath, contextFile);
    let content: string;
    try {
      content = await readFile(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const decisionsBlock = extractTaggedOrHeadingBlock(content, 'decisions', 'Implementation Decisions');
    const specificsBlock = extractTaggedOrHeadingBlock(content, 'specifics', 'Specific Ideas');
    const decisions = parseDecisionItems(decisionsBlock, maxDecisions);
    const specifics = parseSpecificItems(specificsBlock, maxSpecifics);
    const phaseName = extractPhaseName(content, dir);
    const path = toPosixPath(relative(projectDir, fullPath));
    const relevance = scoreRelevance(currentWeights, phaseName, decisions.items, specifics.items, decisions.topics);

    totalDecisions += decisions.total;
    totalSpecifics += specifics.total;

    for (const topicDecision of decisions.topicDecisions) {
      const key = topicKey(topicDecision.topic);
      if (!key) continue;
      if (!topicHistory.has(key)) {
        topicHistory.set(key, { topic: topicDecision.topic, entries: [] });
      }
      topicHistory.get(key)!.entries.push({
        phase: normalizePhaseName(dir),
        path,
        decision: topicDecision.decision,
      });
    }

    priorContexts.push({
      phase: normalizePhaseName(dir),
      phase_name: phaseName,
      path,
      decisions: decisions.items,
      specifics: specifics.items,
      topics: decisions.topics,
      decision_count: decisions.total,
      specific_count: specifics.total,
      has_more_decisions: decisions.total > decisions.items.length,
      has_more_specifics: specifics.total > specifics.items.length,
      relevance_score: relevance.score,
      relevance_reasons: relevance.reasons,
    });
  }

  priorContexts.sort((a, b) => {
    const scoreDiff = Number(b.relevance_score ?? 0) - Number(a.relevance_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return comparePhaseNum(String(b.phase), String(a.phase));
  });

  const selectedPriorContexts = phaseLimit !== null ? priorContexts.slice(0, phaseLimit) : priorContexts;
  const omittedPhases = Math.max(0, priorContexts.length - selectedPriorContexts.length);

  const recurringTopics = [...topicHistory.values()]
    .map((entry) => ({
      topic: entry.topic,
      phase_count: new Set(entry.entries.map((item) => item.phase)).size,
      phases: [...new Set(entry.entries.map((item) => item.phase))],
    }))
    .filter((entry) => entry.phase_count > 1)
    .sort((a, b) => b.phase_count - a.phase_count || a.topic.localeCompare(b.topic))
    .slice(0, 8);

  const conflicts = [...topicHistory.values()]
    .map((entry) => {
      const byPhase = new Map<string, string[]>();
      for (const item of entry.entries) {
        if (!byPhase.has(item.phase)) byPhase.set(item.phase, []);
        byPhase.get(item.phase)!.push(item.decision);
      }
      const distinctDecisions = [...new Set(entry.entries.map((item) => normalizeDecisionForCompare(item.decision)))];
      if (byPhase.size < 2 || distinctDecisions.length < 2) {
        return null;
      }
      const examples = [...byPhase.entries()].slice(0, 3).map(([phase, decisionsForPhase]) => ({
        phase,
        decision: decisionsForPhase[0],
      }));
      return {
        topic: entry.topic,
        phases: [...byPhase.keys()],
        examples,
        requires_source_review: true,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.phases.length - a.phases.length || a.topic.localeCompare(b.topic))
    .slice(0, 8);

  return {
    data: {
      phase: normalizedPhase,
      phase_name: currentPhaseName,
      phase_goal: currentGoal,
      prior_contexts: selectedPriorContexts,
      recurring_topics: recurringTopics,
      conflicts,
      counts: {
        phases: selectedPriorContexts.length,
        decisions: totalDecisions,
        specifics: totalSpecifics,
        omitted_phases: omittedPhases,
      },
    },
  };
};
