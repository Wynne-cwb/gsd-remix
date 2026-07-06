/**
 * Evidence layer for the size-axis router (`route.size-classify`).
 *
 * Design: `.plans/gsd-final-form-design.md` → "两层分类(R2 C1)".
 *
 * This is the DETERMINISTIC half of the router. It emits *evidence only* —
 * risk hits, candidate-file count, distinct high-risk surface count, and
 * unknown signals. It deliberately does NOT decide a lane and does NOT read
 * requirement semantics: the lane recommendation + confidence come from the
 * LLM judgment layer in `gsd-do`, which consumes this evidence.
 *
 * Cheap, time-boxed, no subagent, no full-repo grep — it scans only the user
 * description and the candidate path strings (via the shared `route.risk-scan`
 * lexicon).
 */

import { GSDError, ErrorClassification } from '../errors.js';
import type { QueryHandler } from './utils.js';
import { scanRisk, dominantStrength, parseRiskArgs, type RiskStrength } from './route-risk-scan.js';

/** Words that signal the scope is too thin to classify confidently. */
const VAGUE_HINT = /\b(improve|enhance|fix up|clean up|refactor|revamp|polish|tweak|update|handle|support|better)\b/i;

export interface SizeEvidence {
  risk_hits: ReturnType<typeof scanRisk>;
  max_risk_strength: RiskStrength;
  hard_surfaces: string[];
  surface_count: number;
  candidate_files: { count: number; paths: string[] };
  unknowns: string[];
}

/** Pure evidence computation — shared by the CLI handler and tests. */
export function classifyEvidence(description: string, paths: string[]): SizeEvidence {
  const hits = scanRisk(description, paths);
  const max = dominantStrength(hits);

  // Distinct high-risk surfaces that are actually implicated (ignore noise).
  const implicated = hits.filter(h => h.strength === 'hard' || h.strength === 'soft');
  const hardSurfaces = [...new Set(hits.filter(h => h.strength === 'hard').map(h => h.surface))];
  const surfaceCount = new Set(implicated.map(h => h.surface)).size;

  const unknowns: string[] = [];
  if (paths.length === 0) unknowns.push('no_candidate_files');
  const words = description.trim().split(/\s+/).filter(Boolean);
  if (paths.length === 0 && (words.length < 6 || VAGUE_HINT.test(description))) {
    unknowns.push('vague_scope');
  }

  return {
    risk_hits: hits,
    max_risk_strength: max,
    hard_surfaces: hardSurfaces,
    surface_count: surfaceCount,
    candidate_files: { count: paths.length, paths },
    unknowns,
  };
}

export const routeSizeClassify: QueryHandler = async (args, _projectDir) => {
  const { description, paths } = parseRiskArgs(args);
  if (!description && paths.length === 0) {
    throw new GSDError(
      'route.size-classify requires a description and/or --paths',
      ErrorClassification.Validation,
    );
  }
  return { data: classifyEvidence(description, paths) };
};
